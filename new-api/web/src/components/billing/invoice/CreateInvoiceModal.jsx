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
  Col,
  Form,
  Modal,
  Radio,
  Row,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import { API } from '../../../helpers';

const { Text } = Typography;
const RadioGroup = Radio.Group;

const DEFAULT_INVOICE_TYPE = '电子普通发票';
const DEFAULT_INVOICE_CONTENT = '商品明细';

const INVOICE_TYPE_OPTIONS = [
  { label: '电子普通发票', value: '电子普通发票' },
  { label: '专用发票', value: '专用发票' },
];

const INVOICE_CONTENT_OPTIONS = [
  { label: '商品明细', value: '商品明细' },
  { label: '商品类别', value: '商品类别' },
];

const isValidEmail = (s) => {
  const v = String(s || '').trim();
  if (!v) return false;
  // pragmatic email validation (avoids being too strict)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

const isValidTaxNoCN = (s) => {
  const v = String(s || '').trim();
  if (!v) return false;
  // CN unified social credit code/tax id is typically 15/18/20 chars; allow common variants.
  return /^[0-9A-Z]{15}$/.test(v) || /^[0-9A-Z]{18}$/.test(v) || /^[0-9A-Z]{20}$/.test(v);
};

const TITLE_TYPE_OPTIONS = [
  { label: '个人', value: '个人' },
  { label: '单位', value: '单位' },
];

const CreateInvoiceModal = ({
  visible,
  onCancel,
  topupIds,
  onCreated,
  title,
  adminMode,
  targetUserId,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);

  // 输入框展示值（抬头名称）。用于“输入框样式 + 点击弹出列表”的组合交互。
  const [subjectTitleName, setSubjectTitleName] = useState('');
  const [subjectDropdownVisible, setSubjectDropdownVisible] = useState(false);

  const subjectDropdownWrapRef = useRef(null);
  const formApiRef = useRef(null);

  const [titleType, setTitleType] = useState('单位');

  const [invoiceType, setInvoiceType] = useState(DEFAULT_INVOICE_TYPE);
  const [invoiceContent, setInvoiceContent] = useState(DEFAULT_INVOICE_CONTENT);

  const fetchSubjects = async () => {
    setSubjectsLoading(true);
    try {
      const endpoint = adminMode
        ? `/api/invoice/admin/users/${targetUserId}/subjects`
        : '/api/invoice/subjects';
      const res = await API.get(endpoint);
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error({ content: message || t('加载失败') });
        return;
      }
      setSubjects(data.items || []);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        Toast.error({ content: t('请先登录') });
      } else {
        Toast.error({ content: t('发票主体接口暂未开放或请求失败') });
      }
    } finally {
      setSubjectsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      if (adminMode && !targetUserId) {
        Toast.error({ content: t('缺少目标用户 ID') });
        return;
      }
      fetchSubjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, adminMode, targetUserId]);

  useEffect(() => {
    // 每次打开弹窗时同步默认值，保证按钮组与表单一致
    if (!visible) return;
    setInvoiceType(DEFAULT_INVOICE_TYPE);
    setInvoiceContent(DEFAULT_INVOICE_CONTENT);
    setTitleType('单位');
  }, [visible]);

  // 点击弹窗内其它区域时关闭下拉
  useEffect(() => {
    if (!visible) return;
    const onMouseDown = (e) => {
      const el = subjectDropdownWrapRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setSubjectDropdownVisible(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setSubjectTitleName('');
    setSubjectDropdownVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const subjectCandidates = useMemo(() => {
    return (subjects || []).filter((s) => {
      const st = s?.title_type || '单位';
      return st === titleType;
    });
  }, [subjects, titleType]);

  // 当前 UI 使用自定义下拉，不再直接使用下拉 options。

  const handleOk = async () => {
    if (!Array.isArray(topupIds) || topupIds.length === 0) {
      Toast.error({ content: t('topup_ids 不能为空') });
      return;
    }

    // 这三个字段使用按钮组呈现（不通过 Form 表单项渲染），这里手动做必填校验
    if (!invoiceType) {
      Toast.error({ content: t('发票类型不能为空') });
      return;
    }
    if (!invoiceContent) {
      Toast.error({ content: t('发票内容不能为空') });
      return;
    }
    if (!titleType) {
      Toast.error({ content: t('抬头类型不能为空') });
      return;
    }

    let values = {};
    try {
      values = (await formApiRef.current?.validate()) || {};
    } catch {
      return;
    }

    // Semi Form 在极少数情况下可能出现 UI 已输入但 validate 返回值为空的情况；这里显式兜底校验。
    const titleName = (values.subject_title_name || '').trim();
    const receiveInfo = (values.subject_receive_info || '').trim();
    if (!titleName) {
      Toast.error({ content: t('抬头名称不能为空') });
      return;
    }
    if (!receiveInfo) {
      Toast.error({ content: t('接收信息不能为空') });
      return;
    }

    // 校验：邮箱
    if (!isValidEmail(receiveInfo)) {
      Toast.error({ content: t('收票邮箱格式不正确') });
      return;
    }

    // 校验：税号（单位抬头必填且需格式正确）
    if (titleType !== '个人') {
      const taxNo = values.subject_tax_no ? String(values.subject_tax_no).trim() : '';
      if (!taxNo) {
        Toast.error({ content: t('单位税号不能为空') });
        return;
      }
      if (!isValidTaxNoCN(taxNo)) {
        Toast.error({ content: t('单位税号格式不正确') });
        return;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[CreateInvoiceModal] validate values:', values);
    }

    setLoading(true);
    try {
       const payload = {
        invoice_type: invoiceType,
        invoice_content: invoiceContent,
        title_type: titleType,
        topup_ids: topupIds,
      };

        // 有选择已有主体则使用 subject_unique_key，否则按输入内容新增主体后开票
        // 需求：如果用户手动输入“抬头名称+单位税号”与已有主体一致，则不重复入库，直接使用已有主体。
        let subjectUniqueKey = values.subject_unique_key;
        if (!subjectUniqueKey) {
          const name = (values.subject_title_name || '').trim();
          const taxNo = values.subject_tax_no ? String(values.subject_tax_no).trim() : '';
          const hit = (subjectCandidates || []).find((s) => {
            const sn = (s?.title_name || '').trim();
            const st = s?.tax_no ? String(s.tax_no).trim() : '';
            if (sn !== name) return false;
            // 个人抬头不要求税号，单位抬头用“抬头名称+税号”判断重复
            if (titleType === '个人') return true;
            return st !== '' && st === taxNo;
          });
          if (hit?.unique_key) {
            subjectUniqueKey = hit.unique_key;
          }
        }

        if (subjectUniqueKey) {
          payload.subject_unique_key = subjectUniqueKey;

          // 若用户在选择已有主体后手动修改了表单字段，这里将本次表单内容作为 patch 回写到主体表。
          // 后端仅覆盖非空/非 nil 字段，避免误清空历史数据。
          const isPersonal = titleType === '个人';
          payload.subject_update = {
            title_type: titleType,
            title_name: (values.subject_title_name || '').trim(),
            receive_method: values.subject_receive_method,
            receive_info: (values.subject_receive_info || '').trim(),
            ...(isPersonal
              ? {}
              : {
                  tax_no: values.subject_tax_no ? values.subject_tax_no : undefined,
                  registered_address: values.subject_registered_address
                    ? values.subject_registered_address
                    : undefined,
                  registered_phone: values.subject_registered_phone
                    ? values.subject_registered_phone
                    : undefined,
                  bank_name: values.subject_bank_name
                    ? values.subject_bank_name
                    : undefined,
                  bank_account: values.subject_bank_account
                    ? values.subject_bank_account
                    : undefined,
                }),
          };
        } else {
        const isPersonal = titleType === '个人';
        payload.subject = {
          title_type: titleType,
          title_name: (values.subject_title_name || '').trim(),
          receive_method: values.subject_receive_method,
          receive_info: (values.subject_receive_info || '').trim(),
          ...(isPersonal
            ? {}
            : {
                tax_no: values.subject_tax_no ? values.subject_tax_no : undefined,
                registered_address: values.subject_registered_address
                  ? values.subject_registered_address
                  : undefined,
                registered_phone: values.subject_registered_phone
                  ? values.subject_registered_phone
                  : undefined,
                bank_name: values.subject_bank_name
                  ? values.subject_bank_name
                  : undefined,
                bank_account: values.subject_bank_account
                  ? values.subject_bank_account
                  : undefined,
              }),
        };
      }

      const createEndpoint = adminMode
        ? '/api/admin/invoice/with_subject'
        : '/api/invoice/with_subject';
      if (adminMode) {
        payload.user_id = targetUserId;
      }

      const res = await API.post(createEndpoint, payload);
      const { success, message } = res.data;
      if (!success) {
        Toast.error({ content: message || t('创建失败') });
        return;
      }
      Toast.success({ content: t('创建成功') });
      onCreated?.();
      onCancel?.();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        Toast.error({ content: t('请先登录') });
      } else {
        const msg =
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          t('发票接口暂未开放或请求失败');
        Toast.error({ content: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={
        <div className='flex items-center justify-between w-full'>
          <Text strong>{title || t('创建发票')}</Text>
        </div>
      }
      onCancel={onCancel}
      onOk={handleOk}
      // 使用自定义 footer 以后，不依赖 Modal 默认 onOk 行为
      style={{ width: 860, maxWidth: 'calc(100vw - 32px)' }}
      centered
      closable
      closeOnEsc
      maskClosable={false}
      okType='primary'
      icon={null}
      className=''
      lazyRender
      cancelLoading={false}
      confirmLoading={false}
      hasCancel
      mask
      footerFill={false}
      afterClose={() => {}}
      footer={
        <div className='flex justify-end gap-2'>
          <Button onClick={onCancel} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            type='primary'
            theme='solid'
            onClick={handleOk}
            loading={loading}
            disabled={subjectsLoading}
          >
            {t('创建')}
          </Button>
        </div>
      }
      // 下面这些字段同样来自项目内的 Modal 类型定义要求（避免 IDE 持续 warning）
      height={undefined}
      zIndex={undefined}
      direction='ltr'
      motion
      maskStyle={{}}
      bodyStyle={{}}
      getPopupContainer={undefined}
      closeIcon={undefined}
      keepDOM={false}
      maskFixed={false}
      fullScreen={false}
      size={undefined}
      // 注意：不要传 header={undefined}，否则 Semi Modal 会禁用默认标题栏渲染
      getContainerContext={undefined}
      cancelText={t('取消')}
      okText={t('创建')}
      okButtonProps={{ loading, disabled: subjectsLoading }}
      cancelButtonProps={{ disabled: loading }}
    >
      <Form
        key={`${visible ? 'open' : 'close'}-${titleType}-${adminMode ? targetUserId || '' : 'self'}`}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Row gutter={16}>
          {/* Left: 发票信息（先选类型/内容/抬头类型） */}
          <Col span={8}>
            <Form.Slot label='发票类型'>
              <RadioGroup
                type='button'
                value={invoiceType}
                onChange={(e) => {
                  const v = e?.target?.value;
                  setInvoiceType(v);
                }}
                options={INVOICE_TYPE_OPTIONS}
              />
            </Form.Slot>

            <Form.Slot label='发票内容'>
              <RadioGroup
                type='button'
                value={invoiceContent}
                onChange={(e) => {
                  const v = e?.target?.value;
                  setInvoiceContent(v);
                }}
                options={INVOICE_CONTENT_OPTIONS}
              />
            </Form.Slot>

            <Form.Slot label='抬头类型'>
              <RadioGroup
                type='button'
                value={titleType}
                onChange={(e) => {
                  const v = e?.target?.value;
                  setTitleType(v);
                }}
                options={TITLE_TYPE_OPTIONS}
              />
            </Form.Slot>
            {/* 不在创建弹窗中展示账单数量提示（避免占用空间） */}
          </Col>

          {/* Right: 发票主体（根据抬头类型显示不同字段） */}
          <Col span={16}>
            {/* hidden: 若选择了已有主体，则提交 subject_unique_key；否则按输入内容新增 */}
            <Form.Input field='subject_unique_key' style={{ display: 'none', height: 0, padding: 0, margin: 0 }} noLabel />

            {/* 抬头名称：保持输入框样式；点击输入框弹出下拉列表；输入时可筛选；选择后回填 */}
            <div ref={subjectDropdownWrapRef}>
              <Form.Input
                field='subject_title_name'
                label={t('抬头名称')}
                rules={[{ required: true, message: t('抬头名称不能为空') }]}
                placeholder={t('请输入或点击选择抬头')}
                onFocus={() => {
                  if (!subjectsLoading) setSubjectDropdownVisible(true);
                }}
                onChange={(v) => {
                  setSubjectTitleName(v);
                  // 这里仅用于下拉过滤关键字；表单值由 Semi Form 自身维护
                  // 输入即视为新增主体：清空已选主体
                  formApiRef.current?.setValue('subject_unique_key', undefined);
                  setSubjectDropdownVisible(true);
                }}
              />

              {subjectDropdownVisible ? (
                <div className='-mt-2 mb-2 rounded border border-solid border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] p-2 max-h-52 overflow-auto'>
                {(subjectCandidates || [])
                  .filter((s) => {
                    const kw = (subjectTitleName || '').trim();
                    if (!kw) return true;
                    const label = `${s?.title_name || ''}${s?.tax_no ? ` ${s.tax_no}` : ''}`;
                    return label.toLowerCase().includes(kw.toLowerCase());
                  })
                  .map((s) => (
                    <div
                      key={s.unique_key}
                      className='px-2 py-2 rounded cursor-pointer hover:bg-[var(--semi-color-fill-0)]'
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSubjectTitleName(s.title_name);
                        formApiRef.current?.setValues({
                          subject_unique_key: s.unique_key,
                          subject_title_name: s.title_name,
                          subject_tax_no: s.tax_no,
                          subject_registered_address: s.registered_address,
                          subject_registered_phone: s.registered_phone,
                          subject_bank_name: s.bank_name,
                          subject_bank_account: s.bank_account,
                          subject_receive_method: s.receive_method || 'email',
                          subject_receive_info: s.receive_info,
                        });
                        setSubjectDropdownVisible(false);
                      }}
                    >
                      <div className='flex items-center justify-between gap-2'>
                        <Text strong>{s.title_name}</Text>
                        <Text type='tertiary'>{s.tax_no || ''}</Text>
                      </div>
                      <div className='mt-1'>
                        <Text type='tertiary' size='small'>
                          {s.receive_info || ''}
                        </Text>
                      </div>
                    </div>
                  ))}
                {(subjectCandidates || []).length === 0 ? (
                  <Text type='tertiary' size='small'>
                    {t('暂无可选主体')}
                  </Text>
                ) : null}
                </div>
              ) : null}
            </div>

            {titleType !== '个人' ? (
              <>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Input
                      field='subject_tax_no'
                      label={t('单位税号')}
                      rules={[
                        { required: true, message: t('单位税号不能为空') },
                        {
                          validator: (_, value) => {
                            const v = value ? String(value).trim() : '';
                            if (!v) return true;
                            return isValidTaxNoCN(v);
                          },
                          message: t('单位税号格式不正确'),
                        },
                      ]}
                    />
                  </Col>
                  <Col span={12}>
                    <Form.Input field='subject_registered_phone' label={t('注册电话')} />
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Input field='subject_registered_address' label={t('注册地址')} />
                  </Col>
                  <Col span={12}>
                    <Form.Input field='subject_bank_name' label={t('开户银行')} />
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Input field='subject_bank_account' label={t('银行账号')} />
                  </Col>
                </Row>
              </>
            ) : null}

            <Row gutter={12}>
              <Col span={10}>
                {/* 目前仅支持邮箱接收 */}
                <Form.Input
                  field='subject_receive_method'
                  label={t('接收方式')}
                  initValue='email'
                  disabled
                  rules={[{ required: true, message: t('接收方式不能为空') }]}
                />
              </Col>
              <Col span={14}>
                <Form.Input
                  field='subject_receive_info'
                  label={t('收票邮箱')}
                  rules={[
                    { required: true, message: t('接收信息不能为空') },
                    {
                      validator: (_, value) => {
                        const v = value ? String(value).trim() : '';
                        if (!v) return true;
                        return isValidEmail(v);
                      },
                      message: t('收票邮箱格式不正确'),
                    },
                  ]}
                  placeholder={t('请输入邮箱')}
                />
              </Col>
            </Row>

            {/* 选择主体后已自动回填到表单，这里不再额外展示“已选主体”信息块 */}
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default CreateInvoiceModal;

