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

import React, { useEffect, useMemo, useState } from 'react';
import {
  SideSheet,
  Button,
  Spin,
  Empty,
  Descriptions,
  Tabs,
  Tag,
  Typography,
  Space,
  Divider,
} from '@douyinfe/semi-ui';
import { IconClose } from '@douyinfe/semi-icons';
import { showError, timestamp2string } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { fetchTokenRequestAuditDetail } from '../../../helpers/tokenRequestAudit';
import CodeViewer from '../../playground/CodeViewer';

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

const renderStatusTag = (statusCode, t) => {
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

const renderStreamTag = (isStream, t) => (
  <Tag color={isStream ? 'blue' : 'grey'}>
    {isStream ? t('流式') : t('非流式')}
  </Tag>
);

const joinChunks = (chunks) => {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return '';
  }
  return chunks.map((chunk) => chunk?.content || '').join('');
};

const TokenRequestAuditDetailSideSheet = ({
  visible,
  recordId,
  onClose,
  t,
}) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!visible || !recordId) {
        return;
      }
      setLoading(true);
      try {
        const res = await fetchTokenRequestAuditDetail(recordId);
        const { success, message, data } = res.data;
        if (success) {
          setDetail(data);
        } else {
          showError(message);
        }
      } catch (error) {
        showError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [recordId, visible]);

  useEffect(() => {
    if (!visible) {
      setDetail(null);
      setLoading(false);
    }
  }, [visible]);

  const record = detail?.record;
  const requestContent = useMemo(
    () => joinChunks(detail?.request_chunks),
    [detail?.request_chunks],
  );
  const responseContent = useMemo(
    () => joinChunks(detail?.response_chunks),
    [detail?.response_chunks],
  );

  const metadata = useMemo(() => {
    if (!record) {
      return [];
    }
    return [
      { key: t('审计时间'), value: timestamp2string(record.created_at) },
      { key: t('请求 ID'), value: record.request_id || '-' },
      { key: t('用户名'), value: record.username || '-' },
      { key: t('用户邮箱'), value: record.user_email || '-' },
      { key: t('用户分组'), value: record.user_group || '-' },
      { key: t('令牌 ID'), value: record.token_id ?? '-' },
      { key: t('令牌名称'), value: record.token_name || '-' },
      { key: t('令牌键掩码'), value: record.token_key_masked || '-' },
      { key: t('模型名称'), value: record.model_name || '-' },
      { key: t('订单号'), value: record.order_no || '-' },
      { key: t('请求方式'), value: record.request_method || '-' },
      { key: t('请求路径'), value: record.request_path || '-' },
      { key: t('渠道 ID'), value: record.channel_id ?? '-' },
      { key: t('渠道名称'), value: record.channel_name || '-' },
      { key: t('状态码'), value: renderStatusTag(record.status_code, t) },
      { key: t('是否流式'), value: renderStreamTag(record.is_stream, t) },
      {
        key: t('请求体大小'),
        value: `${formatBytes(record.request_body_size)} (${record.request_body_size || 0} B)`,
      },
      {
        key: t('响应体大小'),
        value: `${formatBytes(record.response_body_size)} (${record.response_body_size || 0} B)`,
      },
      {
        key: t('请求体编码'),
        value: (
          <Space>
            <Tag color='cyan'>{record.request_body_encoding || 'plain'}</Tag>
            <Text type='tertiary'>{record.request_content_type || '-'}</Text>
          </Space>
        ),
      },
      {
        key: t('响应体编码'),
        value: (
          <Space>
            <Tag color='cyan'>{record.response_body_encoding || 'plain'}</Tag>
            <Text type='tertiary'>{record.response_content_type || '-'}</Text>
          </Space>
        ),
      },
      { key: t('请求分片数'), value: record.request_chunk_count ?? 0 },
      { key: t('响应分片数'), value: record.response_chunk_count ?? 0 },
    ];
  }, [record, t]);

  return (
    <SideSheet
      placement='right'
      visible={visible}
      width={isMobile ? '100%' : 880}
      title={t('审计记录详情')}
      closeIcon={
        <Button
          className='semi-button-tertiary semi-button-size-small semi-button-borderless'
          type='button'
          icon={<IconClose />}
          onClick={onClose}
        />
      }
      onCancel={onClose}
      bodyStyle={{ padding: 16 }}
    >
      {loading ? (
        <div className='flex justify-center items-center py-12'>
          <Spin size='large' tip={t('加载中...')} />
        </div>
      ) : !record ? (
        <Empty description={t('暂无数据')} />
      ) : (
        <div className='flex flex-col gap-4'>
          <Descriptions data={metadata} columns={isMobile ? 1 : 2} />
          <Divider margin='8px' />
          <Tabs type='card' defaultActiveKey='request'>
            <Tabs.TabPane tab={t('请求体')} itemKey='request'>
              <div className='flex flex-col gap-2'>
                <Text type='tertiary'>
                  {t('请求体编码')}：{record.request_body_encoding || 'plain'}
                </Text>
                <CodeViewer
                  content={requestContent}
                  title='request'
                  language={
                    (record.request_content_type || '').includes('json')
                      ? 'json'
                      : 'text'
                  }
                />
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('响应体')} itemKey='response'>
              <div className='flex flex-col gap-2'>
                <Text type='tertiary'>
                  {t('响应体编码')}：{record.response_body_encoding || 'plain'}
                </Text>
                <CodeViewer
                  content={responseContent}
                  title='response'
                  language={
                    (record.response_content_type || '').includes('json')
                      ? 'json'
                      : 'text'
                  }
                />
              </div>
            </Tabs.TabPane>
          </Tabs>
        </div>
      )}
    </SideSheet>
  );
};

export default TokenRequestAuditDetailSideSheet;
