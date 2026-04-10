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

import React from 'react';
import { Button, Modal, Space, Tag, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

function fmtTs(ts) {
  if (!ts) return '-';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch (e) {
    return String(ts);
  }
}

function renderStatus(status, t) {
  if (status === 1) {
    return <Tag color='green'>{t('已发布')}</Tag>;
  }
  return <Tag color='grey'>{t('草稿')}</Tag>;
}

const ScenarioTutorialOperate = ({
  record,
  openEdit,
  setRowStatus,
  removeRow,
  t,
}) => {
  const isPublished = record?.status === 1;

  const toggleStatus = () => {
    if (isPublished) {
      Modal.confirm({
        title: t('确认设为草稿'),
        content: t('设为草稿后，将不会对外展示。是否继续？'),
        centered: true,
        onOk: () => setRowStatus(record, 0),
      });
    } else {
      Modal.confirm({
        title: t('确认发布'),
        content: t('发布后教程将被标记为已发布。是否继续？'),
        centered: true,
        onOk: () => setRowStatus(record, 1),
      });
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: t('确认删除'),
      content: t('删除后不可恢复（软删除）。是否继续？'),
      centered: true,
      onOk: () => removeRow(record),
    });
  };

  return (
    <Space spacing={8}>
      <Button
        theme='light'
        type='tertiary'
        size='small'
        onClick={() => openEdit(record)}
      >
        {t('编辑')}
      </Button>
      <Button
        theme='light'
        type={isPublished ? 'danger' : 'primary'}
        size='small'
        onClick={toggleStatus}
      >
        {isPublished ? t('撤回') : t('发布')}
      </Button>
      <Button theme='light' type='danger' size='small' onClick={handleDelete}>
        {t('删除')}
      </Button>
    </Space>
  );
};

export const getScenarioTutorialsColumns = ({
  t,
  openEdit,
  setRowStatus,
  removeRow,
}) => {
  return [
    { title: t('ID'), dataIndex: 'id', width: 80 },
    {
      title: t('标识(MD5)'),
      dataIndex: 'md5',
      width: 260,
      render: (text) => <Text ellipsis={{ showTooltip: true }}>{text}</Text>,
    },
    {
      title: t('Slug'),
      dataIndex: 'slug',
      width: 190,
      render: (text) => (
        <Text ellipsis={{ showTooltip: true }}>{text || '-'}</Text>
      ),
    },
    {
      title: t('标题'),
      dataIndex: 'title',
      width: 260,
      render: (text) => <Text ellipsis={{ showTooltip: true }}>{text}</Text>,
    },
    {
      title: t('标签'),
      dataIndex: 'tags',
      width: 200,
      render: (text) => (
        <Text ellipsis={{ showTooltip: true }}>{text || '-'}</Text>
      ),
    },
    {
      title: t('类型'),
      dataIndex: 'content_type',
      width: 120,
      render: (ct) => <Tag>{ct || 'markdown'}</Tag>,
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      width: 120,
      render: (v) => renderStatus(v, t),
    },
    {
      title: t('发布时间'),
      dataIndex: 'published_at',
      width: 190,
      render: (v) => fmtTs(v),
    },
    {
      title: t('更新时间'),
      dataIndex: 'updated_at',
      width: 190,
      render: (v) => fmtTs(v),
    },
    {
      title: t('操作'),
      dataIndex: 'operate',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <ScenarioTutorialOperate
          record={record}
          openEdit={openEdit}
          setRowStatus={setRowStatus}
          removeRow={removeRow}
          t={t}
        />
      ),
    },
  ];
};
