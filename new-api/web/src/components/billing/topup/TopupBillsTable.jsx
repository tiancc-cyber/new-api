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
  Badge,
  Button,
  Empty,
  Modal,
  Table,
  Tag,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { API, timestamp2string } from '../../../helpers';
import { isAdmin } from '../../../helpers/utils';
import CreateInvoiceModal from '../invoice/CreateInvoiceModal.jsx';
import { useContainerSize } from '../../../hooks/common/useContainerSize.js';

const { Text } = Typography;

// 状态映射配置
const STATUS_CONFIG = {
  success: { type: 'success', key: '成功' },
  pending: { type: 'warning', key: '待支付' },
  expired: { type: 'danger', key: '已过期' },
  canceled: { type: 'tertiary', key: '已取消' },
};

// 支付方式映射
const PAYMENT_METHOD_MAP = {
  stripe: 'Stripe',
  creem: 'Creem',
  alipay: '支付宝',
  wxpay: '微信',
};

const TopupBillsTable = ({
  page: externalPage,
  pageSize: externalPageSize,
  onPageChange,
  onPageSizeChange,
  onTotalChange,

  // Controlled filters/actions (rendered by parent as fixed header)
  keyword,
  invoiceFilter,
  onKeywordChange,
  onInvoiceFilterChange,

  // Batch invoice state controlled by parent
  selectedRowMap,
  setSelectedRowMap,
  onSelectedSummaryChange,
  onRequestInvoiceBatch,
  onRequestInvoiceAll,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [topups, setTopups] = useState([]);
  const [total, setTotal] = useState(0);
  const page = externalPage ?? 1;
  const pageSize = externalPageSize ?? 10;
  // NOTE: keyword/invoiceFilter/selectedRowMap are controlled by parent.

  // Make table header sticky by letting Table manage vertical scroll.
  // scroll.y is computed from the available container height.
  const [containerRef, containerSize] = useContainerSize();
  const lastStableScrollYRef = useRef(560);
  const scrollY = useMemo(() => {
    // Reserve padding so the bottom content isn't covered by table internal scrollbars
    // and (depending on platform) sticky scrollbar overlay.
    // NOTE: 48px is sometimes not enough on macOS overlay scrollbars + Semi Table,
    // which can cause the last row to be partially covered.
    const BOTTOM_RESERVE = 72;
    const rawH = Math.floor((containerSize?.height || 0) - BOTTOM_RESERVE);
    // Semi Table requires a positive number to enable sticky header.
    const candidate = rawH > 200 ? rawH : 560;

    // Kill 1-2px oscillations from ResizeObserver/layout feedback:
    // 1) clamp to a reasonable range
    // 2) quantize to an 8px grid (so tiny changes don't trigger re-layout)
    const MIN_Y = 360;
    const MAX_Y = 1600;
    const GRID = 8;
    const clamped = Math.max(MIN_Y, Math.min(MAX_Y, candidate));
    const quantized = Math.round(clamped / GRID) * GRID;

    const prev = lastStableScrollYRef.current;
    if (quantized !== prev) {
      lastStableScrollYRef.current = quantized;
      return quantized;
    }
    return prev;
  }, [containerSize?.height]);

  const tableScroll = useMemo(
    () => ({ y: scrollY, x: 'max-content' }),
    [scrollY],
  );

  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceModalTopupIds, setInvoiceModalTopupIds] = useState([]);
  const [invoiceModalTargetUserId, setInvoiceModalTargetUserId] = useState(undefined);

  const userIsAdmin = useMemo(() => isAdmin(), []);

  // ---------------------------
  // Batch invoice triggers from parent fixed header
  const invoiceBatchHandlerRef = useRef(null);
  const invoiceAllHandlerRef = useRef(null);

  // Keep refs pointing to the latest handlers (latest state) without re-registering listeners.
  useEffect(() => {
    invoiceBatchHandlerRef.current = () => handleInvoiceBatch();
    invoiceAllHandlerRef.current = () => handleInvoiceAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    const onBatch = () => invoiceBatchHandlerRef.current?.();
    const onAll = () => invoiceAllHandlerRef.current?.();
    window.addEventListener('billing:invoiceBatch', onBatch);
    window.addEventListener('billing:invoiceAll', onAll);
    return () => {
      window.removeEventListener('billing:invoiceBatch', onBatch);
      window.removeEventListener('billing:invoiceAll', onAll);
    };
  }, []);

  const loadTopups = async (currentPage, currentPageSize) => {
    setLoading(true);
    try {
      const base = userIsAdmin ? '/api/user/topup' : '/api/user/topup/self';
      // 后端已支持 invoice_filter：分页/total 均由数据库完成（与 usage logs / channels 一致）
      const qs =
        `p=${currentPage}&page_size=${currentPageSize}` +
        (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '') +
        (invoiceFilter && invoiceFilter !== 'all'
          ? `&invoice_filter=${encodeURIComponent(invoiceFilter)}`
          : '');
      const endpoint = `${base}?${qs}`;
      const res = await API.get(endpoint);
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error({ content: message || t('加载失败') });
        return;
      }

      setTopups(data.items || []);
      const nextTotal = data.total || 0;
      setTotal(nextTotal);
      onTotalChange?.(nextTotal);
    } catch (error) {
      console.error('Load topups error:', error);
      Toast.error({ content: t('加载账单失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopups(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, keyword, invoiceFilter]);

  // Report selected summary to parent for fixed header display
  useEffect(() => {
    const rows = Object.values(selectedRowMap || {});
    const count = rows.length;
    const totalMoney = rows.reduce((sum, r) => sum + Number(r?.money || 0), 0);
    onSelectedSummaryChange?.({ selectedCount: count, selectedTotalMoney: totalMoney });
  }, [selectedRowMap, onSelectedSummaryChange]);

  const handleAdminComplete = async (tradeNo) => {
    try {
      const res = await API.post('/api/user/topup/complete', {
        trade_no: tradeNo,
      });
      const { success, message } = res.data;
      if (success) {
        Toast.success({ content: t('补单成功') });
        await loadTopups(page, pageSize);
      } else {
        Toast.error({ content: message || t('补单失败') });
      }
    } catch (e) {
      Toast.error({ content: t('补单失败') });
    }
  };

  const confirmAdminComplete = (tradeNo) => {
    Modal.confirm({
      title: t('确认补单'),
      content: t('是否将该订单标记为成功并为用户入账？'),
      onOk: () => handleAdminComplete(tradeNo),
    });
  };

  const canInvoiceTopup = (record) => {
    // MVP：仅允许已支付成功的充值记录开票；订阅套餐充值不提供开票入口
    if (!record) return false;
    if (isSubscriptionTopup(record)) return false;

    // 已开票不允许重复开票
    if (record.invoiced) return false;
    return record.status === 'success';
  };

  const openInvoiceModal = (ids, targetUserId) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      Toast.warning({ content: t('请先选择可开票的账单') });
      return;
    }
    setInvoiceModalTopupIds(ids);
    setInvoiceModalTargetUserId(targetUserId);
    setInvoiceModalVisible(true);
  };

  const handleInvoiceSingle = async (record) => {
    if (!canInvoiceTopup(record)) {
      Toast.warning({ content: t('仅支持已支付账单开票') });
      return;
    }

    // 选项 B：进入开票信息选择弹窗
    const targetUserId = userIsAdmin ? record?.user_id : undefined;
    if (userIsAdmin && !targetUserId) {
      Toast.error({ content: t('缺少用户信息，无法代开票') });
      return;
    }
    openInvoiceModal([record.id], targetUserId);
  };

  const handleInvoiceBatch = () => {
    // 不可开票的行已被禁选；这里仍做一次兜底过滤
    const selectedRows = Object.values(selectedRowMap);
    const invoiceable = selectedRows.filter((r) => canInvoiceTopup(r));
    if (invoiceable.length === 0) {
      Toast.warning({ content: t('请先选择可开票的账单') });
      return;
    }

    // 金额限制：选中订单支付总金额 > 50 才可开票
    const totalMoney = invoiceable.reduce((sum, r) => sum + Number(r?.money || 0), 0);
    if (totalMoney <= 50) {
      Toast.warning({ content: t('选中订单总金额需大于 50 元才可开票') });
      return;
    }

    if (userIsAdmin) {
      const userIdSet = new Set(invoiceable.map((r) => r?.user_id).filter(Boolean));
      if (userIdSet.size !== 1) {
        Toast.warning({ content: t('请选择同一用户的账单进行合并开票') });
        return;
      }
      const [targetUserId] = Array.from(userIdSet);
      openInvoiceModal(
        invoiceable.map((r) => r.id),
        targetUserId,
      );
      return;
    }

    openInvoiceModal(invoiceable.map((r) => r.id));
  };

  const handleInvoiceAll = () => {
    Modal.confirm({
      title: t('确认全部开票'),
      content: t('确定为当前筛选条件下的全部可开票账单创建发票吗？'),
      onOk: async () => {
        try {
          setInvoicing(true);
          Toast.info({ content: t('正在加载可开票账单，请稍候...'), duration: 2 });
          const base = userIsAdmin ? '/api/user/topup' : '/api/user/topup/self';
          const allInvoiceableIds = [];
          const reqPageSize = 100;
          let p = 1;
          const maxPages = 200;

          while (p <= maxPages) {
            const qs =
              `p=${p}&page_size=${reqPageSize}` +
              (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '') +
              (invoiceFilter && invoiceFilter !== 'all'
                ? `&invoice_filter=${encodeURIComponent(invoiceFilter)}`
                : '');
            const endpoint = `${base}?${qs}`;
            const res = await API.get(endpoint);
            const { success, message, data } = res.data;
            if (!success) {
              Toast.error({ content: message || t('加载失败') });
              return;
            }
            const items = data?.items || [];
            for (const it of items) {
              if (canInvoiceTopup(it)) {
                allInvoiceableIds.push(it.id);
              }
            }
            if (items.length < reqPageSize) break;
            p += 1;
          }

          if (allInvoiceableIds.length === 0) {
            Toast.warning({ content: t('当前筛选条件下没有可开票的账单') });
            return;
          }

          // 这里直接打开开票弹窗（用户可在弹窗内选择主体等信息）。
          if (userIsAdmin) {
            const userIdSet = new Set();
            // Using the first page items is enough when backend filter is applied per user anyway;
            // but for safety check actual fetched ids cannot provide user info currently.
            // Fallback: require user to select a single user's rows for admin all-invoice.
            for (const it of Object.values(selectedRowMap || {})) {
              if (it?.user_id) userIdSet.add(it.user_id);
            }
            if (userIdSet.size !== 1) {
              Toast.warning({ content: t('管理员全部开票请先勾选同一用户的账单（用于确定代开票用户）') });
              return;
            }
            const [targetUserId] = Array.from(userIdSet);
            openInvoiceModal(allInvoiceableIds, targetUserId);
            return;
          }

          openInvoiceModal(allInvoiceableIds, undefined);
        } finally {
          setInvoicing(false);
        }
      },
    });
  };

  const renderStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { type: 'primary', key: status };
    return (
      <span className='flex items-center gap-2'>
        <Badge dot type={config.type} />
        <span>{t(config.key)}</span>
      </span>
    );
  };

  const renderPaymentMethod = (pm) => {
    const displayName = PAYMENT_METHOD_MAP[pm];
    return <Text>{displayName ? t(displayName) : pm || '-'}</Text>;
  };

  const isSubscriptionTopup = (record) => {
    const tradeNo = (record?.trade_no || '').toLowerCase();
    return Number(record?.amount || 0) === 0 && tradeNo.startsWith('sub');
  };

  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: t('订单号'),
        dataIndex: 'trade_no',
        key: 'trade_no',
        render: (text) => <Text copyable>{text}</Text>,
      },
      {
        title: t('支付方式'),
        dataIndex: 'payment_method',
        key: 'payment_method',
        render: renderPaymentMethod,
      },
      {
        title: t('充值额度'),
        dataIndex: 'amount',
        key: 'amount',
        render: (amount, record) => {
          if (isSubscriptionTopup(record)) {
            return (
              <Tag color='purple' shape='circle' size='small'>
                {t('订阅套餐')}
              </Tag>
            );
          }
          return (
            <span className='flex items-center gap-1'>
              <Coins size={16} />
              <Text>{amount}</Text>
            </span>
          );
        },
      },
      {
        title: t('支付金额'),
        dataIndex: 'money',
        key: 'money',
        render: (money) => <Text type='danger'>¥{money.toFixed(2)}</Text>,
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        render: (status, record) => {
          return (
            <div className='flex flex-col gap-1'>
              {renderStatusBadge(status)}
              {record?.invoiced ? (
                <Text type='tertiary' size='small'>
                  {t('已开票')}
                </Text>
              ) : null}
            </div>
          );
        },
      },
    ];

    // 操作列：普通用户显示开票；管理员额外显示补单
    baseColumns.push({
      title: t('操作'),
      key: 'action',
      render: (_, record) => {
        const showAdminComplete = userIsAdmin && record.status === 'pending';
        const invoiceDisabled = !canInvoiceTopup(record);
        return (
          <div className='flex items-center gap-2'>
            <Button
              size='small'
              type='primary'
              theme='outline'
              disabled={invoiceDisabled}
              onClick={() => handleInvoiceSingle(record)}
            >
              {t('开票')}
            </Button>
            {showAdminComplete ? (
              <Button
                size='small'
                type='primary'
                theme='outline'
                onClick={() => confirmAdminComplete(record.trade_no)}
              >
                {t('补单')}
              </Button>
            ) : null}
          </div>
        );
      },
    });

    baseColumns.push({
      title: t('创建时间'),
      dataIndex: 'create_time',
      key: 'create_time',
      render: (time) => timestamp2string(time),
    });

    return baseColumns;
  }, [t, userIsAdmin]);

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys: topups
        .map((r) => r?.id)
        .filter((id) => id !== undefined && selectedRowMap[id]),
      onChange: (keys, rows) => {
        // 仅允许可开票记录被选择；不可开票行已被禁选
        setSelectedRowMap((prev) => {
          const next = { ...prev };
          const currentPageIdSet = new Set(
            topups.map((r) => r?.id).filter((id) => id !== undefined),
          );
          // 先删掉当前页中未选中的（实现跨页累计，同时可在当前页取消选择）
          for (const id of currentPageIdSet) {
            if (!keys.includes(id)) {
              delete next[id];
            }
          }
          // 再把当前页选中的合并进来
          for (const row of rows) {
            if (row?.id !== undefined && canInvoiceTopup(row)) {
              next[row.id] = row;
            }
          }
          return next;
        });
      },
      getCheckboxProps: (record) => ({
        disabled: !canInvoiceTopup(record),
      }),
    }),
    [selectedRowMap, topups],
  );

  return (
    <div
      ref={containerRef}
      className='h-full overflow-hidden'
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <CreateInvoiceModal
        visible={invoiceModalVisible}
        onCancel={() => setInvoiceModalVisible(false)}
        topupIds={invoiceModalTopupIds}
        adminMode={userIsAdmin}
        targetUserId={invoiceModalTargetUserId}
        onCreated={async () => {
          // 创建成功后，刷新列表 + 清空选择
          await loadTopups(page, pageSize);
          setSelectedRowMap({});
        }}
      />
      {/* Filters/actions moved to parent (fixed in header) */}

      <Table
        columns={columns}
        dataSource={topups}
        loading={loading}
        rowKey='id'
        rowSelection={rowSelection}
        // 通过 scroll.y 让表体滚动、表头固定
        scroll={tableScroll}
        pagination={false}
        size='small'
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无充值记录')}
            style={{ padding: 30 }}
          />
        }
      />
    </div>
  );
};

export default TopupBillsTable;

