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
  IconMail,
  IconPhone,
  IconClock,
  IconCopy,
  IconScan,
} from '@douyinfe/semi-icons';
import { API, showSuccess } from '../../helpers';
import { Button, Card, Modal, Spin, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const About = () => {
  const { t } = useTranslation();
  const { Title, Text } = Typography;
  const [qrPreviewVisible, setQrPreviewVisible] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [remoteAbout, setRemoteAbout] = useState('');

  const copyToClipboard = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(t('已复制'));
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    // 复用后端 /api/about 的配置能力：
    // - 若 About 是 JSON：按联系我们配置解析；
    // - 否则：使用默认值。
    const load = async () => {
      setContactLoading(true);
      try {
        const res = await API.get('/api/about');
        const { success, data } = res.data || {};
        if (success && typeof data === 'string') {
          setRemoteAbout(data);
        }
      } catch (e) {
        // ignore
      } finally {
        setContactLoading(false);
      }
    };
    load();
  }, []);

  const contactInfo = useMemo(() => {
    const defaults = {
      email: 'vtokenai@163.com',
      phone: '+86 186-4907-5010',
      online_time: '周一至周五 9:00 - 18:00 (GMT+8)',
    };
    if (!remoteAbout) {
      return defaults;
    }
    try {
      const obj = JSON.parse(remoteAbout);
      if (!obj || typeof obj !== 'object') return defaults;
      return {
        email:
          typeof obj.email === 'string' && obj.email
            ? obj.email
            : defaults.email,
        phone:
          typeof obj.phone === 'string' && obj.phone
            ? obj.phone
            : defaults.phone,
        online_time:
          typeof obj.online_time === 'string' && obj.online_time
            ? obj.online_time
            : defaults.online_time,
      };
    } catch (e) {
      return defaults;
    }
  }, [remoteAbout]);

  return (
    <div className='pt-[84px] pb-10 px-3 w-full max-w-6xl mx-auto'>
      {/* 顶部标题区域：参考首页的渐变/光晕氛围 */}
      <div className='contact-hero-panel relative overflow-hidden rounded-3xl border border-semi-color-border bg-semi-color-bg-1 px-6 py-6 mb-6'>
        <div
          className='absolute -top-24 -right-16 w-[320px] h-[320px] rounded-full'
          style={{
            background: 'rgba(168, 85, 247, 0.14)',
            filter: 'blur(12px)',
          }}
        />
        <div
          className='absolute inset-0 pointer-events-none'
          style={{
            background:
              'repeating-linear-gradient(90deg, rgba(124, 58, 237, 0.04) 0, rgba(124, 58, 237, 0.04) 1px, transparent 1px, transparent 24px)',
            opacity: 0.22,
          }}
        />

        <div className='relative flex items-center justify-between flex-wrap gap-3'>
          <div>
            <Title heading={3} className='!m-0'>
              {t('联系我们')}
            </Title>
            <Text type='tertiary' size='small'>
              {t('如需支持或合作，请通过以下方式联系，我们会尽快回复。')}
            </Text>
          </div>
          <div className='rounded-full border border-semi-color-border bg-semi-color-fill-0 px-4 py-2'>
            <Text size='small'>{t('工作日快速响应')}</Text>
          </div>
        </div>
      </div>

      {/* 4 区块布局：微信 / 邮箱 / 电话 / 在线时间 */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <Card className='!rounded-2xl !border-0 bg-semi-color-bg-1 h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(20,7,37,0.10)]'>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='w-9 h-9 rounded-xl flex items-center justify-center bg-semi-color-fill-0 border border-semi-color-border'>
                <IconScan />
              </div>
              <div>
                <Text strong>{t('微信')}</Text>
                <div>
                  <Text type='tertiary' size='small'>
                    {t('扫码添加')}
                  </Text>
                </div>
              </div>
            </div>
            <button
              type='button'
              className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-2 flex items-center justify-center cursor-pointer w-full'
              onClick={() => setQrPreviewVisible(true)}
              title={t('点击放大')}
            >
              <img
                src='/qrcode.jpg'
                alt={t('微信二维码')}
                style={{ width: 140, height: 140, objectFit: 'contain' }}
              />
            </button>
            <Text type='tertiary' size='small'>
              {t('扫码添加微信')}
            </Text>
          </div>
        </Card>

        <Card className='!rounded-2xl !border-0 bg-semi-color-bg-1 h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(20,7,37,0.10)]'>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='w-9 h-9 rounded-xl flex items-center justify-center bg-semi-color-fill-0 border border-semi-color-border'>
                <IconMail />
              </div>
              <div>
                <Text strong>{t('联系邮箱')}</Text>
                <div>
                  <Text type='tertiary' size='small'>
                    {t('技术支持 / 合作咨询')}
                  </Text>
                </div>
              </div>
            </div>

            <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 px-3 py-2 flex items-center justify-between gap-2'>
              <Text className='break-all'>{contactInfo.email}</Text>
              <Button
                theme='borderless'
                type='tertiary'
                icon={<IconCopy />}
                onClick={() => copyToClipboard(contactInfo.email)}
              />
            </div>

            <Text type='tertiary' size='small'>
              {t('优先通过邮件提交问题，我们会尽快回复。')}
            </Text>
          </div>
        </Card>

        <Card className='!rounded-2xl !border-0 bg-semi-color-bg-1 h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(20,7,37,0.10)]'>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='w-9 h-9 rounded-xl flex items-center justify-center bg-semi-color-fill-0 border border-semi-color-border'>
                <IconPhone />
              </div>
              <div>
                <Text strong>{t('联系电话')}</Text>
                <div>
                  <Text type='tertiary' size='small'>
                    {t('紧急问题')}
                  </Text>
                </div>
              </div>
            </div>

            <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 px-3 py-2 flex items-center justify-between gap-2'>
              <Text className='break-all'>{contactInfo.phone}</Text>
              <Button
                theme='borderless'
                type='tertiary'
                icon={<IconCopy />}
                onClick={() => copyToClipboard(contactInfo.phone)}
              />
            </div>

            <Text type='tertiary' size='small'>
              {t('紧急问题可电话联系。')}
            </Text>
          </div>
        </Card>

        <Card className='!rounded-2xl !border-0 bg-semi-color-bg-1 h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(20,7,37,0.10)]'>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='w-9 h-9 rounded-xl flex items-center justify-center bg-semi-color-fill-0 border border-semi-color-border'>
                <IconClock />
              </div>
              <div>
                <Text strong>{t('在线时间')}</Text>
                <div>
                  <Text type='tertiary' size='small'>
                    {t('服务时间')}
                  </Text>
                </div>
              </div>
            </div>
            <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 px-3 py-2'>
              {contactLoading ? (
                <Spin size='small' />
              ) : (
                <Text>{t(contactInfo.online_time)}</Text>
              )}
            </div>
            <Text type='tertiary' size='small'>
              {t('非工作时间的消息将顺延处理。')}
            </Text>
          </div>
        </Card>
      </div>

      <Modal
        title={t('微信二维码')}
        visible={qrPreviewVisible}
        centered
        footer={null}
        onCancel={() => setQrPreviewVisible(false)}
      >
        <div className='flex justify-center'>
          <img
            src='/qrcode.jpg'
            alt={t('微信二维码')}
            style={{ width: 320, height: 320, objectFit: 'contain' }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default About;
