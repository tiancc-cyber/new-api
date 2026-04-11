/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  DatePicker,
  Input,
  InputNumber,
  Popover,
  Row,
  Col,
  Radio,
  Select,
  Spin,
  Table,
  Typography,
  Switch,
} from '@douyinfe/semi-ui';
import { IconInfoCircle } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../helpers';
import { ResponsiveBar } from '@nivo/bar';

import { DATE_RANGE_PRESETS } from '../../constants/console.constants';

const { Text } = Typography;

// monitoring config option keys
const OPTION_KEYS = {
  enabled: 'usage_monitor.enabled',
  recipients: 'usage_monitor.recipients',
  userThreshold: 'usage_monitor.user_quota_threshold',
  intervalMinutes: 'usage_monitor.check_interval_minutes',
  alertAutoRefresh: 'usage_monitor.alert_auto_refresh',
  alertRefreshSeconds: 'usage_monitor.alert_refresh_seconds',
  topUsageAutoRefresh: 'usage_monitor.top_usage_auto_refresh',
  topUsageRefreshSeconds: 'usage_monitor.top_usage_refresh_seconds',
};

const DEFAULTS = {
  enabled: false,
  recipients: '',
  userThreshold: 1000000,
  intervalMinutes: 30,
  alertAutoRefresh: false,
  alertRefreshSeconds: 300,
  topUsageAutoRefresh: false,
  topUsageRefreshSeconds: 300,
};

const TopUsersStackedBar = ({ data, t, metric = 'quota' }) => {
  // Transform API data: [{user_id, username, models:{model:{quota,token_used}}}]
  const { rows, keys } = useMemo(() => {
    const keySet = new Set();
    const r = (Array.isArray(data) ? data : []).map((u) => {
      const models = u?.models || {};
      Object.keys(models).forEach((k) => keySet.add(k));
      // Use quota as stack height. (token_used can be added later as tooltip.)
      const row = {
        user: u?.username ? `${u.username} (#${u.user_id})` : `#${u?.user_id ?? '-'}`,
      };
      Object.entries(models).forEach(([modelName, mm]) => {
        const v = metric === 'token_used' ? Number(mm?.token_used || 0) : Number(mm?.quota || 0);
        row[modelName] = v;
      });
      return row;
    });
    const kArr = Array.from(keySet);
    // Ensure Top N are displayed in descending order (by total stack value)
    r.sort((a, b) => {
      const aTotal = kArr.reduce((sum, k) => sum + Number(a?.[k] || 0), 0);
      const bTotal = kArr.reduce((sum, k) => sum + Number(b?.[k] || 0), 0);
      return bTotal - aTotal;
    });
    // For horizontal bar charts, Nivo renders the first item at the bottom.
    // Reverse to make the largest (Top1) appear at the top.
    r.reverse();
    return { rows: r, keys: kArr };
  }, [data, metric]);

  if (!rows || rows.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type='tertiary'>{t('暂无数据')}</Text>
      </div>
    );
  }

  return (
    <ResponsiveBar
      data={rows}
      keys={keys}
      indexBy='user'
      margin={{ top: 10, right: 20, bottom: 60, left: 100 }}
      padding={0.25}
      groupMode='stacked'
      layout='horizontal'
      valueScale={{ type: 'linear' }}
      indexScale={{ type: 'band', round: true }}
      enableGridY={false}
      enableLabel={false}
      axisBottom={{
        legend: metric === 'token_used' ? t('tokens（越大表示 token 使用越多）') : t('quota（越大表示消耗越多）'),
        legendPosition: 'middle',
        legendOffset: 40,
      }}
      axisLeft={{
        tickSize: 5,
        tickPadding: 5,
        tickRotation: 0,
      }}
      tooltip={({ id, value, indexValue }) => (
        <div
          style={{
            padding: 10,
            background: 'rgba(17, 24, 39, 0.95)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            minWidth: 160,
          }}
        >
          <div>
            <strong>{indexValue}</strong>
          </div>
          <div>
            {t('模型')}: {String(id)}
          </div>
          <div>
            {t('用量')}: {Number(value)}
          </div>
        </div>
      )}
    />
  );
};

export default function MonitorManage() {
  const { t } = useTranslation();
  const alertPollingRef = useRef(null);
  const topUsagePollingRef = useRef(null);

  const [monitorOptionsLoading, setMonitorOptionsLoading] = useState(false);
  const [monitorOptions, setMonitorOptions] = useState({
    enabled: DEFAULTS.enabled,
    recipients: DEFAULTS.recipients,
    userThreshold: DEFAULTS.userThreshold,
    intervalMinutes: DEFAULTS.intervalMinutes,
    alertAutoRefresh: DEFAULTS.alertAutoRefresh,
    alertRefreshSeconds: DEFAULTS.alertRefreshSeconds,
    topUsageAutoRefresh: DEFAULTS.topUsageAutoRefresh,
    topUsageRefreshSeconds: DEFAULTS.topUsageRefreshSeconds,
  });

  const [alertLoading, setAlertLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertPage, setAlertPage] = useState(1);
  const [alertPageSize, setAlertPageSize] = useState(20);
  const [alertFilters, setAlertFilters] = useState({
    username: '',
    metric: '',
    status: '',
    dateRange: null,
  });

  const [topUsageLoading, setTopUsageLoading] = useState(false);
  const [topUsageRange, setTopUsageRange] = useState(null);
  const [topUsageTop, setTopUsageTop] = useState(10);
  const [topUsageItems, setTopUsageItems] = useState([]);
  const [topUsageMetric, setTopUsageMetric] = useState('quota');

  // keep latest values for polling closures
  const topUsageRangeRef = useRef(topUsageRange);
  const topUsageTopRef = useRef(topUsageTop);
  useEffect(() => {
    topUsageRangeRef.current = topUsageRange;
  }, [topUsageRange]);
  useEffect(() => {
    topUsageTopRef.current = topUsageTop;
  }, [topUsageTop]);

  const formatUnixSeconds = (val) => {
    if (val === 0) return '1970-01-01 00:00:00';
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '-';
    // Keep a stable date-time format instead of locale-dependent toLocaleString
    const d = new Date(n * 1000);
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const columns = useMemo(
    () => [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        render: (val) => (val ? new Date(val).toLocaleString() : '-'),
      },
      {
        title: t('指标'),
        dataIndex: 'metric',
        render: (val) => (val === 'user_quota' ? t('用户使用量') : val),
      },
      { title: t('用户ID'), dataIndex: 'user_id' },
      { title: t('用户名'), dataIndex: 'username' },
      { title: t('窗口开始'), dataIndex: 'period_start', render: (val) => formatUnixSeconds(val) },
      { title: t('窗口结束'), dataIndex: 'period_end', render: (val) => formatUnixSeconds(val) },
      { title: t('使用量'), dataIndex: 'used_quota' },
      { title: t('阈值'), dataIndex: 'threshold_quota' },
      { title: t('收件人'), dataIndex: 'recipients' },
      { title: t('状态'), dataIndex: 'status' },
      {
        title: t('错误'),
        dataIndex: 'error',
        render: (val) => (
          <Text type='tertiary' style={{ maxWidth: 260 }} ellipsis={{ showTooltip: true }}>
            {val || '-'}
          </Text>
        ),
      },
    ],
    [t],
  );

  const loadAlerts = async (nextQuery) => {
	  setAlertLoading(true);
	  try {
      const q = nextQuery || {
        page: alertPage,
        page_size: alertPageSize,
        ...alertFilters,
      };

      // dateRange -> created_start/created_end (unix seconds)
      if (Array.isArray(q.dateRange) && q.dateRange.length === 2) {
        const [start, end] = q.dateRange;
        const startDate = start ? new Date(start) : null;
        const endDate = end ? new Date(end) : null;
        if (startDate && !Number.isNaN(startDate.getTime())) {
          q.created_start = Math.floor(startDate.getTime() / 1000);
        }
        if (endDate && !Number.isNaN(endDate.getTime())) {
          q.created_end = Math.floor(endDate.getTime() / 1000);
        }
      }
      delete q.dateRange;

      // Remove empty values
      Object.keys(q).forEach((k) => {
        if (q[k] === '' || q[k] === null || q[k] === undefined) delete q[k];
      });

      const res = await API.get('/api/monitor/usage/alerts', { params: q });
      const { success, data, message } = res.data || {};
      if (!success) {
        showError(message || t('加载失败'));
        return;
      }

      //兼容两种返回：
      //  1) legacy: data = []
      //  2) paged:  data = { items, total, page, page_size }
      if (Array.isArray(data)) {
        setAlerts(data);
        setAlertTotal(data.length);
      } else {
        setAlerts(Array.isArray(data?.items) ? data.items : []);
        setAlertTotal(Number(data?.total || 0));
        if (data?.page) setAlertPage(Number(data.page));
        if (data?.page_size) setAlertPageSize(Number(data.page_size));
      }
	  } catch (e) {
	    showError(t('加载失败，请重试'));
	  } finally {
	    setAlertLoading(false);
	  }
  };

  const loadMonitorOptions = async () => {
    setMonitorOptionsLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, data, message } = res.data || {};
      if (!success) {
        showError(message || t('加载失败'));
        return;
      }
      const list = Array.isArray(data) ? data : [];
      const map = {};
      for (const o of list) {
        if (o && o.key) map[o.key] = o.value;
      }

      const enabledRaw = map[OPTION_KEYS.enabled];
      const recipientsRaw = map[OPTION_KEYS.recipients];
      const thresholdRaw = map[OPTION_KEYS.userThreshold];
      const intervalRaw = map[OPTION_KEYS.intervalMinutes];
      const alertAutoRefreshRaw = map[OPTION_KEYS.alertAutoRefresh];
      const refreshRaw = map[OPTION_KEYS.alertRefreshSeconds];
      const topUsageAutoRefreshRaw = map[OPTION_KEYS.topUsageAutoRefresh];
      const topUsageRefreshRaw = map[OPTION_KEYS.topUsageRefreshSeconds];

      setMonitorOptions({
        enabled: enabledRaw === undefined || enabledRaw === '' ? DEFAULTS.enabled : String(enabledRaw) === 'true',
        recipients: recipientsRaw === undefined || recipientsRaw === null ? DEFAULTS.recipients : String(recipientsRaw),
        userThreshold:
          thresholdRaw === undefined || thresholdRaw === '' ? DEFAULTS.userThreshold : Number(thresholdRaw || 0),
        intervalMinutes:
          intervalRaw === undefined || intervalRaw === '' ? DEFAULTS.intervalMinutes : Number(intervalRaw || 0),
        alertAutoRefresh:
          alertAutoRefreshRaw === undefined || alertAutoRefreshRaw === ''
            ? DEFAULTS.alertAutoRefresh
            : String(alertAutoRefreshRaw) === 'true',
        alertRefreshSeconds:
          refreshRaw === undefined || refreshRaw === '' ? DEFAULTS.alertRefreshSeconds : Number(refreshRaw || 0),
        topUsageAutoRefresh:
          topUsageAutoRefreshRaw === undefined || topUsageAutoRefreshRaw === ''
            ? DEFAULTS.topUsageAutoRefresh
            : String(topUsageAutoRefreshRaw) === 'true',
        topUsageRefreshSeconds:
          topUsageRefreshRaw === undefined || topUsageRefreshRaw === ''
            ? DEFAULTS.topUsageRefreshSeconds
            : Number(topUsageRefreshRaw || 0),
      });
    } catch (e) {
      showError(t('加载失败，请重试'));
    } finally {
      setMonitorOptionsLoading(false);
    }
  };

  const saveMonitorOptions = async () => {
    setMonitorOptionsLoading(true);
    try {
      const payload = {
        options: [
          { key: OPTION_KEYS.enabled, value: String(!!monitorOptions.enabled) },
          { key: OPTION_KEYS.recipients, value: String(monitorOptions.recipients || '') },
          { key: OPTION_KEYS.userThreshold, value: String(Number(monitorOptions.userThreshold || 0)) },
          { key: OPTION_KEYS.intervalMinutes, value: String(Math.max(1, Number(monitorOptions.intervalMinutes || 1))) },
          { key: OPTION_KEYS.alertAutoRefresh, value: String(!!monitorOptions.alertAutoRefresh) },
          { key: OPTION_KEYS.alertRefreshSeconds, value: String(Math.max(10, Number(monitorOptions.alertRefreshSeconds || 10))) },
          { key: OPTION_KEYS.topUsageAutoRefresh, value: String(!!monitorOptions.topUsageAutoRefresh) },
          {
            key: OPTION_KEYS.topUsageRefreshSeconds,
            value: String(Math.max(10, Number(monitorOptions.topUsageRefreshSeconds || 10))),
          },
        ],
      };
      const res = await API.put('/api/option/batch', payload);
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('保存失败'));
        return;
      }
      showSuccess(t('保存成功'));
      // reload after save to ensure UI reflects DB state
      await loadMonitorOptions();
    } catch (e) {
      showError(t('保存失败，请重试'));
    } finally {
      setMonitorOptionsLoading(false);
    }
  };

  const loadTopUsersModelUsage = async (params) => {
    setTopUsageLoading(true);
    try {
      const p = params || { top: topUsageTop };
      if (Array.isArray(p.dateRange) && p.dateRange.length === 2) {
        const [start, end] = p.dateRange;
        const startDate = start ? new Date(start) : null;
        const endDate = end ? new Date(end) : null;
        if (startDate && !Number.isNaN(startDate.getTime())) {
          p.start_timestamp = Math.floor(startDate.getTime() / 1000);
        }
        if (endDate && !Number.isNaN(endDate.getTime())) {
          p.end_timestamp = Math.floor(endDate.getTime() / 1000);
        }
      }
      delete p.dateRange;
      Object.keys(p).forEach((k) => {
        if (p[k] === '' || p[k] === null || p[k] === undefined) delete p[k];
      });

      const res = await API.get('/api/data/top_users_model_usage', { params: p });
      const { success, data, message } = res.data || {};
      if (!success) {
        showError(message || t('加载失败'));
        return;
      }
      setTopUsageItems(Array.isArray(data) ? data : []);
    } catch (e) {
      showError(t('加载失败，请重试'));
    } finally {
      setTopUsageLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await loadMonitorOptions();
      loadAlerts();
    })();

    // alert polling is handled by a dedicated effect below (depends on loaded options)

    // Default top usage time range: last 24h
    const now = Date.now();
    const defaultRange = [new Date(now - 24 * 3600 * 1000), new Date(now)];
    setTopUsageRange(defaultRange);

    // Default alert time range: last 24h (same as Top chart)
    setAlertFilters((prev) => ({ ...prev, dateRange: defaultRange }));
    // do not call loadTopUsersModelUsage here with defaultRange to avoid racing with user interaction;
    // the polling effect below will pick up the latest range.

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Top usage auto refresh: always use the latest selected range/top.
  useEffect(() => {
    if (!Array.isArray(topUsageRange) || topUsageRange.length !== 2) {
      return;
    }

    // load once immediately when range/top becomes ready
    loadTopUsersModelUsage({ dateRange: topUsageRange, top: topUsageTop });

    // auto refresh
    if (topUsagePollingRef.current) {
      clearInterval(topUsagePollingRef.current);
      topUsagePollingRef.current = null;
    }
    if (monitorOptions.topUsageAutoRefresh) {
      topUsagePollingRef.current = setInterval(() => {
        const r = topUsageRangeRef.current;
        const topN = topUsageTopRef.current;
        if (!Array.isArray(r) || r.length !== 2) return;
        loadTopUsersModelUsage({ dateRange: r, top: topN });
      }, Math.max(10, Number(monitorOptions.topUsageRefreshSeconds || DEFAULTS.topUsageRefreshSeconds)) * 1000);
    }

    return () => {
      if (topUsagePollingRef.current) {
        clearInterval(topUsagePollingRef.current);
        topUsagePollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topUsageRange, topUsageTop, monitorOptions.topUsageRefreshSeconds, monitorOptions.topUsageAutoRefresh]);

  // Recreate alert polling interval after options are loaded/changed.
  useEffect(() => {
    // keep a dedicated effect so future changes can adjust interval if needed
    if (alertPollingRef.current) {
      clearInterval(alertPollingRef.current);
      alertPollingRef.current = null;
    }

    if (monitorOptions.alertAutoRefresh) {
      const pollMs = Math.max(10, Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds)) * 1000;
      alertPollingRef.current = setInterval(() => {
        loadAlerts();
      }, pollMs);
    }
    return () => {
      if (alertPollingRef.current) {
        clearInterval(alertPollingRef.current);
        alertPollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorOptions.alertRefreshSeconds, monitorOptions.alertAutoRefresh]);

  useEffect(() => {
    return () => {
      if (alertPollingRef.current) clearInterval(alertPollingRef.current);
      if (topUsagePollingRef.current) clearInterval(topUsagePollingRef.current);
    };
  }, []);

  useEffect(() => {
    // When paging changes, reload alert list.
    loadAlerts({ page: alertPage, page_size: alertPageSize, ...alertFilters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertPage, alertPageSize]);

  return (
    <div className='mt-[60px] px-2'>
      <Spin spinning={false}>
        <Card
          title={t('监控配置')}
          style={{ marginBottom: 12 }}
          headerStyle={{ fontWeight: 600 }}
          headerExtraContent={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button type='primary' onClick={saveMonitorOptions} loading={monitorOptionsLoading}>
                {t('保存')}
              </Button>
              <Button type='tertiary' onClick={loadMonitorOptions} loading={monitorOptionsLoading}>
                {t('刷新')}
              </Button>
            </div>
          }
        >
          <Spin spinning={monitorOptionsLoading}>
            <Row gutter={[12, 12]} align='middle'>
              <Col xs={24} md={6}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('是否启用监控')}</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Switch
                      checked={!!monitorOptions.enabled}
                      onChange={(v) => setMonitorOptions((prev) => ({ ...prev, enabled: !!v }))}
                    />
                    <Text type='tertiary'>
                      {monitorOptions.enabled ? t('已启用') : t('已关闭')}
                    </Text>
                  </div>
                </div>
              </Col>

              <Col xs={24} md={10}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('告警收件人（多个邮箱用 ; 或 , 分隔，空则不发送）')}</Text>
                  <Input
                    value={monitorOptions.recipients}
                    onChange={(v) => setMonitorOptions((prev) => ({ ...prev, recipients: v }))}
                    placeholder={t('例如：admin@example.com;ops@example.com')}
                    showClear
                  />
                </div>
              </Col>

              <Col xs={12} md={4}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('用户使用量阈值（quota）')}</Text>
                  <InputNumber
                    value={Number(monitorOptions.userThreshold || 0)}
                    min={0}
                    step={1}
                    onChange={(v) => setMonitorOptions((prev) => ({ ...prev, userThreshold: Number(v || 0) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </Col>

              <Col xs={12} md={4}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('定时统计间隔（分钟）')}</Text>
                  <InputNumber
                    value={Number(monitorOptions.intervalMinutes || DEFAULTS.intervalMinutes)}
                    min={1}
                    step={1}
                    onChange={(v) =>
                      setMonitorOptions((prev) => ({ ...prev, intervalMinutes: Math.max(1, Number(v || 1)) }))
                    }
                    style={{ width: '100%' }}
                  />
                </div>
              </Col>
            </Row>

            <div style={{ marginTop: 10 }}>
              <Row gutter={[12, 12]} align='middle'>
                <Col xs={24} md={12}>
                  <div
                    style={{
                      padding: 12,
                      border: '1px solid var(--semi-color-border)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text style={{ fontWeight: 600 }}>{t('告警列表刷新')}</Text>
                      <Text type='tertiary'>{t('支持手动刷新或按间隔自动刷新')}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Switch
                        checked={!!monitorOptions.alertAutoRefresh}
                        onChange={(v) => setMonitorOptions((prev) => ({ ...prev, alertAutoRefresh: !!v }))}
                      />
                      <InputNumber
                        value={Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds)}
                        min={10}
                        step={10}
                        style={{ width: 160 }}
                        onChange={(v) =>
                          setMonitorOptions((prev) => ({ ...prev, alertRefreshSeconds: Math.max(10, Number(v || 10)) }))
                        }
                        disabled={!monitorOptions.alertAutoRefresh}
                        suffix={t('秒')}
                      />
                    </div>
                  </div>
                </Col>

                <Col xs={24} md={12}>
                  <div
                    style={{
                      padding: 12,
                      border: '1px solid var(--semi-color-border)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text style={{ fontWeight: 600 }}>{t('Top10 刷新')}</Text>
                      <Text type='tertiary'>{t('仅影响 Top10 图表的自动刷新频率')}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Switch
                        checked={!!monitorOptions.topUsageAutoRefresh}
                        onChange={(v) => setMonitorOptions((prev) => ({ ...prev, topUsageAutoRefresh: !!v }))}
                      />
                      <InputNumber
                        value={Number(monitorOptions.topUsageRefreshSeconds || DEFAULTS.topUsageRefreshSeconds)}
                        min={10}
                        step={10}
                        style={{ width: 160 }}
                        onChange={(v) =>
                          setMonitorOptions((prev) => ({ ...prev, topUsageRefreshSeconds: Math.max(10, Number(v || 10)) }))
                        }
                        disabled={!monitorOptions.topUsageAutoRefresh}
                        suffix={t('秒')}
                      />
                    </div>
                  </div>
                </Col>
              </Row>
            </div>
            <div style={{ marginTop: 8 }}>
              <Text type='tertiary'>
                {t('说明：后端会每隔 N 分钟轮询最近窗口内各用户的 quota 总消耗，超过阈值则会记录告警并尝试发送邮件。')}
              </Text>
            </div>
          </Spin>
        </Card>

        <Card
          title={t('Top 用户模型用量堆叠图')}
          style={{ marginBottom: 12 }}
          headerStyle={{ fontWeight: 600 }}
          headerExtraContent={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text type='tertiary'>{t('指标')}</Text>
                <Radio.Group
                  type='button'
                  value={topUsageMetric}
                  onChange={(e) => setTopUsageMetric(e?.target?.value || 'quota')}
                >
                  <Radio value='quota'>{t('Quota')}</Radio>
                  <Radio value='token_used'>{t('Tokens')}</Radio>
                </Radio.Group>
              </div>
              <DatePicker
                value={topUsageRange}
                onChange={(v) => {
                  setTopUsageRange(v);
                  loadTopUsersModelUsage({ dateRange: v, top: topUsageTop });
                }}
                type='dateTimeRange'
                placeholder={[t('开始时间'), t('结束时间')]}
                showClear
                style={{ width: 360 }}
              />
              <InputNumber
                value={topUsageTop}
                min={1}
                max={50}
                step={1}
                suffix={t('人')}
                onChange={(v) => {
                  const n = Number(v || 10);
                  setTopUsageTop(n);
                }}
                style={{ width: 180 }}
              />
              <Button
                type='tertiary'
                onClick={() => loadTopUsersModelUsage({ dateRange: topUsageRange, top: topUsageTop })}
                loading={topUsageLoading}
              >
                {t('刷新')}
              </Button>
            </div>
          }
        >
          <div style={{ marginTop: 8 }}>
            <Text type='tertiary'>
              {t('说明：数据来自“使用日志”汇总表（quota_data），按用户汇总后取 Top N，并按模型堆叠展示；页面每分钟自动刷新。')}
            </Text>
            <Popover
                position='top'
                trigger='hover'
                showArrow
                content={
                  <div style={{ maxWidth: 560, lineHeight: '20px' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('口径与说明')}</div>

                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('指标含义')}</div>
                      <ul style={{ paddingLeft: 18, margin: 0 }}>
                        <li>{t('tokens：用量统计单位（模型侧输入/输出 token 数）。')}</li>
                        <li>{t('quota：计费单位（把 tokens 按模型价格/倍率折算后的扣费量）。')}</li>
                      </ul>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('Tokens 来源')}</div>
                      <ul style={{ paddingLeft: 18, margin: 0 }}>
                        <li>
                          {t('优先来自上游返回的 usage（prompt_tokens/completion_tokens/total_tokens）；若上游未返回则可能由系统估算。')}
                        </li>
                      </ul>
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('Quota 来源')}</div>
                      <ul style={{ paddingLeft: 18, margin: 0 }}>
                        <li>
                          {t('写入“使用日志”（logs）时生成：系统会根据模型价格、倍率等配置把 tokens 折算为 quota。')}
                        </li>
                        <li>{t('本图展示的数据来自汇总表（quota_data），按用户与模型聚合后用于 Top N 堆叠展示。')}</li>
                      </ul>
                    </div>
                  </div>
                }
            >
              <Button theme='borderless' type='tertiary' icon={<IconInfoCircle />}>
                {t('口径说明')}
              </Button>
            </Popover>
          </div>
          <Spin spinning={topUsageLoading}>
            <div style={{ height: 360 }}>
              <TopUsersStackedBar data={topUsageItems} t={t} metric={topUsageMetric} />
            </div>
          </Spin>

        </Card>

        <Card
          title={t('告警记录')}
          headerExtraContent={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                type='primary'
                onClick={() => {
                  setAlertPage(1);
                  loadAlerts({ page: 1, page_size: alertPageSize, ...alertFilters });
                }}
                loading={alertLoading}
              >
                {t('查询')}
              </Button>
              <Button
                type='tertiary'
                onClick={() => {
                  const now = Date.now();
                  const defaultRange = [new Date(now - 24 * 3600 * 1000), new Date(now)];
                  const cleared = {
                    username: '',
                    metric: '',
                    status: '',
                    dateRange: defaultRange,
                  };
                  setAlertFilters(cleared);
                  setAlertPage(1);
                  loadAlerts({ page: 1, page_size: alertPageSize, ...cleared });
                }}
                disabled={alertLoading}
              >
                {t('重置')}
              </Button>
              <Button type='tertiary' onClick={() => loadAlerts()} loading={alertLoading}>
                {t('刷新')}
              </Button>
              <Text type='tertiary' style={{ marginLeft: 8 }}>
                {monitorOptions.alertAutoRefresh
                  ? `${t('自动刷新')}: ${Math.max(10, Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds))} ${t('秒')}`
                  : t('手动刷新')}
              </Text>
            </div>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Row gutter={12}>
              <Col xs={24} md={10}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <DatePicker
                    value={alertFilters.dateRange}
                    onChange={(v) => setAlertFilters((prev) => ({ ...prev, dateRange: v }))}
                    type='dateTimeRange'
                    placeholder={[t('开始时间'), t('结束时间')]}
                    showClear
                    presets={DATE_RANGE_PRESETS.map((preset) => ({
                      text: t(preset.text),
                      start: preset.start(),
                      end: preset.end(),
                    }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </Col>
              <Col xs={24} sm={12} md={5}>
                <Input
                  value={alertFilters.username}
                  onChange={(v) => setAlertFilters((prev) => ({ ...prev, username: v }))}
                  placeholder={t('用户名')}
                  showClear
                />
              </Col>
              <Col xs={24} sm={12} md={5}>
                <Select
                  value={alertFilters.metric}
                  onChange={(v) => setAlertFilters((prev) => ({ ...prev, metric: v || '' }))}
                  placeholder={t('指标')}
                  style={{ width: '100%' }}
                  optionList={[
                    { label: t('全部'), value: '' },
                    { label: t('用户使用量'), value: 'user_quota' },
                  ]}
                />
              </Col>
              <Col xs={24} sm={12} md={4}>
                <Select
                  value={alertFilters.status}
                  onChange={(v) => setAlertFilters((prev) => ({ ...prev, status: v || '' }))}
                  placeholder={t('状态')}
                  style={{ width: '100%' }}
                  optionList={[
                    { label: t('全部'), value: '' },
                    { label: t('sent'), value: 'sent' },
                    { label: t('failed'), value: 'failed' },
                    { label: t('skipped'), value: 'skipped' },
                  ]}
                />
              </Col>
            </Row>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text type='tertiary'>
                  {t('提示：留空表示不过滤；点击“查询”后按条件分页查看全站告警记录。')}
                </Text>
                <Popover
                    position='top'
                    trigger='hover'
                    showArrow
                    content={
                      <div style={{ maxWidth: 620, lineHeight: '20px' }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('口径/公式')}</div>

                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('字段口径')}</div>
                          <ul style={{ paddingLeft: 18, margin: 0 }}>
                            <li>{t('“使用量/阈值”的单位为 quota（计费单位）。')}</li>
                            <li>{t('窗口开始/窗口结束：本次统计窗口的起止时间（秒级时间戳），用于限定消费日志范围。')}</li>
                          </ul>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('告警计算公式')}</div>
                          <ul style={{ paddingLeft: 18, margin: 0 }}>
                            <li>
                              {t('用户使用量告警（user_quota）：用户窗口内使用量（quota）= Σ logs.quota（窗口内该用户所有消费日志 quota 求和）。')}
                            </li>
                            <li>{t('当用户窗口内使用量 > 配置阈值（quota）时触发告警记录，并尝试发送邮件。')}</li>
                          </ul>
                        </div>
                      </div>
                    }
                >
                  <Button theme='borderless' type='tertiary' icon={<IconInfoCircle />}>
                    {t('口径/公式')}
                  </Button>
                </Popover>
              </div>
            </div>
          </div>
          <Table
            columns={columns}
            dataSource={alerts}
            pagination={{
              currentPage: alertPage,
              pageSize: alertPageSize,
              total: alertTotal,
              showSizeChanger: true,
              onPageChange: (p) => setAlertPage(p),
              onPageSizeChange: (ps) => {
                setAlertPageSize(ps);
                setAlertPage(1);
              },
            }}
            loading={alertLoading}
            rowKey={(r, idx) => r?.id ?? idx}
          />
        </Card>
      </Spin>
    </div>
  );
}

