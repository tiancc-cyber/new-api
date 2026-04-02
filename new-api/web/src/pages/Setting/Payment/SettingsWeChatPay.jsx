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

import React, { useEffect, useState, useRef } from 'react';
import { Button, Form, Row, Col, Typography, Spin, Switch } from '@douyinfe/semi-ui';
const { Text } = Typography;
import {
  API,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

export default function SettingsWeChatPay(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    enabled: false,
    mch_id: '',
    app_id: '',
    api_v3_key: '',
    private_key: '',
    cert_serial: '',
	public_key_id: '',
	public_key_pem: '',
  });
  const [originInputs, setOriginInputs] = useState({});
  const formApiRef = useRef(null);

  useEffect(() => {
    loadWeChatPayConfig();
  }, []);

  const loadWeChatPayConfig = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/wechatpay/config');
      if (res.data.success) {
        const config = res.data.data;
        const currentInputs = {
          enabled: config.enabled || false,
          mch_id: config.mch_id || '',
          app_id: config.app_id || '',
          api_v3_key: config.api_v3_key || '',
          private_key: config.private_key || '',
          cert_serial: config.cert_serial || '',
			public_key_id: config.public_key_id || '',
			public_key_pem: config.public_key_pem || '',
        };
        setInputs(currentInputs);
        setOriginInputs({ ...currentInputs });
        if (formApiRef.current) {
          formApiRef.current.setValues(currentInputs);
        }
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitWeChatPayConfig = async () => {
    setLoading(true);
    try {
      const config = {
        enabled: inputs.enabled,
        mch_id: inputs.mch_id,
        app_id: inputs.app_id,
        api_v3_key: inputs.api_v3_key,
        private_key: inputs.private_key,
        cert_serial: inputs.cert_serial,
		public_key_id: inputs.public_key_id,
		public_key_pem: inputs.public_key_pem,
      };

      const res = await API.put('/api/option/wechatpay/config', config);
      if (res.data.success) {
        showSuccess(t('微信支付配置更新成功'));
        setOriginInputs({ ...inputs });
      } else {
        showError(res.data.data || res.data.message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (formApiRef.current) {
      formApiRef.current.setValues(originInputs);
      setInputs({ ...originInputs });
    }
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={t('微信支付配置')}>
          <Text>
            {t(
              '配置微信支付官方API接口，需要商户号、AppID、APIv3密钥、商户私钥等。',
            )}
          </Text>
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Switch
                field='enabled'
                label={t('启用微信支付')}
                extraText={t('启用后用户可以使用微信支付进行充值')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='mch_id'
                label={t('商户号 (MCHID)')}
                placeholder={t('例如：1900000109')}
                disabled={!inputs.enabled}
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='app_id'
                label={t('AppID')}
                placeholder={t('例如：wx8888888888888888')}
                disabled={!inputs.enabled}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='api_v3_key'
                label={t('APIv3密钥')}
                placeholder={t('32位字符串')}
                type='password'
                disabled={!inputs.enabled}
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='cert_serial'
                label={t('证书序列号')}
                placeholder={t('例如：444F4864B87A5D4F2E3')}
                disabled={!inputs.enabled}
              />
            </Col>
          </Row>
      <Row
        gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
        style={{ marginTop: 16 }}
      >
        <Col xs={24} sm={24} md={12} lg={12} xl={12}>
          <Form.Input
            field='public_key_id'
            label={t('微信支付公钥ID')}
            placeholder={t('例如：PUB_KEY_ID_xxx')}
            disabled={!inputs.enabled}
          />
        </Col>
      </Row>
      <Row
        gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
        style={{ marginTop: 16 }}
      >
        <Col xs={24}>
          <Form.TextArea
            field='public_key_pem'
            label={t('微信支付公钥PEM')}
            placeholder={t('-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----')}
            rows={6}
            disabled={!inputs.enabled}
            extraText={t('在商户平台-API安全申请“微信支付公钥”，粘贴完整 PEM 内容')}
          />
        </Col>
      </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24}>
              <Form.TextArea
                field='private_key'
                label={t('商户私钥')}
                placeholder={t('-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----')}
                rows={8}
                disabled={!inputs.enabled}
                extraText={t('请粘贴完整的PEM格式私钥内容')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24}>
              <Text type='tertiary'>
                {t('注意：配置微信支付需要先在微信支付商户平台获取相关凭证。')}
              </Text>
            </Col>
          </Row>
        </Form.Section>
        <div style={{ marginTop: 16 }}>
          <Button
            type='primary'
            onClick={submitWeChatPayConfig}
            loading={loading}
            disabled={loading}
          >
            {t('保存配置')}
          </Button>
          <Button
            type='tertiary'
            onClick={resetForm}
            style={{ marginLeft: 8 }}
            disabled={loading}
          >
            {t('重置')}
          </Button>
        </div>
      </Form>
    </Spin>
  );
}