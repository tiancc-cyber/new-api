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

import React, { useMemo, useState } from 'react';
import { Button, Input, Select, TabPane, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { FileText, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardPro from '../common/ui/CardPro';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import TopupBillsTable from './topup/TopupBillsTable.jsx';
import InvoiceTab from './invoice/InvoiceTab.jsx';
import './billing.css';

const Billing = () => {
  const { t } = useTranslation();
  const { Title } = Typography;
  const isMobile = useIsMobile();

  const tabs = useMemo(
    () => [
      {
        key: 'bills',
        icon: <Receipt size={16} />,
        title: t('账单'),
      },
      {
        key: 'invoice',
        icon: <FileText size={16} />,
        title: t('发票'),
      },
    ],
    [t],
  );

  const [activeKey, setActiveKey] = useState('bills');

  // Keep pagination fixed in CardPro footer; only scroll table data.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Bills tab fixed header states
  const [billKeyword, setBillKeyword] = useState('');
  const [billInvoiceFilter, setBillInvoiceFilter] = useState('all');
  const [billAppliedKeyword, setBillAppliedKeyword] = useState('');
  const [billAppliedInvoiceFilter, setBillAppliedInvoiceFilter] = useState('all');
  const [billSelectedRowMap, setBillSelectedRowMap] = useState({});
  const [billSelectedSummary, setBillSelectedSummary] = useState({
    selectedCount: 0,
    selectedTotalMoney: 0,
  });

  // Invoice tab fixed header state
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoiceAppliedStatusFilter, setInvoiceAppliedStatusFilter] = useState('all');
  const [invoiceSearchSeq, setInvoiceSearchSeq] = useState(0);

  // Reset pagination when switching tabs
  const handleTabChange = (k) => {
    setActiveKey(k);
    setPage(1);
    setTotal(0);
    // keep applied filters, but clear selection so action buttons are consistent
    setBillSelectedRowMap({});
  };

  const renderFixedActions = () => {
    if (activeKey === 'bills') {
      const { selectedCount, selectedTotalMoney } = billSelectedSummary;
      return (
        <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
          <div className='flex flex-wrap items-center gap-2 w-full md:w-auto mt-2'>
            <Input
              prefix={<IconSearch />}
              placeholder={t('订单号')}
              value={billKeyword}
              onChange={(v) => {
                setBillKeyword(v);
                setBillSelectedRowMap({});
              }}
              showClear
              style={{ maxWidth: isMobile ? undefined : 360 }}
            />

            <Select
              value={billInvoiceFilter}
              onChange={(v) => {
                setBillInvoiceFilter(v);
                setBillSelectedRowMap({});
              }}
              style={{ width: isMobile ? '100%' : 180 }}
              optionList={[
                { label: t('全部'), value: 'all' },
                { label: t('可开票'), value: 'invoiceable' },
                { label: t('已开票'), value: 'invoiced' },
              ]}
            />

            <Button
              type='primary'
              theme='solid'
              onClick={() => {
                setBillAppliedKeyword(billKeyword);
                setBillAppliedInvoiceFilter(billInvoiceFilter);
                setPage(1);
                setBillSelectedRowMap({});
              }}
            >
              {t('搜索')}
            </Button>

            <Button
              type='primary'
              theme='solid'
              onClick={() => {
                // Trigger via child callback
                window.dispatchEvent(new CustomEvent('billing:invoiceBatch'));
              }}
              disabled={selectedCount === 0 || selectedTotalMoney <= 50}
            >
              {t('批量开票')}
            </Button>

            <Button
              type='primary'
              theme='outline'
              onClick={() => {
                window.dispatchEvent(new CustomEvent('billing:invoiceAll'));
              }}
            >
              {t('全部开票')}
            </Button>
          </div>

          {selectedCount > 0 ? (
            <div
              className='text-sm select-none'
              style={{ color: 'var(--semi-color-text-2)' }}
            >
              {t('已选')} {selectedCount}，{t('合计')} ¥{selectedTotalMoney.toFixed(2)}
            </div>
          ) : null}
        </div>
      );
    }

    // invoice
    return (
      <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
        <div className='flex flex-wrap items-center gap-2 mt-2'>
          <Select
            value={invoiceStatusFilter}
            onChange={(v) => setInvoiceStatusFilter(v)}
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
            onClick={() => {
              setInvoiceAppliedStatusFilter(invoiceStatusFilter);
              setPage(1);
              setInvoiceSearchSeq((s) => s + 1);
            }}
          >
            {t('搜索')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className='mt-[60px] px-2'>
      <div className='w-full max-w-7xl mx-auto relative'>
        <CardPro
        type='type3'
        className='overflow-hidden billing-page-card'
        // descriptionArea={
        //   <div>
        //     <Title heading={4} className='!m-0'>
        //       {t('账单与发票')}
        //     </Title>
        //   </div>
        // }
        tabsArea={
          <Tabs
            type='card'
            activeKey={activeKey}
            onChange={handleTabChange}
            className='w-full'
          >
            <TabPane
              itemKey='bills'
              tab={
                <div className='flex items-center gap-2'>
                  {tabs[0].icon}
                  {tabs[0].title}
                </div>
              }
            />
            <TabPane
              itemKey='invoice'
              tab={
                <div className='flex items-center gap-2'>
                  {tabs[1].icon}
                  {tabs[1].title}
                </div>
              }
            />
          </Tabs>
        }
        actionsArea={renderFixedActions()}
        paginationArea={createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: (p) => setPage(p),
          onPageSizeChange: (ps) => {
            setPageSize(ps);
            setPage(1);
          },
          isMobile,
          t,
        })}
        t={t}
      >
        {/* Only scroll data area; keep tabs/filters/buttons fixed in CardPro header */}
        <div className='pt-3 overflow-hidden' style={{ overscrollBehavior: 'none' }}>
          {/* Do NOT scroll the whole content container; let Table's scroll.y keep header fixed */}
          <div className='overflow-hidden'>
            {activeKey === 'bills' ? (
              <TopupBillsTable
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(ps) => {
                  setPageSize(ps);
                  setPage(1);
                }}
                onTotalChange={setTotal}
                keyword={billAppliedKeyword}
                invoiceFilter={billAppliedInvoiceFilter}
                selectedRowMap={billSelectedRowMap}
                setSelectedRowMap={setBillSelectedRowMap}
                onSelectedSummaryChange={setBillSelectedSummary}
              />
            ) : (
              <InvoiceTab
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(ps) => {
                  setPageSize(ps);
                  setPage(1);
                }}
                onTotalChange={setTotal}
                appliedStatusFilter={invoiceAppliedStatusFilter}
                searchSeq={invoiceSearchSeq}
              />
            )}
          </div>
        </div>
      </CardPro>
      </div>
    </div>
  );
};

export default Billing;

