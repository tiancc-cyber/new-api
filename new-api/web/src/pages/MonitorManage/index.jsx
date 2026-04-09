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
  Row,
  Col,
  Radio,
  Select,
  Spin,
  Table,
  Typography,
  Switch,
} from '@douyinfe/semi-ui';
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
  alertRefreshSeconds: 'usage_monitor.alert_refresh_seconds',
  topUsageRefreshSeconds: 'usage_monitor.top_usage_refresh_seconds',
};

const DEFAULTS = {
  enabled: true,
  recipients: '',
  userThreshold: 0,
  intervalMinutes: 10,
  alertRefreshSeconds: 120,
  topUsageRefreshSeconds: 60,
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
    alertRefreshSeconds: DEFAULTS.alertRefreshSeconds,
    topUsageRefreshSeconds: DEFAULTS.topUsageRefreshSeconds,
  });

  const [alertLoading, setAlertLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertPage, setAlertPage] = useState(1);
  const [alertPageSize, setAlertPageSize] = useState(20);
  const [alertFilters, setAlertFilters] = useState({
    user_id: '',
    token_id: '',
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
      { title: t('令牌ID'), dataIndex: 'token_id' },
      { title: t('窗口开始'), dataIndex: 'period_start' },
      { title: t('窗口结束'), dataIndex: 'period_end' },
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
      const refreshRaw = map[OPTION_KEYS.alertRefreshSeconds];
      const topUsageRefreshRaw = map[OPTION_KEYS.topUsageRefreshSeconds];

      setMonitorOptions({
        enabled: enabledRaw === undefined || enabledRaw === '' ? DEFAULTS.enabled : String(enabledRaw) === 'true',
        recipients: recipientsRaw === undefined || recipientsRaw === null ? DEFAULTS.recipients : String(recipientsRaw),
        userThreshold:
          thresholdRaw === undefined || thresholdRaw === '' ? DEFAULTS.userThreshold : Number(thresholdRaw || 0),
        intervalMinutes:
          intervalRaw === undefined || intervalRaw === '' ? DEFAULTS.intervalMinutes : Number(intervalRaw || 0),
        alertRefreshSeconds:
          refreshRaw === undefined || refreshRaw === '' ? DEFAULTS.alertRefreshSeconds : Number(refreshRaw || 0),
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
          { key: OPTION_KEYS.alertRefreshSeconds, value: String(Math.max(10, Number(monitorOptions.alertRefreshSeconds || 10))) },
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

    // Poll alert list periodically to reduce user-triggered refresh load.
    // (Backend alert generation is already async; this is only about dashboard refresh.)
    if (alertPollingRef.current) {
      clearInterval(alertPollingRef.current);
      alertPollingRef.current = null;
    }
    const pollMs = Math.max(10, Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds)) * 1000;
    alertPollingRef.current = setInterval(() => {
      loadAlerts();
    }, pollMs);

    // Default top usage time range: last 24h
    const now = Date.now();
    const defaultRange = [new Date(now - 24 * 3600 * 1000), new Date(now)];
    setTopUsageRange(defaultRange);
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

    if (topUsagePollingRef.current) {
      clearInterval(topUsagePollingRef.current);
      topUsagePollingRef.current = null;
    }
    topUsagePollingRef.current = setInterval(() => {
      const r = topUsageRangeRef.current;
      const topN = topUsageTopRef.current;
      if (!Array.isArray(r) || r.length !== 2) return;
      loadTopUsersModelUsage({ dateRange: r, top: topN });
    }, Math.max(10, Number(monitorOptions.topUsageRefreshSeconds || DEFAULTS.topUsageRefreshSeconds)) * 1000);

    return () => {
      if (topUsagePollingRef.current) {
        clearInterval(topUsagePollingRef.current);
        topUsagePollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topUsageRange, topUsageTop, monitorOptions.topUsageRefreshSeconds]);

  // Recreate alert polling interval after options are loaded/changed.
  useEffect(() => {
    // keep a dedicated effect so future changes can adjust interval if needed
    const pollMs = Math.max(10, Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds)) * 1000;
    if (alertPollingRef.current) {
      clearInterval(alertPollingRef.current);
      alertPollingRef.current = null;
    }
    alertPollingRef.current = setInterval(() => {
      loadAlerts();
    }, pollMs);
    return () => {
      if (alertPollingRef.current) {
        clearInterval(alertPollingRef.current);
        alertPollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorOptions.alertRefreshSeconds]);

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
            <Row gutter={12}>
              <Col xs={24} sm={24} md={6}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('是否启用监控')}</Text>
                  <Switch
                    checked={!!monitorOptions.enabled}
                    onChange={(v) => setMonitorOptions((prev) => ({ ...prev, enabled: !!v }))}
                  />
                </div>
              </Col>
              <Col xs={24} sm={24} md={10}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('告警收件人（多个邮箱用 ; 或 , 分隔，空则不发送）')}</Text>
                  <Input
                    value={monitorOptions.recipients}
                    onChange={(v) => setMonitorOptions((prev) => ({ ...prev, recipients: v }))}
                    placeholder={t('例如：admin@example.com;ops@example.com')}
                  />
                </div>
              </Col>
              <Col xs={24} sm={12} md={4}>
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
              <Col xs={24} sm={12} md={4}>
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
              <Col xs={24} sm={12} md={4}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('告警列表刷新间隔（秒）')}</Text>
                  <InputNumber
                    value={Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds)}
                    min={10}
                    step={10}
                    onChange={(v) =>
                      setMonitorOptions((prev) => ({ ...prev, alertRefreshSeconds: Math.max(10, Number(v || 10)) }))
                    }
                    style={{ width: '100%' }}
                  />
                </div>
              </Col>
              <Col xs={24} sm={12} md={4}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('Top10 刷新间隔（秒）')}</Text>
                  <InputNumber
                    value={Number(monitorOptions.topUsageRefreshSeconds || DEFAULTS.topUsageRefreshSeconds)}
                    min={10}
                    step={10}
                    onChange={(v) =>
                      setMonitorOptions((prev) => ({ ...prev, topUsageRefreshSeconds: Math.max(10, Number(v || 10)) }))
                    }
                    style={{ width: '100%' }}
                  />
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 8 }}>
              <Text type='tertiary'>
                {t('说明：后端会每隔 N 分钟轮询最近窗口内各用户的 quota 总消耗，超过阈值则会记录告警并尝试发送邮件。')}
              </Text>
            </div>
          </Spin>
        </Card>

        <Card
          title={t('Top 10 用户模型用量堆叠图')}
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
                disabled
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
          <Spin spinning={topUsageLoading}>
            <div style={{ height: 360 }}>
              <TopUsersStackedBar data={topUsageItems} t={t} metric={topUsageMetric} />
            </div>
          </Spin>
          <div style={{ marginTop: 8 }}>
            <Text type='tertiary'>
              {t('说明：数据来自“使用日志”汇总表（quota_data），按用户汇总后取 Top N，并按模型堆叠展示；页面每分钟自动刷新。')}
            </Text>
          </div>
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
                  const cleared = {
                    user_id: '',
                    token_id: '',
                    metric: '',
                    status: '',
                    dateRange: null,
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
                {t('自动刷新')}: {Math.max(10, Number(monitorOptions.alertRefreshSeconds || DEFAULTS.alertRefreshSeconds))}{' '}
                {t('秒')}
              </Text>
            </div>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Row gutter={12}>
              <Col xs={24} sm={24} md={8}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type='tertiary'>{t('时间范围')}</Text>
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
              <Col xs={24} sm={12} md={6}>
                <Input
                  value={alertFilters.user_id}
                  onChange={(v) => setAlertFilters((prev) => ({ ...prev, user_id: v }))}
                  placeholder={t('用户ID')}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Input
                  value={alertFilters.token_id}
                  onChange={(v) => setAlertFilters((prev) => ({ ...prev, token_id: v }))}
                  placeholder={t('令牌ID')}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
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
              <Col xs={24} sm={12} md={6}>
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
              <Text type='tertiary'>
                {t('提示：留空表示不过滤；点击“查询”后按条件分页查看全站告警记录。')}
              </Text>
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

