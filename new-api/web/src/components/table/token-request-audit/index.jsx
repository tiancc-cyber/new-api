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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Space,
  Tag,
  Typography,
  Tooltip,
} from '@douyinfe/semi-ui';
import { IconEyeOpened, IconSearch } from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../common/ui/CardPro';
import CardTable from '../../common/ui/CardTable';
import TokenRequestAuditDetailSideSheet from './TokenRequestAuditDetailSideSheet';
import {
  copy,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../helpers';
import { ITEMS_PER_PAGE } from '../../../constants/common.constant';
import { DATE_RANGE_PRESETS } from '../../../constants/console.constants';
import { createCardProPagination } from '../../../helpers/utils';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { fetchTokenRequestAuditList } from '../../../helpers/tokenRequestAudit';

const { Text } = Typography;

const formatBytes = (bytes) => {
  const numericValue = Number(bytes || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = numericValue;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const normalizeTimestamp = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === 'number') {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor(parsed / 1000);
};

const buildStatusTag = (statusCode, t) => {
  const value = Number(statusCode || 0);
  let color = 'grey';
  if (value >= 200 && value < 300) {
    color = 'green';
  } else if (value >= 400 && value < 500) {
    color = 'orange';
  } else if (value >= 500) {
    color = 'red';
  }
  return <Tag color={color}>{value || t('未知')}</Tag>;
};

const buildStreamTag = (isStream, t) => (
  <Tag color={isStream ? 'blue' : 'grey'}>
    {isStream ? t('流式') : t('非流式')}
  </Tag>
);

const TokenRequestAuditTable = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const now = new Date();

  const formInitValues = useMemo(
    () => ({
      request_id: '',
      username: '',
      token_name: '',
      model_name: '',
      order_no: '',
      request_path: '',
      user_id: '',
      token_id: '',
      channel_id: '',
      status_code: '',
      is_stream: 'all',
      dateRange: [
        timestamp2string(Math.floor(new Date(now).setHours(0, 0, 0, 0) / 1000)),
        timestamp2string(Math.floor(now.getTime() / 1000 + 3600)),
      ],
    }),
    [],
  );

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [total, setTotal] = useState(0);
  const [formApi, setFormApi] = useState(null);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const getFormValues = useCallback(() => {
    const values = formApi?.getValues?.() || formInitValues;
    const dateRange = Array.isArray(values.dateRange)
      ? values.dateRange
      : formInitValues.dateRange;
    return {
      request_id: values.request_id || '',
      username: values.username || '',
      token_name: values.token_name || '',
      model_name: values.model_name || '',
      order_no: values.order_no || '',
      request_path: values.request_path || '',
      user_id: values.user_id || '',
      token_id: values.token_id || '',
      channel_id: values.channel_id || '',
      status_code: values.status_code || '',
      is_stream: values.is_stream || 'all',
      start_timestamp: normalizeTimestamp(dateRange?.[0]),
      end_timestamp: normalizeTimestamp(dateRange?.[1]),
    };
  }, [formApi, formInitValues]);

  const loadRecords = useCallback(
    async (page = activePage, size = pageSize) => {
      setLoading(true);
      try {
        const values = getFormValues();
        const params = new URLSearchParams({
          p: String(page),
          page_size: String(size),
        });

        [
          'request_id',
          'username',
          'token_name',
          'model_name',
          'order_no',
          'request_path',
          'user_id',
          'token_id',
          'channel_id',
          'status_code',
        ].forEach((field) => {
          if (values[field]) {
            params.set(field, values[field]);
          }
        });

        if (values.start_timestamp) {
          params.set('start_timestamp', String(values.start_timestamp));
        }
        if (values.end_timestamp) {
          params.set('end_timestamp', String(values.end_timestamp));
        }
        if (values.is_stream !== 'all') {
          params.set('is_stream', values.is_stream);
        }

        const res = await fetchTokenRequestAuditList(params.toString());
        const { success, message, data } = res.data;
        if (success) {
          const items = Array.isArray(data?.items) ? data.items : [];
          setRecords(items.map((item) => ({ ...item, key: item.id })));
          setTotal(data?.total || 0);
          setActivePage(page);
          setPageSize(size);
        } else {
          showError(message);
        }
      } catch (error) {
        showError(error);
      } finally {
        setLoading(false);
      }
    },
    [activePage, getFormValues, pageSize],
  );

  useEffect(() => {
    loadRecords(1, pageSize);
  }, []);

  const handlePageChange = (page) => {
    loadRecords(page, pageSize);
  };

  const handlePageSizeChange = (size) => {
    loadRecords(1, size);
  };

  const handleReset = () => {
    if (!formApi) {
      return;
    }
    formApi.reset();
    setTimeout(() => {
      loadRecords(1, pageSize);
    }, 100);
  };

  const handleOpenDetail = (recordId) => {
    setSelectedRecordId(recordId);
    setDetailVisible(true);
  };

  const handleCloseDetail = () => {
    setDetailVisible(false);
    setSelectedRecordId(null);
  };

  const handleCopyRequestId = async (requestId) => {
    if (!requestId) {
      return;
    }
    const success = await copy(requestId);
    if (success) {
      showSuccess(t('已复制到剪贴板'));
    } else {
      showError(t('复制失败'));
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('审计时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 170,
        render: (value) => timestamp2string(value),
      },
      {
        title: t('用户名'),
        dataIndex: 'username',
        key: 'username',
        width: 120,
        render: (value) => value || '-',
      },
      {
        title: t('令牌名称'),
        dataIndex: 'token_name',
        key: 'token_name',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: t('模型名称'),
        dataIndex: 'model_name',
        key: 'model_name',
        width: 160,
        render: (value) => value || '-',
      },
      {
        title: t('订单号'),
        dataIndex: 'order_no',
        key: 'order_no',
        width: 160,
        render: (value) => value || '-',
      },
      {
        title: t('请求路径'),
        dataIndex: 'request_path',
        key: 'request_path',
        width: 220,
        render: (value) => (
          <Tooltip content={value || '-'}>
            <Text
              ellipsis={{ showTooltip: false }}
              style={{ maxWidth: isMobile ? '100%' : 200 }}
            >
              {value || '-'}
            </Text>
          </Tooltip>
        ),
      },
      {
        title: t('请求 ID'),
        dataIndex: 'request_id',
        key: 'request_id',
        width: 200,
        render: (value) => (
          <div className='flex items-center justify-end md:justify-start gap-2'>
            <Tooltip content={value || '-'}>
              <Text
                ellipsis={{ showTooltip: false }}
                style={{ maxWidth: isMobile ? '100%' : 140 }}
              >
                {value || '-'}
              </Text>
            </Tooltip>
            {value ? (
              <Button
                type='tertiary'
                theme='borderless'
                size='small'
                onClick={() => handleCopyRequestId(value)}
              >
                {t('复制')}
              </Button>
            ) : null}
          </div>
        ),
      },
      {
        title: t('渠道'),
        dataIndex: 'channel_name',
        key: 'channel_name',
        width: 160,
        render: (_, record) =>
          record.channel_id > 0
            ? `${record.channel_id}${record.channel_name ? ` - ${record.channel_name}` : ''}`
            : '-',
      },
      {
        title: t('状态码'),
        dataIndex: 'status_code',
        key: 'status_code',
        width: 100,
        render: (value) => buildStatusTag(value, t),
      },
      {
        title: t('是否流式'),
        dataIndex: 'is_stream',
        key: 'is_stream',
        width: 100,
        render: (value) => buildStreamTag(value, t),
      },
      {
        title: t('请求体大小'),
        dataIndex: 'request_body_size',
        key: 'request_body_size',
        width: 120,
        render: (value) => formatBytes(value),
      },
      {
        title: t('响应体大小'),
        dataIndex: 'response_body_size',
        key: 'response_body_size',
        width: 120,
        render: (value) => formatBytes(value),
      },
      {
        title: t('操作'),
        key: 'actions',
        fixed: isMobile ? undefined : 'right',
        width: 120,
        render: (_, record) => (
          <Button
            type='tertiary'
            icon={<IconEyeOpened />}
            size='small'
            onClick={() => handleOpenDetail(record.id)}
          >
            {t('详情')}
          </Button>
        ),
      },
    ],
    [isMobile, t],
  );

  const statsArea = (
    <div className='flex flex-wrap items-center gap-2 text-sm'>
      <Tag color='blue'>{t('令牌请求审计')}</Tag>
      <Text type='secondary'>
        {t('总记录数')}：{total}
      </Text>
      <Text type='secondary'>
        {t('当前页条数')}：{records.length}
      </Text>
    </div>
  );

  const searchArea = (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => setFormApi(api)}
      onSubmit={() => loadRecords(1, pageSize)}
      allowEmpty={true}
      autoComplete='off'
      layout='vertical'
      trigger='change'
      stopValidateWithError={false}
    >
      <div className='flex flex-col gap-2'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
          <div className='col-span-1 lg:col-span-2'>
            <Form.DatePicker
              field='dateRange'
              className='w-full'
              type='dateTimeRange'
              placeholder={[t('开始时间'), t('结束时间')]}
              showClear
              pure
              size='small'
              presets={DATE_RANGE_PRESETS.map((preset) => ({
                text: t(preset.text),
                start: preset.start(),
                end: preset.end(),
              }))}
            />
          </div>
          <Form.Input
            field='request_id'
            prefix={<IconSearch />}
            placeholder={t('请求 ID')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='username'
            prefix={<IconSearch />}
            placeholder={t('用户名')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='token_name'
            prefix={<IconSearch />}
            placeholder={t('令牌名称')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='model_name'
            prefix={<IconSearch />}
            placeholder={t('模型名称')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='order_no'
            prefix={<IconSearch />}
            placeholder={t('订单号')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='request_path'
            prefix={<IconSearch />}
            placeholder={t('请求路径')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='user_id'
            prefix={<IconSearch />}
            placeholder={t('用户 ID')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='token_id'
            prefix={<IconSearch />}
            placeholder={t('令牌 ID')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='channel_id'
            prefix={<IconSearch />}
            placeholder={t('渠道 ID')}
            showClear
            pure
            size='small'
          />
          <Form.Input
            field='status_code'
            prefix={<IconSearch />}
            placeholder={t('状态码')}
            showClear
            pure
            size='small'
          />
          <Form.Select
            field='is_stream'
            optionList={[
              { label: t('全部'), value: 'all' },
              { label: t('流式'), value: 'true' },
              { label: t('非流式'), value: 'false' },
            ]}
            placeholder={t('是否流式')}
            pure
            size='small'
          />
        </div>
        <div className='flex justify-end items-center'>
          <Space>
            <Button
              type='tertiary'
              htmlType='submit'
              loading={loading}
              size='small'
            >
              {t('查询')}
            </Button>
            <Button type='tertiary' onClick={handleReset} size='small'>
              {t('重置')}
            </Button>
          </Space>
        </div>
      </div>
    </Form>
  );

  return (
    <>
      <TokenRequestAuditDetailSideSheet
        visible={detailVisible}
        recordId={selectedRecordId}
        onClose={handleCloseDetail}
        t={t}
      />
      <CardPro
        type='type2'
        statsArea={statsArea}
        searchArea={searchArea}
        paginationArea={createCardProPagination({
          currentPage: activePage,
          pageSize,
          total,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
          isMobile,
          t,
        })}
        t={t}
      >
        <CardTable
          columns={columns}
          dataSource={records}
          rowKey='key'
          loading={loading}
          scroll={isMobile ? undefined : { x: 'max-content' }}
          className='rounded-xl overflow-hidden'
          size='middle'
          empty={
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
              }
              description={t('暂无数据')}
              style={{ padding: 30 }}
            />
          }
          pagination={{
            currentPage: activePage,
            pageSize,
            total,
            pageSizeOptions: [10, 20, 50, 100],
            showSizeChanger: true,
            onPageSizeChange: handlePageSizeChange,
            onPageChange: handlePageChange,
          }}
          hidePagination={true}
        />
      </CardPro>
    </>
  );
};

export default TokenRequestAuditTable;
