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
import { Button, Form, SideSheet, Space } from '@douyinfe/semi-ui';

const AddEditScenarioTutorialModal = ({
  visible,
  handleClose,
  editingRow,
  placement,
  onSubmit,
  t,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [formApi, setFormApi] = useState(null);

  const isEdit = !!editingRow?.id;

  const initialPublishTime = useMemo(() => {
    const ts = editingRow?.published_at;
    if (!isEdit || !ts) return null;
    const d = new Date(Number(ts) * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }, [editingRow, isEdit]);

  useEffect(() => {
    if (!formApi) return;

    if (isEdit) {
      formApi.setValues({
        slug: editingRow?.slug || '',
        title: editingRow?.title || '',
        intro: editingRow?.intro || '',
        tags: editingRow?.tags || '',
        content: editingRow?.content || '',
        content_type: editingRow?.content_type || 'markdown',
        status: editingRow?.status ?? 0,
        pinned: !!editingRow?.pinned,
        order: editingRow?.order ?? 0,
        published_time: initialPublishTime,
      });
    } else {
      formApi.reset();
      formApi.setValues({
        content_type: 'markdown',
        status: 0,
        pinned: false,
        order: 0,
        published_time: null,
      });
    }
  }, [formApi, isEdit, editingRow, initialPublishTime]);

  const submit = async () => {
    if (!formApi) return;
    const values = await formApi.validate();

    const payload = {
      slug: values.slug,
      title: values.title,
      intro: values.intro,
      tags: values.tags,
      content: values.content,
      content_type: values.content_type,
      status: Number(values.status),
      pinned: !!values.pinned,
      order: Number(values.order || 0),
      published_at: values.published_time
        ? Math.floor(new Date(values.published_time).getTime() / 1000)
        : 0,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SideSheet
      title={isEdit ? t('编辑教程') : t('新增教程')}
      visible={visible}
      placement={placement}
      onCancel={handleClose}
      size='large'
      footer={
        <Space>
          <Button onClick={handleClose}>{t('取消')}</Button>
          <Button type='primary' theme='solid' loading={submitting} onClick={submit}>
            {t('保存')}
          </Button>
        </Space>
      }
    >
      <Form getFormApi={setFormApi} labelPosition='top'>
        <Form.Input
          field='slug'
          label={t('标识')}
          placeholder={t('例如: quickstart')}
          rules={[{ required: true, message: t('标识不能为空') }]}
          disabled={isEdit}
          extraText={t('标识用于URL路径，创建后不可修改')}
        />
        <Form.Input
          field='title'
          label={t('标题')}
          placeholder={t('请输入标题')}
          rules={[{ required: true, message: t('标题不能为空') }]}
        />
        <Form.TextArea field='intro' label={t('简介')} placeholder={t('请输入简介')} autosize />
        <Form.Input field='tags' label={t('标签')} placeholder={t('多个标签用逗号分隔')} />
        <Form.Select
          field='content_type'
          label={t('内容类型')}
          optionList={[
            { label: 'markdown', value: 'markdown' },
            { label: 'text', value: 'text' },
            { label: 'html', value: 'html' },
          ]}
        />
        <Form.Select
          field='status'
          label={t('状态')}
          optionList={[
            { label: t('草稿'), value: 0 },
            { label: t('已发布'), value: 1 },
          ]}
        />
        <Form.Switch field='pinned' label={t('置顶')} />
        <Form.InputNumber
          field='order'
          label={t('排序')}
          min={0}
          max={999999}
          extraText={t('数值越大越靠前')}
          style={{ width: '100%' }}
        />
        <Form.DatePicker
          field='published_time'
          label={t('发布时间(年月日 时分秒)')}
          extraText={t('不填写则发布时自动设置')}
          type='dateTime'
          format='yyyy-MM-dd HH:mm:ss'
          placeholder={t('请选择发布时间')}
          style={{ width: '100%' }}
          clearable
        />
        <Form.TextArea
          field='content'
          label={t('内容')}
          placeholder={t('请输入内容')}
          rules={[{ required: true, message: t('内容不能为空') }]}
          autosize={{ minRows: 10, maxRows: 24 }}
        />
      </Form>
    </SideSheet>
  );
};

export default AddEditScenarioTutorialModal;

