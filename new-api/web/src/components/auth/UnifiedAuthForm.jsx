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
  Spin,
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
import MarkdownRenderer from '../common/markdown/MarkdownRenderer';
import { useTranslation } from 'react-i18next';
import { SiDiscord } from 'react-icons/si';

const { Text, Title } = Typography;

const AUTH_METHOD_PASSWORD = 'password';
const AUTH_METHOD_EMAIL = 'email';
const AUTH_METHOD_SMS = 'sms';

const isHtmlContent = (content) => {
  if (!content || typeof content !== 'string') return false;
  return /<\/?[a-z][\s\S]*>/i.test(content);
};

const sanitizeHtml = (html) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const bodyContent = tempDiv.querySelector('body');
  return bodyContent ? bodyContent.innerHTML : html;
};

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
    confirm_password: '',
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
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [agreementContent, setAgreementContent] = useState('');
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [linuxdoLoading, setLinuxdoLoading] = useState(false);
  const [passwordAuthLoading, setPasswordAuthLoading] = useState(false);
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [smsAuthLoading, setSMSAuthLoading] = useState(false);
  const [emailAuthCodeLoading, setEmailAuthCodeLoading] = useState(false);
  const [signupEmailCodeLoading, setSignupEmailCodeLoading] = useState(false);
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
  const [emailAuthCountdown, setEmailAuthCountdown] = useState(0);
  const [signupEmailCountdown, setSignupEmailCountdown] = useState(0);
  const [smsCountdown, setSMSCountdown] = useState(0);
  const githubTimeoutRef = useRef(null);
  const pendingAgreementActionRef = useRef(null);
  const consentGrantedRef = useRef(false);

  const logo = getLogo();
  const systemName = getSystemName();
  const affCode = searchParams.get('aff');
  const desiredMode = searchParams.get('mode') || '';
  const desiredMethod = searchParams.get('method') || '';
  const isRegisterPage =
    location.pathname === '/register' || desiredMode === 'signup';
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
  const emailAuthEnabled = Boolean(
    status.email_auth_enabled || status.email_verification,
  );
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
    if (isRegisterPage) {
      if (status.password_register_enabled) {
        methods.push(AUTH_METHOD_PASSWORD);
      }
    } else {
      if (emailAuthEnabled) {
        methods.push(AUTH_METHOD_EMAIL);
      }
      if (status.password_login_enabled) {
        methods.push(AUTH_METHOD_PASSWORD);
      }
    }
    if (methods.length === 0) {
      methods.push(AUTH_METHOD_PASSWORD);
    }
    return methods;
  }, [
    emailAuthEnabled,
    isRegisterPage,
    status.password_login_enabled,
    status.password_register_enabled,
  ]);

  const loginTabConfig = useMemo(() => {
    if (isRegisterPage) {
      return [];
    }
    const tabs = [];
    if (availableMethods.includes(AUTH_METHOD_EMAIL)) {
      tabs.push({
        key: AUTH_METHOD_EMAIL,
        label: t('邮箱登录'),
      });
    }
    if (availableMethods.includes(AUTH_METHOD_PASSWORD)) {
      tabs.push({
        key: AUTH_METHOD_PASSWORD,
        label: t('账号登录'),
      });
    }
    return tabs;
  }, [availableMethods, isRegisterPage, t]);

  const [authMethod, setAuthMethod] = useState(() => {
    if (location.pathname === '/register') {
      return AUTH_METHOD_PASSWORD;
    }
    if ([AUTH_METHOD_PASSWORD, AUTH_METHOD_EMAIL].includes(desiredMethod)) {
      return desiredMethod;
    }
    return AUTH_METHOD_EMAIL;
  });

  useEffect(() => {
    const validMethods = isRegisterPage
      ? [AUTH_METHOD_PASSWORD]
      : [AUTH_METHOD_PASSWORD, AUTH_METHOD_EMAIL];
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
      setAuthMethod(validMethods[0]);
    }
  }, [authMethod, desiredMethod, isRegisterPage, location.pathname]);

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
    if (emailAuthCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setEmailAuthCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [emailAuthCountdown]);

  useEffect(() => {
    if (signupEmailCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setSignupEmailCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [signupEmailCountdown]);

  useEffect(() => {
    if (smsCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setSMSCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [smsCountdown]);

  useEffect(() => {
    const prefillUsername = searchParams.get('username') || '';
    const prefillEmail = searchParams.get('email') || '';
    if (!prefillUsername && !prefillEmail) {
      return;
    }
    setInputs((prev) => ({
      ...prev,
      username: prefillUsername || prev.username,
      email: prefillEmail || prev.email,
      signup_email: prefillEmail || prev.signup_email,
    }));
  }, [searchParams]);

  useEffect(() => {
    if (availableMethods.includes(authMethod)) {
      return;
    }
    setAuthMethod(availableMethods[0]);
  }, [authMethod, availableMethods]);

  useEffect(() => {
    if (isRegisterPage || desiredMethod) {
      return;
    }
    if (emailAuthEnabled && availableMethods.includes(AUTH_METHOD_EMAIL)) {
      setAuthMethod(AUTH_METHOD_EMAIL);
    }
  }, [availableMethods, desiredMethod, emailAuthEnabled, isRegisterPage]);

  const setInputValue = (name, value) => {
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  const loadAgreementContent = async () => {
    if (agreementContent) {
      return agreementContent;
    }
    const cachedContent = localStorage.getItem('user_agreement') || '';
    if (cachedContent) {
      setAgreementContent(cachedContent);
      return cachedContent;
    }
    setAgreementLoading(true);
    try {
      const res = await API.get('/api/user-agreement');
      const { success, data, message } = res.data;
      if (success && data) {
        setAgreementContent(data);
        localStorage.setItem('user_agreement', data);
        return data;
      }
      showError(message || t('加载用户协议内容失败...'));
    } catch (error) {
      showError(t('加载用户协议内容失败...'));
    } finally {
      setAgreementLoading(false);
    }
    return '';
  };

  const ensureTermsAccepted = async (onAccept) => {
    if (!hasUserAgreement) {
      return true;
    }
    if (agreedToTerms || consentGrantedRef.current) {
      return true;
    }
    pendingAgreementActionRef.current = onAccept || null;
    setShowAgreementModal(true);
    await loadAgreementContent();
    return false;
  };

  const handleAgreementAccepted = () => {
    consentGrantedRef.current = true;
    setAgreedToTerms(true);
    setShowAgreementModal(false);
    const pendingAction = pendingAgreementActionRef.current;
    pendingAgreementActionRef.current = null;
    if (pendingAction) {
      setTimeout(() => {
        pendingAction();
      }, 0);
    }
  };

  const ensureTurnstileVerified = () => {
    if (turnstileEnabled && turnstileToken === '') {
      showInfo(t('请稍后几秒重试，Turnstile 正在检查用户环境！'));
      return false;
    }
    return true;
  };

  const getAffiliateCode = () => affCode || localStorage.getItem('aff') || '';

  const buildRedirectPath = (data = {}) => {
    if (!data.redirect_to) {
      return null;
    }
    const params = new URLSearchParams();
    if (data.redirect_method) {
      params.set('method', data.redirect_method);
    }
    if (data.prefill_username) {
      params.set('username', data.prefill_username);
    }
    if (data.prefill_email) {
      params.set('email', data.prefill_email);
    }
    const affiliateCode = getAffiliateCode();
    if (affiliateCode) {
      params.set('aff', affiliateCode);
    }
    const query = params.toString();
    return query ? `${data.redirect_to}?${query}` : data.redirect_to;
  };

  const handleAuthFailure = (message, data) => {
    const redirectPath = buildRedirectPath(data);
    if (redirectPath) {
      showInfo(message);
      navigate(redirectPath);
      return;
    }
    showError(message);
  };

  const primaryActionButtonClass =
    'auth-primary-button w-full !rounded-xl !border-0 !bg-violet-600 hover:!bg-violet-700 !shadow-[0_12px_28px_rgba(124,58,237,0.28)]';

  const authCardTitle = t(isRegisterPage ? '欢迎注册' : '欢迎登录');
  const currentAuthMethodLabel = isRegisterPage
    ? t('注册')
    : loginTabConfig.find((item) => item.key === authMethod)?.label ||
      t('登录');

  const finishAuth = (data, successMessage = '登录成功！') => {
    userDispatch({ type: 'login', payload: data });
    setUserData(data);
    updateAPI();
    showSuccess(t(successMessage));
    navigate('/console');
  };

  const handlePasswordAuth = async () => {
    if (
      !(await ensureTermsAccepted(() => handlePasswordAuth())) ||
      !ensureTurnstileVerified()
    ) {
      return;
    }
    if (!inputs.username || !inputs.password) {
      showInfo(t('请输入用户名和密码！'));
      return;
    }
    if (isRegisterPage && inputs.password !== inputs.confirm_password) {
      showInfo(t('两次输入的密码不一致'));
      return;
    }
    if (isRegisterPage && !inputs.signup_email) {
      showInfo(t('请输入邮箱地址'));
      return;
    }
    if (isRegisterPage && !inputs.signup_verification_code) {
      showInfo(t('请输入注册验证码'));
      return;
    }
    setPasswordAuthLoading(true);
    try {
      const res = await API.post(
        `/api/user/auth/password?turnstile=${turnstileToken}`,
        {
          mode: isRegisterPage ? 'register' : 'login',
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
        const authMessage = isRegisterPage ? '注册成功！' : '登录成功！';
        finishAuth(data, authMessage);
      } else {
        handleAuthFailure(message, data);
      }
    } catch (error) {
      showError(t(isRegisterPage ? '注册失败，请重试' : '登录失败，请重试'));
    } finally {
      setPasswordAuthLoading(false);
    }
  };

  const handleEmailCodeAuth = async () => {
    if (
      !(await ensureTermsAccepted(() => handleEmailCodeAuth())) ||
      !ensureTurnstileVerified()
    ) {
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
          mode: 'login',
          channel: AUTH_METHOD_EMAIL,
          email: inputs.email,
          code: inputs.email_code,
          aff_code: getAffiliateCode(),
        },
      );
      const { success, message, data } = res.data;
      if (success) {
        finishAuth(data, '登录成功！');
      } else {
        handleAuthFailure(message, data);
      }
    } catch (error) {
      showError(t('登录失败，请重试'));
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleSMSCodeAuth = async () => {
    if (
      !(await ensureTermsAccepted(() => handleSMSCodeAuth())) ||
      !ensureTurnstileVerified()
    ) {
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
          mode: 'login',
          channel: AUTH_METHOD_SMS,
          country_code: inputs.country_code,
          phone: inputs.phone,
          code: inputs.sms_code,
          aff_code: getAffiliateCode(),
        },
      );
      const { success, message, data } = res.data;
      if (success) {
        finishAuth(data, '登录成功！');
      } else {
        handleAuthFailure(message, data);
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
    setEmailAuthCodeLoading(true);
    try {
      const res = await API.get(
        `/api/verification/auth?email=${encodeURIComponent(inputs.email)}&turnstile=${turnstileToken}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(t('验证码发送成功，请检查你的邮箱！'));
        setEmailAuthCountdown(60);
      } else {
        handleAuthFailure(message, data);
      }
    } catch (error) {
      showError(t('发送验证码失败，请重试'));
    } finally {
      setEmailAuthCodeLoading(false);
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
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(t('验证码发送成功，请查收短信！'));
        setSMSCountdown(60);
      } else {
        handleAuthFailure(message, data);
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
    setSignupEmailCodeLoading(true);
    try {
      const res = await API.get(
        `/api/verification?email=${encodeURIComponent(inputs.signup_email)}&turnstile=${turnstileToken}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(t('验证码发送成功，请检查你的邮箱！'));
        setSignupEmailCountdown(60);
      } else {
        handleAuthFailure(message, data);
      }
    } catch (error) {
      showError(t('发送验证码失败，请重试'));
    } finally {
      setSignupEmailCodeLoading(false);
    }
  };

  const onWeChatLoginClicked = async () => {
    if (!(await ensureTermsAccepted(() => onWeChatLoginClicked()))) {
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
    if (!(await ensureTermsAccepted(() => onTelegramLoginClicked(response)))) {
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

  const handleGitHubClick = async () => {
    if (!(await ensureTermsAccepted(() => handleGitHubClick()))) {
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

  const handleDiscordClick = async () => {
    if (!(await ensureTermsAccepted(() => handleDiscordClick()))) {
      return;
    }
    setDiscordLoading(true);
    try {
      onDiscordOAuthClicked(status.discord_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setDiscordLoading(false), 3000);
    }
  };

  const handleOIDCClick = async () => {
    if (!(await ensureTermsAccepted(() => handleOIDCClick()))) {
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

  const handleLinuxDOClick = async () => {
    if (!(await ensureTermsAccepted(() => handleLinuxDOClick()))) {
      return;
    }
    setLinuxdoLoading(true);
    try {
      onLinuxDOOAuthClicked(status.linuxdo_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setLinuxdoLoading(false), 3000);
    }
  };

  const handleCustomOAuthClick = async (provider) => {
    if (!(await ensureTermsAccepted(() => handleCustomOAuthClick(provider)))) {
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
    if (!(await ensureTermsAccepted(() => handlePasskeyLogin()))) {
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
      const finishRes = await API.post(
        '/api/user/passkey/login/finish',
        payload,
      );
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
    if (isRegisterPage || loginTabConfig.length <= 1) {
      return null;
    }

    return (
      <div className='unified-auth-method-tabs'>
        {loginTabConfig.map((item) => (
          <button
            key={item.key}
            type='button'
            className={`unified-auth-method-tab ${
              authMethod === item.key
                ? 'unified-auth-method-tab-active'
                : 'unified-auth-method-tab-inactive'
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
    <div className='space-y-2.5'>
      <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6'>
        <div className='text-base font-semibold text-semi-color-text-0 mb-2'>
          {title}
        </div>
        <Text type='tertiary'>{description}</Text>
      </div>
      {renderAgreement()}
      <Button
        theme='solid'
        type='primary'
        className={primaryActionButtonClass}
        disabled
      >
        {t(isRegisterPage ? '注册' : '登录')}
      </Button>
    </div>
  );

  const renderAgreement = () => {
    if (!hasUserAgreement) {
      return null;
    }
    return (
      <div className='mt-1'>
        <Checkbox
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
        >
          <Text size='small' className='text-gray-500'>
            {t('我已阅读并同意')}
            <a
              href='/user-agreement'
              target='_blank'
              rel='noopener noreferrer'
              className='mx-1 font-medium text-violet-600 hover:text-violet-700'
            >
              {t('《用户协议》')}
            </a>
          </Text>
        </Checkbox>
      </div>
    );
  };

  const renderSMSForm = () =>
    !availableMethods.includes(AUTH_METHOD_SMS) ? (
      renderUnavailableMethodNotice(
        t('短信登录暂未启用'),
        t('管理员尚未配置短信验证码服务，请先使用邮箱登录或账号登录。'),
      )
    ) : (
      <div className='unified-auth-form space-y-2.5'>
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
        {renderAgreement()}
        <Button
          theme='solid'
          type='primary'
          className={primaryActionButtonClass}
          onClick={handleSMSCodeAuth}
          loading={smsAuthLoading}
        >
          {t('登录')}
        </Button>
      </div>
    );

  const renderEmailForm = () =>
    !availableMethods.includes(AUTH_METHOD_EMAIL) ? (
      renderUnavailableMethodNotice(
        t('邮箱登录暂未启用'),
        t('管理员尚未配置邮箱验证码服务，请先使用短信登录或账号登录。'),
      )
    ) : (
      <div className='unified-auth-form space-y-2.5'>
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
            loading={emailAuthCodeLoading}
            disabled={emailAuthCountdown > 0}
            className='!text-violet-600 hover:!text-violet-700'
          >
            {emailAuthCountdown > 0
              ? `${emailAuthCountdown}s`
              : t('获取验证码')}
          </Button>
        </div>
        {renderAgreement()}
        <Button
          theme='solid'
          type='primary'
          className={primaryActionButtonClass}
          onClick={handleEmailCodeAuth}
          loading={emailAuthLoading}
        >
          {t('邮箱登录')}
        </Button>
      </div>
    );

  const renderPasswordForm = () =>
    !availableMethods.includes(AUTH_METHOD_PASSWORD) ? (
      renderUnavailableMethodNotice(
        t(isRegisterPage ? '账号注册暂未启用' : '账号登录暂未启用'),
        t(
          isRegisterPage
            ? '管理员尚未开启账号密码注册，请先使用邮箱登录或短信登录。'
            : '管理员尚未开启账号密码登录，请先使用邮箱登录或短信登录。',
        ),
      )
    ) : (
      <div className='unified-auth-form space-y-2.5'>
        <Input
          value={inputs.username}
          onChange={(value) => setInputValue('username', value)}
          placeholder={t('请输入用户名')}
          prefix={<IconUser />}
        />
        <Input
          value={inputs.password}
          onChange={(value) => setInputValue('password', value)}
          placeholder={
            isRegisterPage
              ? t('输入密码，最短 8 位，最长 20 位')
              : t('请输入密码')
          }
          prefix={<IconLock />}
          mode='password'
        />
        {isRegisterPage && (
          <>
            <Input
              value={inputs.confirm_password}
              onChange={(value) => setInputValue('confirm_password', value)}
              placeholder={t('确认密码')}
              prefix={<IconLock />}
              mode='password'
            />
            <Input
              value={inputs.signup_email}
              onChange={(value) => setInputValue('signup_email', value)}
              placeholder={t('输入邮箱地址')}
              prefix={<IconMail />}
            />
            <div className='flex gap-3'>
              <Input
                value={inputs.signup_verification_code}
                onChange={(value) =>
                  setInputValue('signup_verification_code', value)
                }
                className='flex-1'
                prefix={<IconKey />}
                placeholder={t('输入验证码')}
              />
              <Button
                theme='borderless'
                type='primary'
                onClick={sendSignupEmailCode}
                loading={signupEmailCodeLoading}
                disabled={signupEmailCountdown > 0}
                className='!text-violet-600 hover:!text-violet-700'
              >
                {signupEmailCountdown > 0
                  ? `${signupEmailCountdown}s`
                  : t('获取验证码')}
              </Button>
            </div>
          </>
        )}
        {renderAgreement()}
        <Button
          theme='solid'
          type='primary'
          className={primaryActionButtonClass}
          onClick={handlePasswordAuth}
          loading={passwordAuthLoading}
        >
          {t(isRegisterPage ? '注册' : '登录')}
        </Button>
      </div>
    );

  const renderOAuthOptions = () => {
    if (isRegisterPage || !hasOAuthLoginOptions) {
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
              icon={
                <SiDiscord
                  style={{ color: '#5865F2', width: 20, height: 20 }}
                />
              }
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
              icon={
                <LinuxDoIcon
                  style={{ color: '#E95420', width: 20, height: 20 }}
                />
              }
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
    <div className='unified-auth-page relative flex items-center justify-center overflow-hidden bg-gray-100 px-4 py-6 sm:px-6 lg:px-8'>
      <div
        className='blur-ball blur-ball-indigo'
        style={{ top: '-80px', right: '-80px', transform: 'none' }}
      />
      <div
        className='blur-ball blur-ball-teal'
        style={{ top: '50%', left: '-120px' }}
      />
      <div className='mt-8 w-full max-w-[460px]'>
        <div className='mb-4 flex items-center justify-center gap-2'>
          <img src={logo} alt='Logo' className='h-10 rounded-full' />
          <Title heading={3} className='auth-page-brand-title'>
            {systemName}
          </Title>
        </div>
        <Card className='unified-auth-card overflow-hidden border-0 !rounded-2xl'>
          <div className='unified-auth-card-shell'>
            <Title heading={2} className='unified-auth-card-title'>
              {authCardTitle}
            </Title>
            {renderMethodTabs()}

            <div className='unified-auth-card-body'>
              {renderAuthForm()}
              {renderOAuthOptions()}
            </div>

            <div className='unified-auth-card-footer'>
              <div className='auth-secondary-actions'>
                {!isRegisterPage && (
                  <Button
                    theme='borderless'
                    type='tertiary'
                    className='auth-secondary-link'
                    onClick={() => navigate('/reset')}
                  >
                    {t('忘记密码？')}
                  </Button>
                )}
                <Button
                  theme='borderless'
                  type='tertiary'
                  className='auth-secondary-link'
                  onClick={() =>
                    navigate(
                      isRegisterPage
                        ? `/login${getAffiliateCode() ? `?aff=${getAffiliateCode()}` : ''}`
                        : `/register${getAffiliateCode() ? `?aff=${getAffiliateCode()}` : ''}`,
                    )
                  }
                >
                  {t(isRegisterPage ? '已有账号？去登录' : '没有账号？去注册')}
                </Button>
              </div>
            </div>
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
          title={t('用户协议')}
          visible={showAgreementModal}
          centered
          maskClosable={false}
          width={760}
          onCancel={() => setShowAgreementModal(false)}
          okText={t('同意并继续')}
          cancelText={t('取消')}
          onOk={handleAgreementAccepted}
          okButtonProps={{}}
          bodyStyle={{ maxHeight: '65vh', overflowY: 'auto', padding: '20px' }}
        >
          {agreementLoading ? (
            <div className='flex min-h-[240px] items-center justify-center'>
              <Spin size='large' />
            </div>
          ) : isHtmlContent(agreementContent) ? (
            <div
              className='prose max-w-none text-sm leading-7 text-[var(--semi-color-text-0)]'
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(agreementContent),
              }}
            />
          ) : (
            <div className='prose max-w-none text-sm leading-7 text-[var(--semi-color-text-0)]'>
              <MarkdownRenderer
                content={agreementContent || t('加载用户协议内容失败...')}
              />
            </div>
          )}
        </Modal>

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
            <p>
              {t(
                '微信扫码关注公众号，输入「验证码」获取验证码（三分钟内有效）',
              )}
            </p>
          </div>
          <Input
            value={inputs.wechat_verification_code}
            onChange={(value) =>
              setInputValue('wechat_verification_code', value)
            }
            placeholder={t('验证码')}
          />
        </Modal>

        <Modal
          title={
            <div className='flex items-center'>
              <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mr-3'>
                <svg
                  className='w-4 h-4 text-green-600 dark:text-green-400'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
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
