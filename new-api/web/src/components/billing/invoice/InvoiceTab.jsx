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
import {
  Button,
  Card,
  Dropdown,
  Input,
  Modal,
  Select,
  Table,
  Toast,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { API } from '../../../helpers';
import { copy, isAdmin } from '../../../helpers/utils.jsx';
import CreateInvoiceModal from './CreateInvoiceModal.jsx';
import { useContainerSize } from '../../../hooks/common/useContainerSize.js';

const { Text } = Typography;

const MAX_SHOW_TRADE_NOS = 2;
const DEFAULT_TABLE_SCROLL_Y = 560;

const InvoiceTab = ({
  page: externalPage,
  pageSize: externalPageSize,
  onPageChange,
  onPageSizeChange,
  onTotalChange,
  appliedStatusFilter: externalAppliedStatusFilter,
  searchSeq,
}) => {
  const { t } = useTranslation();

  const [tradeNoModalVisible, setTradeNoModalVisible] = useState(false);
  const [tradeNoModalItems, setTradeNoModalItems] = useState([]);

  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const invoicePage = externalPage ?? 1;
  const invoicePageSize = externalPageSize ?? 10;

  // Admin: status filter
  const [statusFilter, setStatusFilter] = useState('all');
  const [appliedStatusFilter, setAppliedStatusFilter] = useState('all');

  // If parent provides an applied status filter (for fixed header control),
  // use it directly and hide internal controls.
  // Parent passes appliedStatusFilter as string always; treat empty as 'all'
  const effectiveAppliedStatus =
    typeof externalAppliedStatusFilter === 'string' && externalAppliedStatusFilter
      ? externalAppliedStatusFilter
      : appliedStatusFilter;

  const userIsAdmin = useMemo(() => isAdmin(), []);

  const [createInvoiceVisible, setCreateInvoiceVisible] = useState(false);

  const [tableWrapRef, tableWrapSize] = useContainerSize();
  const lastStableScrollYRef = useRef(DEFAULT_TABLE_SCROLL_Y);
  const tableScrollY = useMemo(() => {
    // Reserve bottom space so the last row isn't covered by scrollbars/overlay scroll.
    const h = Math.floor((tableWrapSize?.height || 0) - 48);
    const next = h > 200 ? h : DEFAULT_TABLE_SCROLL_Y;

    // Guard against resize/layout feedback loops: only accept meaningful changes.
    const prev = lastStableScrollYRef.current;
    const ACCEPT_DELTA = 8; // px
    if (Math.abs(next - prev) >= ACCEPT_DELTA) {
      lastStableScrollYRef.current = next;
      return next;
    }
    return prev;
  }, [tableWrapSize?.height]);

  const tableScroll = useMemo(
    () => ({ y: tableScrollY, x: 'max-content' }),
    [tableScrollY],
  );

  const buildClickableCopy = (value, fallback = '-') => {
    const v = typeof value === 'string' ? value : value?.toString?.() || '';
    if (!v) return <Text type='tertiary'>{fallback}</Text>;
    return (
      <Text
        className='cursor-pointer select-text'
        onClick={async (e) => {
          e?.stopPropagation?.();
          const ok = await copy(v);
          if (ok) {
            Toast.success({ content: t('已复制') });
          } else {
            Toast.error({ content: t('复制失败') });
          }
        }}
      >
        {v}
      </Text>
    );
  };

  const fetchSubjects = async () => {
    try {
      const res = await API.get('/api/invoice/subjects');
      const { success, message } = res.data;
      if (!success) {
        Toast.error({ content: message || t('加载失败') });
        // no need to return
      }
      // subjects 仅用于 CreateInvoiceModal 的下拉候选；此页面不直接渲染主体表。
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        Toast.error({ content: t('请先登录') });
      } else {
        Toast.error({ content: t('发票主体接口暂未开放或请求失败') });
      }
    }
  };

  const fetchInvoices = async (
    p = invoicePage,
    ps = invoicePageSize,
    statusOverride = undefined,
  ) => {
    setInvoicesLoading(true);
    try {
      const st =
        typeof statusOverride === 'string' && statusOverride
          ? statusOverride
          : effectiveAppliedStatus;
      const statusQuery =
        userIsAdmin && st !== 'all' ? `&status=${encodeURIComponent(st)}`
          : '';
      // Admin uses global invoices list (all users).
      const endpoint = userIsAdmin
        ? `/api/invoice/admin/invoices?page=${p}&page_size=${ps}${statusQuery}`
        : `/api/invoice?page=${p}&page_size=${ps}`;
      const res = await API.get(endpoint);
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error({ content: message || t('加载失败') });
        return;
      }
      const raw = data.items || [];
      setInvoices(raw);
      const nextTotal = data.total || 0;
      setInvoiceTotal(nextTotal);
      onTotalChange?.(nextTotal);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        Toast.error({ content: t('请先登录') });
      } else {
        Toast.error({ content: t('发票接口暂未开放或请求失败') });
      }
    } finally {
      setInvoicesLoading(false);
    }
  };

  const updateInvoiceStatus = async (invoiceId, status, errorMessage) => {
    try {
      const payload = { status };
      if (status === 'error') {
        payload.error_message = errorMessage || '';
      }
      const res = await API.patch(
        `/api/invoice/admin/invoices/${invoiceId}/status`,
        payload,
      );
      const { success, message } = res.data;
      if (!success) {
        Toast.error({ content: message || t('更新失败') });
        return false;
      }
      Toast.success({ content: t('更新成功') });
      await fetchInvoices(invoicePage, invoicePageSize);
      return true;
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        t('更新失败');
      Toast.error({ content: msg });
      return false;
    }
  };

  useEffect(() => {
    fetchSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 正常分页刷新：page/pageSize/status 任一变更都刷新
  useEffect(() => {
    fetchInvoices(invoicePage, invoicePageSize, effectiveAppliedStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicePage, invoicePageSize, effectiveAppliedStatus]);

  // 父组件点击“搜索”时，强制从第一页刷新（避免某些情况下仅更新状态但 effect 未触发或与 setState 批处理冲突）
  useEffect(() => {
    if (searchSeq === undefined || searchSeq === null) return;
    fetchInvoices(1, invoicePageSize, effectiveAppliedStatus);
    onPageChange?.(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSeq]);

  // subjects 仅用于“创建发票时选择主体 / 新增主体”，不再单独展示主体表格。

  // 需求：本页不提供“新增主体/创建发票”入口；仅通过充值账单创建

  // subjectColumns 已移除：主体信息已合并展示到发票表格中。

  const invoiceColumns = useMemo(() => {
    const cols = [
      { title: t('ID'), dataIndex: 'id', key: 'id', width: 80 },
      {
        title: t('开票状态'),
        key: 'invoice_status',
        width: 100,
        render: (_, record) => {
          const st = String(record?.status || '').toLowerCase();
          if (st === 'invoiced') {
            return <Text type='success'>{t('已开票')}</Text>;
          }
          if (st === 'error') {
            const msg = record?.error_message || t('请查看详情');
            return (
              <div className='flex flex-col'>
                <Text type='danger'>{t('开票错误')}</Text>
                <Tooltip
                  content={
                    <div style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>
                      {msg}
                    </div>
                  }
                >
                  <Text
                    type='tertiary'
                    size='small'
                    ellipsis={{ showTooltip: false }}
                    style={{ maxWidth: 180 }}
                  >
                    {msg}
                  </Text>
                </Tooltip>
              </div>
            );
          }
          return <Text type='warning'>{t('等待开票')}</Text>;
        },
      },
      { title: t('发票类型'), dataIndex: 'invoice_type', key: 'invoice_type' },
      { title: t('发票内容'), dataIndex: 'invoice_content', key: 'invoice_content' },
      { title: t('抬头类型'), dataIndex: 'title_type', key: 'title_type' },
    ];

    if (userIsAdmin) {
      cols.push({
        title: t('操作'),
        key: 'action',
        width: 140,
        render: (_, record) => {
          const id = record?.id;
          if (!id) return null;
          return (
            <Dropdown
              trigger='click'
              position='bottomLeft'
              render={
                <Dropdown.Menu>
                  <Dropdown.Item
                    onClick={() => updateInvoiceStatus(id, 'pending', undefined)}
                  >
                    {t('标记为等待开票')}
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() => updateInvoiceStatus(id, 'invoiced', undefined)}
                  >
                    {t('标记为已开票')}
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() => {
                      let inputValue = '';
                      Modal.confirm({
                        title: t('标记为开票错误'),
                        content: (
                          <Input
                            placeholder={t('请输入错误信息')}
                            onChange={(v) => {
                              inputValue = v;
                            }}
                          />
                        ),
                        onOk: async () => updateInvoiceStatus(id, 'error', inputValue),
                      });
                    }}
                  >
                    {t('标记为开票错误')}
                  </Dropdown.Item>
                </Dropdown.Menu>
              }
            >
              <Button size='small' theme='outline' type='primary'>
                {t('更新状态')}
              </Button>
            </Dropdown>
          );
        },
      });
    }

    cols.push(
      {
        title: t('抬头名称'),
        key: 'subject',
        render: (_, record) =>
          record?.subject?.title_name || record?.subject_unique_key,
      },
      {
        title: t('单位税号'),
        key: 'subject_tax_no',
        render: (_, record) => {
          const v = record?.subject?.tax_no;
          return buildClickableCopy(v);
        },
      },
      {
        title: t('接收信息'),
        key: 'subject_receive_info',
        render: (_, record) => {
          const v = record?.subject?.receive_info;
          return buildClickableCopy(v);
        },
      },
      {
        title: t('订单号'),
        key: 'trade_nos',
        render: (_, record) => {
          const topups = record?.topups || [];
          const tradeNos = topups
            .map((x) => x?.trade_no)
            .filter((x) => typeof x === 'string' && x.trim().length > 0);
          if (tradeNos.length === 0) return <Text type='tertiary'>-</Text>;

          const shown = tradeNos.slice(0, MAX_SHOW_TRADE_NOS);
          const rest = tradeNos.length - shown.length;

          return (
            <div className='flex flex-col gap-1'>
              {shown.map((no) => (
                <React.Fragment key={no}>{buildClickableCopy(no)}</React.Fragment>
              ))}
              {rest > 0 ? (
                <Button
                  size='small'
                  theme='borderless'
                  onClick={() => {
                    setTradeNoModalItems(tradeNos);
                    setTradeNoModalVisible(true);
                  }}
                >
                  {t('更多')}（{rest}）
                </Button>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('包含账单数'),
        key: 'topup_count',
        render: (_, record) => (record?.topups || []).length,
      },
    );

    return cols;
  }, [t, userIsAdmin, updateInvoiceStatus, buildClickableCopy]);

  return (
    <div
      className='flex flex-col gap-4'
      style={{ height: 'calc(100vh - 180px)', minHeight: 560 }}
    >
      <Modal
        visible={tradeNoModalVisible}
        title={t('订单号')}
        onCancel={() => setTradeNoModalVisible(false)}
        onOk={() => setTradeNoModalVisible(false)}
        width={720}
        style={{ maxWidth: 'calc(100vw - 32px)' }}
        centered
        closable
        closeOnEsc
        maskClosable
        okType='primary'
        icon={null}
        className=''
        cancelLoading={false}
        lazyRender
        cancelText={t('取消')}
        okText={t('确定')}
        afterClose={() => {}}
        hasCancel
        mask
        height={undefined}
        zIndex={undefined}
        direction='ltr'
        okButtonProps={{}}
        motion={true}
        maskStyle={{}}
        bodyStyle={{}}
        getPopupContainer={undefined}
        closeIcon={undefined}
        keepDOM={false}
        maskFixed={false}
        fullScreen={false}
        size={undefined}
        header={undefined}
        getContainerContext={undefined}
        confirmLoading={false}
        cancelButtonProps={{}}
        footerFill={false}
        footer={null}
      >
        {(tradeNoModalItems || []).length === 0 ? (
          <Text type='tertiary'>-</Text>
        ) : (
          <div className='flex flex-col gap-2'>
            {(tradeNoModalItems || []).map((no) => (
              <React.Fragment key={no}>{buildClickableCopy(no)}</React.Fragment>
            ))}
          </div>
        )}
      </Modal>

      <CreateInvoiceModal
        visible={createInvoiceVisible}
        onCancel={() => setCreateInvoiceVisible(false)}
        // 发票页创建：不直接指定 topup_ids（鼓励从账单页选择），因此此入口仅作提示；
        // 为避免误提交，这里传空数组并让弹窗提示 topup_ids 不能为空。
        topupIds={[]}
        onCreated={async () => {
          await fetchInvoices(1, invoicePageSize);
          onPageChange?.(1);
        }}
      />
      <Card
        className='border-0 shadow-sm !rounded-2xl flex-1 overflow-hidden'
        bodyStyle={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Filters area (layout aligned with Channels management style) */}
        {userIsAdmin && typeof externalAppliedStatusFilter !== 'string' ? (
          <div className='flex flex-wrap items-end justify-between gap-2 mb-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                style={{ width: 180 }}
                optionList={[
                  { label: t('全部状态'), value: 'all' },
                  { label: t('等待开票'), value: 'pending' },
                  { label: t('已开票'), value: 'invoiced' },
                  { label: t('开票错误'), value: 'error' },
                ]}
              />
              <Button
                type='primary'
                theme='solid'
                loading={invoicesLoading}
                onClick={async () => {
                  setAppliedStatusFilter(statusFilter);
                  onPageChange?.(1);
                  await fetchInvoices(1, invoicePageSize);
                }}
              >
                {t('搜索')}
              </Button>
              <Button
                theme='outline'
                disabled={
                  statusFilter === 'all' &&
                  appliedStatusFilter === 'all' &&
                  invoicePage === 1
                }
                onClick={async () => {
                  setStatusFilter('all');
                  setAppliedStatusFilter('all');
                  onPageChange?.(1);
                  await fetchInvoices(1, invoicePageSize);
                }}
              >
                {t('重置')}
              </Button>
            </div>
            <Text type='tertiary' size='small'>
              {t('提示：状态筛选将从数据库分页查询。')}
            </Text>
          </div>
        ) : null}

        <div ref={tableWrapRef} className='flex-1 overflow-hidden'>
          <Table
            rowKey='id'
            loading={invoicesLoading}
            columns={invoiceColumns}
            dataSource={invoices}
            size='small'
            // 通过 scroll.y 让表体滚动、表头固定
            scroll={tableScroll}
            pagination={false}
          />
        </div>
      </Card>
    </div>
  );
};

export default InvoiceTab;

