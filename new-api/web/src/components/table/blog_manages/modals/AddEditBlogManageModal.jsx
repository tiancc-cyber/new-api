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

import React, { useEffect, useState } from 'react';
import { Button, Form, SideSheet, Space } from '@douyinfe/semi-ui';

const AddEditBlogManageModal = ({
  visible,
  handleClose,
  editingBlog,
  placement,
  onSubmit,
  t,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [formApi, setFormApi] = useState(null);

  const isEdit = !!editingBlog?.id;

  useEffect(() => {
    if (!formApi) return;

    if (isEdit) {
      formApi.setValues({
        title: editingBlog?.title || '',
        image_url: editingBlog?.image_url || '',
        intro: editingBlog?.intro || '',
        tags: editingBlog?.tags || '',
        content: editingBlog?.content || '',
        content_type: editingBlog?.content_type || 'markdown',
        status: editingBlog?.status ?? 0,
        published_at: editingBlog?.published_at || 0,
        pinned: !!editingBlog?.pinned,
      });
    } else {
      formApi.reset();
      formApi.setValues({
        content_type: 'markdown',
        status: 0,
        pinned: false,
        published_at: 0,
      });
    }
  }, [formApi, isEdit, editingBlog]);

  const submit = async () => {
    if (!formApi) return;
    const values = await formApi.validate();

    const payload = {
      title: values.title,
      image_url: values.image_url,
      intro: values.intro,
      tags: values.tags,
      content: values.content,
      content_type: values.content_type,
      status: Number(values.status),
      pinned: !!values.pinned,
      published_at: Number(values.published_at) || 0,
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
      title={isEdit ? t('编辑博客') : t('新增博客')}
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
          field='title'
          label={t('标题')}
          placeholder={t('请输入标题')}
          rules={[{ required: true, message: t('标题不能为空') }]}
        />
        <Form.Input
          field='image_url'
          label={t('图片地址')}
          placeholder={t('https://...')}
        />
        <Form.TextArea
          field='intro'
          label={t('简介')}
          placeholder={t('请输入简介')}
          autosize
        />
        <Form.Input
          field='tags'
          label={t('标签')}
          placeholder={t('多个标签用逗号分隔')}
        />
        <Form.Select
          field='content_type'
          label={t('文章类型')}
          optionList={[
            { label: 'markdown', value: 'markdown' },
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
          field='published_at'
          label={t('发布时间(Unix秒)')}
          placeholder={t('不填则发布时自动设置')}
          min={0}
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

export default AddEditBlogManageModal;

