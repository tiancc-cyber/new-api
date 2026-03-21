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
  Button,
  Input,
  Modal,
  TabPane,
  Tabs,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  API,
  fetchTokenKey,
  getServerAddress,
  showError,
} from '../../../helpers';
import CopyTokensModal from './modals/CopyTokensModal';
import DeleteTokensModal from './modals/DeleteTokensModal';

const DEFAULT_MODEL_NAME = 'gpt-4o-mini';
const DEFAULT_API_KEY_PLACEHOLDER = 'sk-your_token_here';

const buildOpenAIBaseUrl = () => {
  const serverAddress = getServerAddress().replace(/\/+$/, '');
  return serverAddress.endsWith('/v1') ? serverAddress : `${serverAddress}/v1`;
};

const buildExampleApiKey = (tokenKey) =>
  tokenKey ? `sk-${tokenKey}` : DEFAULT_API_KEY_PLACEHOLDER;

const buildPythonExample = ({
  apiKey,
  baseUrl,
  model,
}) => `# Please install OpenAI SDK first: \`pip3 install openai\`

import os

from openai import OpenAI


client = OpenAI(
    api_key=os.environ.get('NEWAPI_API_KEY') or '${apiKey}',
    base_url='${baseUrl}'
)


response = client.chat.completions.create(
    model='${model}',
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    stream=False
)


print(response.choices[0].message.content)`;

const buildCurlExample = ({
  apiKey,
  baseUrl,
  model,
}) => `curl '${baseUrl}/chat/completions' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${apiKey}' \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant"},
      {"role": "user", "content": "Hello"}
    ],
    "stream": false
  }'`;

const buildJavaScriptExample = ({
  apiKey,
  baseUrl,
  model,
}) => `// Please install OpenAI SDK first: npm install openai

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NEWAPI_API_KEY || '${apiKey}',
  baseURL: '${baseUrl}',
});

async function main() {
  const response = await client.chat.completions.create({
    model: '${model}',
    messages: [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ],
    stream: false,
  });

  console.log(response.choices[0].message.content);
}

main().catch(console.error);`;

const buildGoExample = ({ apiKey, baseUrl, model }) => `package main

import (
    "bytes"
    "fmt"
    "io"
    "net/http"
    "os"
)

func main() {
    apiKey := os.Getenv("NEWAPI_API_KEY")
    if apiKey == "" {
        apiKey = "${apiKey}"
    }

    payload := []byte(\`{
  "model": "${model}",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello"}
  ],
  "stream": false
}\`)

    req, err := http.NewRequest(http.MethodPost, "${baseUrl}/chat/completions", bytes.NewBuffer(payload))
    if err != nil {
        panic(err)
    }

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+apiKey)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }

    fmt.Println(string(body))
}`;

const TokensActions = ({
  selectedKeys,
  setEditingToken,
  setShowEdit,
  batchCopyTokens,
  batchDeleteTokens,
  t,
}) => {
  const openAIBaseUrl = buildOpenAIBaseUrl();
  // Modal states
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCodeExamples, setShowCodeExamples] = useState(false);
  const [activeExampleTab, setActiveExampleTab] = useState('python');
  const [exampleTokenKey, setExampleTokenKey] = useState('');
  const [exampleModel, setExampleModel] = useState(DEFAULT_MODEL_NAME);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isLoadingTokenKey, setIsLoadingTokenKey] = useState(false);
  const [didAutofillModel, setDidAutofillModel] = useState(false);
  const [didAutofillToken, setDidAutofillToken] = useState(false);

  const exampleApiKey = useMemo(
    () => buildExampleApiKey(exampleTokenKey),
    [exampleTokenKey],
  );

  const codeExamples = useMemo(
    () => ({
      python: buildPythonExample({
        apiKey: exampleApiKey,
        baseUrl: openAIBaseUrl,
        model: exampleModel,
      }),
      curl: buildCurlExample({
        apiKey: exampleApiKey,
        baseUrl: openAIBaseUrl,
        model: exampleModel,
      }),
      javascript: buildJavaScriptExample({
        apiKey: exampleApiKey,
        baseUrl: openAIBaseUrl,
        model: exampleModel,
      }),
      go: buildGoExample({
        apiKey: exampleApiKey,
        baseUrl: openAIBaseUrl,
        model: exampleModel,
      }),
    }),
    [exampleApiKey, exampleModel, openAIBaseUrl],
  );

  const activeExampleCode =
    codeExamples[activeExampleTab] || codeExamples.python;

  const tokenStatusText = useMemo(() => {
    if (isLoadingTokenKey) {
      return t('正在读取当前选中的令牌...');
    }
    if (didAutofillToken) {
      return t('已自动填充当前选中的令牌');
    }
    if (selectedKeys.length > 1) {
      return t(
        '当前选择了多个令牌，未自动填充真实 API Key，请按需替换示例中的占位符',
      );
    }
    if (selectedKeys.length === 0) {
      return t('未选择令牌，示例中将使用占位符 API Key');
    }
    return t('未能读取当前选中的令牌，示例中将使用占位符 API Key');
  }, [didAutofillToken, isLoadingTokenKey, selectedKeys.length, t]);

  const modelStatusText = useMemo(() => {
    if (isLoadingModel) {
      return t('正在加载当前可用模型...');
    }
    if (didAutofillModel) {
      return t('已自动填充一个当前可用模型，你也可以手动修改');
    }
    return t('未获取到模型列表，已使用默认模型名称，你可以手动修改');
  }, [didAutofillModel, isLoadingModel, t]);

  useEffect(() => {
    if (!showCodeExamples) {
      return undefined;
    }

    let cancelled = false;

    const loadAvailableModel = async () => {
      setIsLoadingModel(true);
      setDidAutofillModel(false);
      try {
        const res = await API.get('/api/user/models');
        const { success, data } = res.data || {};
        if (!cancelled && success && Array.isArray(data) && data.length > 0) {
          setExampleModel(data[0]);
          setDidAutofillModel(true);
        }
      } catch (_) {
        if (!cancelled) {
          setExampleModel(DEFAULT_MODEL_NAME);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModel(false);
        }
      }
    };

    loadAvailableModel();

    return () => {
      cancelled = true;
    };
  }, [showCodeExamples]);

  useEffect(() => {
    if (!showCodeExamples) {
      return undefined;
    }

    let cancelled = false;

    const loadSelectedTokenKey = async () => {
      if (selectedKeys.length !== 1) {
        setExampleTokenKey('');
        setDidAutofillToken(false);
        setIsLoadingTokenKey(false);
        return;
      }

      const tokenId = selectedKeys[0]?.id || selectedKeys[0];
      if (!tokenId) {
        setExampleTokenKey('');
        setDidAutofillToken(false);
        setIsLoadingTokenKey(false);
        return;
      }

      setIsLoadingTokenKey(true);
      try {
        const tokenKey = await fetchTokenKey(tokenId);
        if (!cancelled) {
          setExampleTokenKey(tokenKey);
          setDidAutofillToken(true);
        }
      } catch (_) {
        if (!cancelled) {
          setExampleTokenKey('');
          setDidAutofillToken(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTokenKey(false);
        }
      }
    };

    loadSelectedTokenKey();

    return () => {
      cancelled = true;
    };
  }, [selectedKeys, showCodeExamples]);

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

  const handleOpenCodeExamples = () => {
    setActiveExampleTab('python');
    setExampleModel(DEFAULT_MODEL_NAME);
    setShowCodeExamples(true);
  };

  const handleCopyExample = () => {
    Toast.success({ content: t('已复制当前示例代码') });
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
          onClick={handleOpenCodeExamples}
          size='small'
        >
          {t('代码示例')}
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
        title={t('OpenAI 代码示例')}
        visible={showCodeExamples}
        onCancel={() => setShowCodeExamples(false)}
        footer={null}
        width={920}
      >
        <div className='space-y-4'>
          <Typography.Text type='tertiary'>
            {t(
              '下面提供了 Python、curl、JavaScript 和 Go 四种调用 NewAPI OpenAI 兼容接口的示例。',
            )}
          </Typography.Text>

          <div className='bg-gray-50 dark:bg-gray-800 p-4 rounded-lg'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mb-4'>
              <div>
                <Typography.Text strong>{t('模型名称')}</Typography.Text>
                <Input
                  className='mt-2'
                  value={exampleModel}
                  onChange={setExampleModel}
                  placeholder={DEFAULT_MODEL_NAME}
                />
                <Typography.Text type='tertiary' className='block mt-2'>
                  {modelStatusText}
                </Typography.Text>
              </div>

              <div>
                <Typography.Text strong>{t('API Key 状态')}</Typography.Text>
                <Typography.Text type='tertiary' className='block mt-2'>
                  {tokenStatusText}
                </Typography.Text>
                <Typography.Text type='tertiary' className='block mt-2'>
                  {t('base_url：')} <code>{openAIBaseUrl}</code>
                </Typography.Text>
              </div>
            </div>

            <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
              <Typography.Text type='tertiary'>
                {t(
                  '当前标签页支持一键复制，Python 和 JavaScript 示例使用官方 OpenAI SDK。',
                )}
              </Typography.Text>
              <Typography.Text
                copyable={{
                  content: activeExampleCode,
                  onCopy: handleCopyExample,
                }}
                type='tertiary'
              >
                {t('复制当前示例')}
              </Typography.Text>
            </div>

            <Tabs
              type='card'
              activeKey={activeExampleTab}
              onChange={setActiveExampleTab}
            >
              <TabPane tab='Python' itemKey='python'>
                <pre className='text-sm overflow-x-auto bg-gray-900 text-gray-100 p-4 rounded-md'>
                  {codeExamples.python}
                </pre>
              </TabPane>
              <TabPane tab='curl' itemKey='curl'>
                <pre className='text-sm overflow-x-auto bg-gray-900 text-gray-100 p-4 rounded-md'>
                  {codeExamples.curl}
                </pre>
              </TabPane>
              <TabPane tab='JavaScript' itemKey='javascript'>
                <pre className='text-sm overflow-x-auto bg-gray-900 text-gray-100 p-4 rounded-md'>
                  {codeExamples.javascript}
                </pre>
              </TabPane>
              <TabPane tab='Go' itemKey='go'>
                <pre className='text-sm overflow-x-auto bg-gray-900 text-gray-100 p-4 rounded-md'>
                  {codeExamples.go}
                </pre>
              </TabPane>
            </Tabs>

            <div className='mt-4 space-y-2'>
              <Typography.Text strong>{t('使用说明：')}</Typography.Text>
              <ul className='list-disc pl-5 space-y-1'>
                <li>
                  <Typography.Text type='tertiary'>
                    {t(
                      '1. 当你只选中了一个令牌时，示例会自动填充真实 API Key；否则请手动替换',
                    )}{' '}
                    <code>{DEFAULT_API_KEY_PLACEHOLDER}</code>
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t(
                      '2. 示例会自动读取一个当前可用模型，你也可以在上方输入框中手动修改模型名称',
                    )}
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t('3. base_url 已自动指向当前站点的 OpenAI 兼容接口：')}{' '}
                    <code>{openAIBaseUrl}</code>
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t('4. 推荐优先使用环境变量')} <code>NEWAPI_API_KEY</code>，
                    {t('代码中的真实 Key 或占位符更适合用来快速联调和排查问题')}
                  </Typography.Text>
                </li>
                <li>
                  <Typography.Text type='tertiary'>
                    {t(
                      '5. Python 与 JavaScript 示例使用官方 OpenAI SDK，curl 与 Go 示例直接请求兼容接口，便于快速测试',
                    )}
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
