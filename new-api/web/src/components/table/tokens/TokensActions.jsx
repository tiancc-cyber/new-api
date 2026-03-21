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

import React, { useState } from 'react';
import { Button, Space, Modal, Typography } from '@douyinfe/semi-ui';
import { showError } from '../../../helpers';
import CopyTokensModal from './modals/CopyTokensModal';
import DeleteTokensModal from './modals/DeleteTokensModal';

const TokensActions = ({
  selectedKeys,
  setEditingToken,
  setShowEdit,
  batchCopyTokens,
  batchDeleteTokens,
  t,
}) => {
  // Modal states
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPythonExample, setShowPythonExample] = useState(false);

  // Handle copy selected tokens with options
  const handleCopySelectedTokens = () => {
    if (selectedKeys.length === 0) {
      showError(t('请至少选择一个令牌！'));
      return;
    }
    setShowCopyModal(true);
  };

  // Handle delete selected tokens with confirmation
  const handleDeleteSelectedTokens = () => {
    if (selectedKeys.length === 0) {
      showError(t('请至少选择一个令牌！'));
      return;
    }
    setShowDeleteModal(true);
  };

  // Handle delete confirmation
  const handleConfirmDelete = () => {
    batchDeleteTokens();
    setShowDeleteModal(false);
  };

  return (
    <>
      <div className='flex flex-wrap gap-2 w-full md:w-auto order-2 md:order-1'>
        <Button
          type='primary'
          className='flex-1 md:flex-initial'
          onClick={() => {
            setEditingToken({
              id: undefined,
            });
            setShowEdit(true);
          }}
          size='small'
        >
          {t('添加令牌')}
        </Button>

        <Button
          type='tertiary'
          className='flex-1 md:flex-initial'
          onClick={handleCopySelectedTokens}
          size='small'
        >
          {t('复制所选令牌')}
        </Button>

        <Button
          type='danger'
          className='w-full md:w-auto'
          onClick={handleDeleteSelectedTokens}
          size='small'
        >
          {t('删除所选令牌')}
        </Button>

        <Button
          type='secondary'
          className='flex-1 md:flex-initial'
          onClick={() => setShowPythonExample(true)}
          size='small'
        >
          {t('Python 示例')}
        </Button>
      </div>

      <CopyTokensModal
        visible={showCopyModal}
        onCancel={() => setShowCopyModal(false)}
        batchCopyTokens={batchCopyTokens}
        t={t}
      />

      <DeleteTokensModal
        visible={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        selectedKeys={selectedKeys}
        t={t}
      />

      <Modal
        title={t('OpenAI Python SDK 示例')}
        visible={showPythonExample}
        onCancel={() => setShowPythonExample(false)}
        footer={null}
        width={800}
      >
        <div className='space-y-4'>
          <Typography.Text type='tertiary'>
            {t('以下是如何使用 OpenAI Python SDK 调用 NewAPI 的示例代码：')}
          </Typography.Text>
          
          <div className='bg-gray-50 dark:bg-gray-800 p-4 rounded-lg'>
            <Typography.Text type='tertiary' className='block mb-2'>
              {t('请先安装 OpenAI SDK：')} <code>pip3 install openai</code>
            </Typography.Text>
            
            <pre className='text-sm overflow-x-auto bg-gray-900 text-gray-100 p-4 rounded-md'>
{`# 使用 OpenAI Python SDK 调用 NewAPI
import os
from openai import OpenAI

# 从环境变量获取 API 密钥
api_key = os.environ.get("NEWAPI_API_KEY")
if not api_key:
    # 或者从 NewAPI 界面获取令牌
    api_key = "your_token_here"

# 创建客户端，指定 NewAPI 的 base_url
client = OpenAI(
    api_key=api_key,
    base_url="https://your-newapi-domain.com/v1"  # 替换为你的 NewAPI 地址
)

# 调用聊天接口
response = client.chat.completions.create(
    model="gpt-3.5-turbo",  # 使用 NewAPI 支持的模型
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
    stream=False
)

print(response.choices[0].message.content)

# 流式调用示例
stream_response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "user", "content": "Write a short poem about AI."},
    ],
    stream=True
)

for chunk in stream_response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`}
            </pre>
            
            <div className='mt-4 space-y-2'>
              <Typography.Text strong>{t('使用说明：')}</Typography.Text>
              <ul className='list-disc pl-5 space-y-1'>
                <li>
                  <Typography.Text type='tertiary'>
                    {t('1. 将')} <code>your_token_here</code> {t('替换为你的 NewAPI 令牌')}
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t('2. 将')} <code>https://your-newapi-domain.com/v1</code> {t('替换为你的 NewAPI 地址')}
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t('3. 根据你的 NewAPI 配置选择合适的模型名称')}
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t('4. 支持流式和非流式调用')}
                  </Typography.Text>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default TokensActions;