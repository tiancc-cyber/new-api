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

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import {
  API,
  getLogo,
  showError,
  showInfo,
  showSuccess,
  updateAPI,
  getSystemName,
  getOAuthProviderIcon,
  setUserData,
  onGitHubOAuthClicked,
  onDiscordOAuthClicked,
  onOIDCClicked,
  onLinuxDOOAuthClicked,
  onCustomOAuthClicked,
  prepareCredentialRequestOptions,
  buildAssertionResult,
  isPasskeySupported,
} from '../../helpers';
import Turnstile from 'react-turnstile';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Icon,
  Input,
  Modal,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconGithubLogo,
  IconKey,
  IconLock,
  IconMail,
  IconUser,
} from '@douyinfe/semi-icons';
import TelegramLoginButton from 'react-telegram-login';
import OIDCIcon from '../common/logo/OIDCIcon';
import WeChatIcon from '../common/logo/WeChatIcon';
import LinuxDoIcon from '../common/logo/LinuxDoIcon';
import TwoFAVerification from './TwoFAVerification';
import { useTranslation } from 'react-i18next';
import { SiDiscord } from 'react-icons/si';

const { Text, Title } = Typography;

const AUTH_METHOD_PASSWORD = 'password';
const AUTH_METHOD_EMAIL = 'email';
const AUTH_METHOD_SMS = 'sms';

const UnifiedAuthForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);

  const githubButtonTextKeyByState = {
    idle: '使用 GitHub 继续',
    redirecting: '正在跳转 GitHub...',
    timeout: '请求超时，请刷新页面后重新发起 GitHub 登录',
  };

  const [inputs, setInputs] = useState({
    username: '',
    password: '',
    email: '',
    email_code: '',
    phone: '',
    country_code: '+86',
    sms_code: '',
    signup_email: '',
    signup_verification_code: '',
    wechat_verification_code: '',
  });
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showWeChatLoginModal, setShowWeChatLoginModal] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [linuxdoLoading, setLinuxdoLoading] = useState(false);
  const [passwordAuthLoading, setPasswordAuthLoading] = useState(false);
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [smsAuthLoading, setSMSAuthLoading] = useState(false);
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);
  const [smsCodeLoading, setSMSCodeLoading] = useState(false);
  const [wechatCodeSubmitLoading, setWechatCodeSubmitLoading] = useState(false);
  const [showTwoFA, setShowTwoFA] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [hasUserAgreement, setHasUserAgreement] = useState(false);
  const [hasPrivacyPolicy, setHasPrivacyPolicy] = useState(false);
  const [githubButtonState, setGithubButtonState] = useState('idle');
  const [githubButtonDisabled, setGithubButtonDisabled] = useState(false);
  const [customOAuthLoading, setCustomOAuthLoading] = useState({});
  const [emailCountdown, setEmailCountdown] = useState(0);
  const [smsCountdown, setSMSCountdown] = useState(0);
  const githubTimeoutRef = useRef(null);

  const logo = getLogo();
  const systemName = getSystemName();
  const affCode = searchParams.get('aff');
  const desiredMode = searchParams.get('mode') || '';
  const desiredMethod = searchParams.get('method') || '';
  const githubButtonText = t(githubButtonTextKeyByState[githubButtonState]);

  if (affCode) {
    localStorage.setItem('aff', affCode);
  }

  const status = useMemo(() => {
    if (statusState?.status) return statusState.status;
    const savedStatus = localStorage.getItem('status');
    if (!savedStatus) return {};
    try {
      return JSON.parse(savedStatus) || {};
    } catch (err) {
      return {};
    }
  }, [statusState?.status]);

  const hasCustomOAuthProviders =
    (status.custom_oauth_providers || []).length > 0;
  const hasOAuthLoginOptions = Boolean(
    status.github_oauth ||
      status.discord_oauth ||
      status.oidc_enabled ||
      status.wechat_login ||
      status.linuxdo_oauth ||
      status.telegram_oauth ||
      status.passkey_login ||
      hasCustomOAuthProviders,
  );

  const availableMethods = useMemo(() => {
    const methods = [];
    if (status.sms_auth_enabled) {
      methods.push(AUTH_METHOD_SMS);
    }
    if (status.email_auth_enabled) {
      methods.push(AUTH_METHOD_EMAIL);
    }
    if (status.password_login_enabled || status.password_register_enabled) {
      methods.push(AUTH_METHOD_PASSWORD);
    }
    if (methods.length === 0) {
      methods.push(AUTH_METHOD_PASSWORD);
    }
    return methods;
  }, [
    status.email_auth_enabled,
    status.password_login_enabled,
    status.password_register_enabled,
    status.sms_auth_enabled,
  ]);

  const [authMethod, setAuthMethod] = useState(() => {
    if (location.pathname === '/register') {
      return AUTH_METHOD_PASSWORD;
    }
    if (
      [AUTH_METHOD_PASSWORD, AUTH_METHOD_EMAIL, AUTH_METHOD_SMS].includes(
        desiredMethod,
      )
    ) {
      return desiredMethod;
    }
    return AUTH_METHOD_PASSWORD;
  });

  useEffect(() => {
    const validMethods = [
      AUTH_METHOD_PASSWORD,
      AUTH_METHOD_EMAIL,
      AUTH_METHOD_SMS,
    ];
    const preferredMethod = validMethods.includes(desiredMethod)
      ? desiredMethod
      : location.pathname === '/register'
        ? AUTH_METHOD_PASSWORD
        : null;

    if (preferredMethod && preferredMethod !== authMethod) {
      setAuthMethod(preferredMethod);
      return;
    }

    if (!validMethods.includes(authMethod)) {
      setAuthMethod(AUTH_METHOD_PASSWORD);
    }
  }, [authMethod, desiredMethod, location.pathname]);

  useEffect(() => {
    if (status?.turnstile_check) {
      setTurnstileEnabled(true);
      setTurnstileSiteKey(status.turnstile_site_key);
    }
    setHasUserAgreement(status?.user_agreement_enabled || false);
    setHasPrivacyPolicy(status?.privacy_policy_enabled || false);
    if (status?.sms_default_country_code) {
      setInputs((prev) => ({
        ...prev,
        country_code: status.sms_default_country_code,
      }));
    }
  }, [status]);

  useEffect(() => {
    isPasskeySupported()
      .then(setPasskeySupported)
      .catch(() => setPasskeySupported(false));
    return () => {
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('expired')) {
      showError(t('未登录或登录已过期，请重新登录'));
    }
  }, [searchParams, t]);

  useEffect(() => {
    if (emailCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setEmailCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [emailCountdown]);

  useEffect(() => {
    if (smsCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setSMSCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [smsCountdown]);

  const setInputValue = (name, value) => {
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  const ensureTermsAccepted = () => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return false;
    }
    return true;
  };

  const ensureTurnstileVerified = () => {
    if (turnstileEnabled && turnstileToken === '') {
      showInfo(t('请稍后几秒重试，Turnstile 正在检查用户环境！'));
      return false;
    }
    return true;
  };

  const getAffiliateCode = () => affCode || localStorage.getItem('aff') || '';

  const finishAuth = (data, successMessage = '登录成功！') => {
    userDispatch({ type: 'login', payload: data });
    setUserData(data);
    updateAPI();
    showSuccess(t(successMessage));
    navigate('/console');
  };

  const handlePasswordAuth = async () => {
    if (!ensureTermsAccepted() || !ensureTurnstileVerified()) {
      return;
    }
    if (!inputs.username || !inputs.password) {
      showInfo(t('请输入用户名和密码！'));
      return;
    }
    setPasswordAuthLoading(true);
    try {
      const res = await API.post(
        `/api/user/auth/password?turnstile=${turnstileToken}`,
        {
          username: inputs.username,
          password: inputs.password,
          email: inputs.signup_email,
          verification_code: inputs.signup_verification_code,
          aff_code: getAffiliateCode(),
        },
      );
      const { success, message, data } = res.data;
      if (success) {
        if (data && data.require_2fa) {
          setShowTwoFA(true);
          return;
        }
        const authMessage = desiredMode === 'signup' || location.pathname === '/register'
          ? '注册/登录成功！'
          : '登录成功！';
        finishAuth(data, authMessage);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('登录失败，请重试'));
    } finally {
      setPasswordAuthLoading(false);
    }
  };

  const handleEmailCodeAuth = async () => {
    if (!ensureTermsAccepted() || !ensureTurnstileVerified()) {
      return;
    }
    if (!inputs.email || !inputs.email_code) {
      showInfo(t('请输入邮箱和验证码！'));
      return;
    }
    setEmailAuthLoading(true);
    try {
      const res = await API.post(
        `/api/user/auth/code?turnstile=${turnstileToken}`,
        {
          channel: AUTH_METHOD_EMAIL,
          email: inputs.email,
          code: inputs.email_code,
          aff_code: getAffiliateCode(),
        },
      );
      const { success, message, data } = res.data;
      if (success) {
        finishAuth(data, '登录/注册成功！');
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('登录失败，请重试'));
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleSMSCodeAuth = async () => {
    if (!ensureTermsAccepted() || !ensureTurnstileVerified()) {
      return;
    }
    if (!inputs.phone || !inputs.sms_code) {
      showInfo(t('请输入手机号和验证码！'));
      return;
    }
    setSMSAuthLoading(true);
    try {
      const res = await API.post(
        `/api/user/auth/code?turnstile=${turnstileToken}`,
        {
          channel: AUTH_METHOD_SMS,
          country_code: inputs.country_code,
          phone: inputs.phone,
          code: inputs.sms_code,
          aff_code: getAffiliateCode(),
        },
      );
      const { success, message, data } = res.data;
      if (success) {
        finishAuth(data, '登录/注册成功！');
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('登录失败，请重试'));
    } finally {
      setSMSAuthLoading(false);
    }
  };

  const sendEmailCode = async () => {
    if (!ensureTurnstileVerified()) {
      return;
    }
    if (!inputs.email) {
      showInfo(t('请输入邮箱地址'));
      return;
    }
    setEmailCodeLoading(true);
    try {
      const res = await API.get(
        `/api/verification/auth?email=${encodeURIComponent(inputs.email)}&turnstile=${turnstileToken}`,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('验证码发送成功，请检查你的邮箱！'));
        setEmailCountdown(60);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('发送验证码失败，请重试'));
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const sendSMSCode = async () => {
    if (!ensureTurnstileVerified()) {
      return;
    }
    if (!inputs.phone) {
      showInfo(t('请输入手机号'));
      return;
    }
    setSMSCodeLoading(true);
    try {
      const res = await API.get(
        `/api/sms/verification?country_code=${encodeURIComponent(inputs.country_code)}&phone=${encodeURIComponent(inputs.phone)}&turnstile=${turnstileToken}`,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('验证码发送成功，请查收短信！'));
        setSMSCountdown(60);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('发送验证码失败，请重试'));
    } finally {
      setSMSCodeLoading(false);
    }
  };

  const sendSignupEmailCode = async () => {
    if (!ensureTurnstileVerified()) {
      return;
    }
    if (!inputs.signup_email) {
      showInfo(t('请输入邮箱地址'));
      return;
    }
    setEmailCodeLoading(true);
    try {
      const res = await API.get(
        `/api/verification?email=${encodeURIComponent(inputs.signup_email)}&turnstile=${turnstileToken}`,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('验证码发送成功，请检查你的邮箱！'));
        setEmailCountdown(60);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('发送验证码失败，请重试'));
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const onWeChatLoginClicked = () => {
    if (!ensureTermsAccepted()) {
      return;
    }
    setWechatLoading(true);
    setShowWeChatLoginModal(true);
    setWechatLoading(false);
  };

  const onSubmitWeChatVerificationCode = async () => {
    if (!ensureTurnstileVerified()) {
      return;
    }
    setWechatCodeSubmitLoading(true);
    try {
      const res = await API.get(
        `/api/oauth/wechat?code=${inputs.wechat_verification_code}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        finishAuth(data);
        setShowWeChatLoginModal(false);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('登录失败，请重试'));
    } finally {
      setWechatCodeSubmitLoading(false);
    }
  };

  const onTelegramLoginClicked = async (response) => {
    if (!ensureTermsAccepted()) {
      return;
    }
    const fields = [
      'id',
      'first_name',
      'last_name',
      'username',
      'photo_url',
      'auth_date',
      'hash',
      'lang',
    ];
    const params = {};
    fields.forEach((field) => {
      if (response[field]) {
        params[field] = response[field];
      }
    });
    try {
      const res = await API.get(`/api/oauth/telegram/login`, { params });
      const { success, message, data } = res.data;
      if (success) {
        finishAuth(data);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('登录失败，请重试'));
    }
  };

  const handleGitHubClick = () => {
    if (!ensureTermsAccepted()) {
      return;
    }
    if (githubButtonDisabled) {
      return;
    }
    setGithubLoading(true);
    setGithubButtonDisabled(true);
    setGithubButtonState('redirecting');
    if (githubTimeoutRef.current) {
      clearTimeout(githubTimeoutRef.current);
    }
    githubTimeoutRef.current = setTimeout(() => {
      setGithubLoading(false);
      setGithubButtonState('timeout');
      setGithubButtonDisabled(true);
    }, 20000);
    try {
      onGitHubOAuthClicked(status.github_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setGithubLoading(false), 3000);
    }
  };

  const handleDiscordClick = () => {
    if (!ensureTermsAccepted()) {
      return;
    }
    setDiscordLoading(true);
    try {
      onDiscordOAuthClicked(status.discord_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setDiscordLoading(false), 3000);
    }
  };

  const handleOIDCClick = () => {
    if (!ensureTermsAccepted()) {
      return;
    }
    setOidcLoading(true);
    try {
      onOIDCClicked(
        status.oidc_authorization_endpoint,
        status.oidc_client_id,
        false,
        { shouldLogout: true },
      );
    } finally {
      setTimeout(() => setOidcLoading(false), 3000);
    }
  };

  const handleLinuxDOClick = () => {
    if (!ensureTermsAccepted()) {
      return;
    }
    setLinuxdoLoading(true);
    try {
      onLinuxDOOAuthClicked(status.linuxdo_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setLinuxdoLoading(false), 3000);
    }
  };

  const handleCustomOAuthClick = (provider) => {
    if (!ensureTermsAccepted()) {
      return;
    }
    setCustomOAuthLoading((prev) => ({ ...prev, [provider.slug]: true }));
    try {
      onCustomOAuthClicked(provider, { shouldLogout: true });
    } finally {
      setTimeout(() => {
        setCustomOAuthLoading((prev) => ({
          ...prev,
          [provider.slug]: false,
        }));
      }, 3000);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!ensureTermsAccepted()) {
      return;
    }
    if (!passkeySupported || !window.PublicKeyCredential) {
      showInfo(t('当前浏览器不支持 Passkey'));
      return;
    }
    setPasskeyLoading(true);
    try {
      const beginRes = await API.post('/api/user/passkey/login/begin');
      const { success, message, data } = beginRes.data;
      if (!success) {
        showError(message || t('无法发起 Passkey 登录'));
        return;
      }
      const publicKeyOptions = prepareCredentialRequestOptions(
        data?.options || data?.publicKey || data,
      );
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyOptions,
      });
      const payload = buildAssertionResult(assertion);
      if (!payload) {
        showError(t('Passkey 验证失败，请重试'));
        return;
      }
      const finishRes = await API.post('/api/user/passkey/login/finish', payload);
      const finish = finishRes.data;
      if (finish.success) {
        finishAuth(finish.data);
      } else {
        showError(finish.message || t('Passkey 登录失败，请重试'));
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        showInfo(t('已取消 Passkey 登录'));
      } else {
        showError(t('Passkey 登录失败，请重试'));
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handle2FASuccess = (data) => {
    finishAuth(data);
  };

  const handleBackToLogin = () => {
    setShowTwoFA(false);
    setInputs((prev) => ({
      ...prev,
      username: '',
      password: '',
      wechat_verification_code: '',
    }));
  };

  const renderMethodTabs = () => {
    const tabConfig = [
      {
        key: AUTH_METHOD_SMS,
        label: t('短信登录'),
        enabled: availableMethods.includes(AUTH_METHOD_SMS),
      },
      {
        key: AUTH_METHOD_EMAIL,
        label: t('邮箱登录'),
        enabled: availableMethods.includes(AUTH_METHOD_EMAIL),
      },
      {
        key: AUTH_METHOD_PASSWORD,
        label: t('账号登录'),
        enabled: availableMethods.includes(AUTH_METHOD_PASSWORD),
      },
    ];

    return (
      <div className='flex gap-6 border-b border-semi-color-border mb-6'>
        {tabConfig.map((item) => (
          <button
            key={item.key}
            type='button'
            className={`pb-3 text-base font-semibold transition-colors ${
              authMethod === item.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : item.enabled
                  ? 'text-semi-color-text-1'
                  : 'text-semi-color-text-2 opacity-70'
            }`}
            onClick={() => setAuthMethod(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  };

  const renderUnavailableMethodNotice = (title, description) => (
    <div className='space-y-4'>
      <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6'>
        <div className='text-base font-semibold text-semi-color-text-0 mb-2'>
          {title}
        </div>
        <Text type='tertiary'>{description}</Text>
      </div>
      {renderAgreement()}
      <Button theme='solid' type='primary' className='w-full !rounded-full' disabled>
        {t('登录/注册')}
      </Button>
    </div>
  );

  const renderAgreement = () => {
    if (!hasUserAgreement && !hasPrivacyPolicy) {
      return null;
    }
    return (
      <div className='mt-4'>
        <Checkbox
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
        >
          <Text size='small' className='text-gray-600'>
            {t('我已阅读并同意')}
            {hasUserAgreement && (
              <a
                href='/user-agreement'
                target='_blank'
                rel='noopener noreferrer'
                className='text-blue-600 hover:text-blue-800 mx-1'
              >
                {t('用户协议')}
              </a>
            )}
            {hasUserAgreement && hasPrivacyPolicy && t('和')}
            {hasPrivacyPolicy && (
              <a
                href='/privacy-policy'
                target='_blank'
                rel='noopener noreferrer'
                className='text-blue-600 hover:text-blue-800 mx-1'
              >
                {t('隐私政策')}
              </a>
            )}
          </Text>
        </Checkbox>
      </div>
    );
  };

  const renderSMSForm = () => (
    !availableMethods.includes(AUTH_METHOD_SMS)
      ? renderUnavailableMethodNotice(
          t('短信登录暂未启用'),
          t('管理员尚未配置短信验证码服务，请先使用邮箱登录或账号登录。'),
        )
      : (
    <div className='space-y-4'>
      <div className='flex gap-3'>
        <Input
          value={inputs.country_code}
          onChange={(value) => setInputValue('country_code', value)}
          className='!w-24'
          placeholder='+86'
        />
        <Input
          value={inputs.phone}
          onChange={(value) => setInputValue('phone', value)}
          className='flex-1'
          placeholder={t('请输入手机号')}
        />
      </div>
      <div className='flex gap-3'>
        <Input
          value={inputs.sms_code}
          onChange={(value) => setInputValue('sms_code', value)}
          className='flex-1'
          placeholder={t('请输入验证码')}
        />
        <Button
          theme='borderless'
          type='primary'
          onClick={sendSMSCode}
          loading={smsCodeLoading}
          disabled={smsCountdown > 0}
        >
          {smsCountdown > 0 ? `${smsCountdown}s` : t('获取验证码')}
        </Button>
      </div>
      <Text type='tertiary' size='small'>
        {t('新手机号将自动创建账户，已注册手机号将直接登录')}
      </Text>
      {renderAgreement()}
      <Button
        theme='solid'
        type='primary'
        className='w-full !rounded-full'
        onClick={handleSMSCodeAuth}
        loading={smsAuthLoading}
      >
        {t('登录/注册')}
      </Button>
    </div>
        )
  );

  const renderEmailForm = () => (
    !availableMethods.includes(AUTH_METHOD_EMAIL)
      ? renderUnavailableMethodNotice(
          t('邮箱登录暂未启用'),
          t('管理员尚未配置邮箱验证码服务，请先使用短信登录或账号登录。'),
        )
      : (
    <div className='space-y-4'>
      <Input
        value={inputs.email}
        onChange={(value) => setInputValue('email', value)}
        placeholder={t('请输入邮箱地址')}
        prefix={<IconMail />}
      />
      <div className='flex gap-3'>
        <Input
          value={inputs.email_code}
          onChange={(value) => setInputValue('email_code', value)}
          className='flex-1'
          placeholder={t('请输入验证码')}
        />
        <Button
          theme='borderless'
          type='primary'
          onClick={sendEmailCode}
          loading={emailCodeLoading}
          disabled={emailCountdown > 0}
        >
          {emailCountdown > 0 ? `${emailCountdown}s` : t('获取验证码')}
        </Button>
      </div>
      <Text type='tertiary' size='small'>
        {t('新邮箱将自动创建账户，已注册邮箱将直接登录')}
      </Text>
      {renderAgreement()}
      <Button
        theme='solid'
        type='primary'
        className='w-full !rounded-full'
        onClick={handleEmailCodeAuth}
        loading={emailAuthLoading}
      >
        {t('登录/注册')}
      </Button>
    </div>
        )
  );

  const renderPasswordForm = () => (
    <div className='space-y-4'>
      <Form className='space-y-4'>
        <Form.Input
          field='username'
          label={t('用户名')}
          placeholder={t('请输入用户名')}
          value={inputs.username}
          onChange={(value) => setInputValue('username', value)}
          prefix={<IconUser />}
        />
        <Form.Input
          field='password'
          label={t('密码')}
          placeholder={t('请输入密码')}
          mode='password'
          value={inputs.password}
          onChange={(value) => setInputValue('password', value)}
          prefix={<IconLock />}
        />
        {status.email_verification && (
          <>
            <Form.Input
              field='signup_email'
              label={t('注册邮箱')}
              placeholder={t('新用户注册时请输入邮箱')}
              value={inputs.signup_email}
              onChange={(value) => setInputValue('signup_email', value)}
              prefix={<IconMail />}
            />
            <div className='flex gap-3'>
              <Input
                value={inputs.signup_verification_code}
                onChange={(value) =>
                  setInputValue('signup_verification_code', value)
                }
                className='flex-1'
                placeholder={t('请输入注册验证码')}
              />
              <Button
                theme='borderless'
                type='primary'
                onClick={sendSignupEmailCode}
                loading={emailCodeLoading}
                disabled={emailCountdown > 0}
              >
                {emailCountdown > 0 ? `${emailCountdown}s` : t('获取验证码')}
              </Button>
            </div>
          </>
        )}
      </Form>
      <Text type='tertiary' size='small'>
        {t('新用户名将直接创建账户，已有用户名则直接登录')}
      </Text>
      {renderAgreement()}
      <div className='space-y-2'>
        <Button
          theme='solid'
          type='primary'
          className='w-full !rounded-full'
          onClick={handlePasswordAuth}
          loading={passwordAuthLoading}
        >
          {t('登录/注册')}
        </Button>
        <Button
          theme='borderless'
          type='tertiary'
          className='w-full !rounded-full'
          onClick={() => navigate('/reset')}
        >
          {t('忘记密码？')}
        </Button>
      </div>
    </div>
  );

  const renderOAuthOptions = () => {
    if (!hasOAuthLoginOptions) {
      return null;
    }
    return (
      <>
        <Divider margin='20px' align='center'>
          {t('其他登录方式')}
        </Divider>
        <div className='space-y-3'>
          {status.wechat_login && (
            <Button
              theme='outline'
              type='tertiary'
              className='w-full !rounded-full'
              icon={<Icon svg={<WeChatIcon />} style={{ color: '#07C160' }} />}
              onClick={onWeChatLoginClicked}
              loading={wechatLoading}
            >
              {t('使用 微信 继续')}
            </Button>
          )}
          {status.github_oauth && (
            <Button
              theme='outline'
              type='tertiary'
              className='w-full !rounded-full'
              icon={<IconGithubLogo size='large' />}
              onClick={handleGitHubClick}
              loading={githubLoading}
              disabled={githubButtonDisabled}
            >
              {githubButtonText}
            </Button>
          )}
          {status.discord_oauth && (
            <Button
              theme='outline'
              type='tertiary'
              className='w-full !rounded-full'
              icon={<SiDiscord style={{ color: '#5865F2', width: 20, height: 20 }} />}
              onClick={handleDiscordClick}
              loading={discordLoading}
            >
              {t('使用 Discord 继续')}
            </Button>
          )}
          {status.oidc_enabled && (
            <Button
              theme='outline'
              type='tertiary'
              className='w-full !rounded-full'
              icon={<OIDCIcon style={{ color: '#1877F2' }} />}
              onClick={handleOIDCClick}
              loading={oidcLoading}
            >
              {t('使用 OIDC 继续')}
            </Button>
          )}
          {status.linuxdo_oauth && (
            <Button
              theme='outline'
              type='tertiary'
              className='w-full !rounded-full'
              icon={<LinuxDoIcon style={{ color: '#E95420', width: 20, height: 20 }} />}
              onClick={handleLinuxDOClick}
              loading={linuxdoLoading}
            >
              {t('使用 LinuxDO 继续')}
            </Button>
          )}
          {status.custom_oauth_providers &&
            status.custom_oauth_providers.map((provider) => (
              <Button
                key={provider.slug}
                theme='outline'
                type='tertiary'
                className='w-full !rounded-full'
                icon={getOAuthProviderIcon(provider.icon || '', 20)}
                onClick={() => handleCustomOAuthClick(provider)}
                loading={customOAuthLoading[provider.slug]}
              >
                {t('使用 {{name}} 继续', { name: provider.name })}
              </Button>
            ))}
          {status.passkey_login && passkeySupported && (
            <Button
              theme='outline'
              type='tertiary'
              className='w-full !rounded-full'
              icon={<IconKey size='large' />}
              onClick={handlePasskeyLogin}
              loading={passkeyLoading}
            >
              {t('使用 Passkey 登录')}
            </Button>
          )}
          {status.telegram_oauth && (
            <div className='flex justify-center py-2'>
              <TelegramLoginButton
                dataOnauth={onTelegramLoginClicked}
                botName={status.telegram_bot_name}
              />
            </div>
          )}
        </div>
      </>
    );
  };

  const renderAuthForm = () => {
    if (authMethod === AUTH_METHOD_SMS) {
      return renderSMSForm();
    }
    if (authMethod === AUTH_METHOD_EMAIL) {
      return renderEmailForm();
    }
    return renderPasswordForm();
  };

  return (
    <div className='relative overflow-hidden bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div
        className='blur-ball blur-ball-indigo'
        style={{ top: '-80px', right: '-80px', transform: 'none' }}
      />
      <div className='blur-ball blur-ball-teal' style={{ top: '50%', left: '-120px' }} />
      <div className='w-full max-w-sm mt-[60px]'>
        <div className='flex items-center justify-center mb-6 gap-2'>
          <img src={logo} alt='Logo' className='h-10 rounded-full' />
          <Title heading={3} className='!text-gray-800'>
            {systemName}
          </Title>
        </div>
        <Card className='border-0 !rounded-2xl overflow-hidden'>
          <div className='px-6 pt-6 pb-8'>
            <Title heading={2} className='!mb-6 !text-gray-800'>
              {t('欢迎注册/登录')}
            </Title>
            {renderMethodTabs()}
            {renderAuthForm()}
            {renderOAuthOptions()}
            {/*{!status.self_use_mode_enabled && (*/}
            {/*  <div className='mt-6 text-center text-sm'>*/}
            {/*    <Text>*/}
            {/*      {t('登录与注册已合并在此页面，可直接选择任一方式继续')}*/}
            {/*    </Text>*/}
            {/*  </div>*/}
            {/*)}*/}
          </div>
        </Card>

        <Modal
          title={t('微信扫码登录')}
          visible={showWeChatLoginModal}
          maskClosable={true}
          onOk={onSubmitWeChatVerificationCode}
          onCancel={() => setShowWeChatLoginModal(false)}
          okText={t('登录')}
          centered={true}
          okButtonProps={{ loading: wechatCodeSubmitLoading }}
        >
          <div className='flex flex-col items-center'>
            <img src={status.wechat_qrcode} alt='微信二维码' className='mb-4' />
          </div>
          <div className='text-center mb-4'>
            <p>{t('微信扫码关注公众号，输入「验证码」获取验证码（三分钟内有效）')}</p>
          </div>
          <Input
            value={inputs.wechat_verification_code}
            onChange={(value) => setInputValue('wechat_verification_code', value)}
            placeholder={t('验证码')}
          />
        </Modal>

        <Modal
          title={
            <div className='flex items-center'>
              <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mr-3'>
                <svg className='w-4 h-4 text-green-600 dark:text-green-400' fill='currentColor' viewBox='0 0 20 20'>
                  <path
                    fillRule='evenodd'
                    d='M6 8a2 2 0 11-4 0 2 2 0 014 0zM8 7a1 1 0 100 2h8a1 1 0 100-2H8zM6 14a2 2 0 11-4 0 2 2 0 014 0zM8 13a1 1 0 100 2h8a1 1 0 100-2H8z'
                    clipRule='evenodd'
                  />
                </svg>
              </div>
              {t('两步验证')}
            </div>
          }
          visible={showTwoFA}
          onCancel={handleBackToLogin}
          footer={null}
          width={450}
          centered
        >
          <TwoFAVerification
            onSuccess={handle2FASuccess}
            onBack={handleBackToLogin}
            isModal={true}
          />
        </Modal>

        {turnstileEnabled && (
          <div className='flex justify-center mt-6'>
            <Turnstile
              sitekey={turnstileSiteKey}
              onVerify={(token) => {
                setTurnstileToken(token);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedAuthForm;

