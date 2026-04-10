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
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { API, showError } from '../../helpers';
import {
  Button,
  Card,
  Typography,
  Skeleton,
  Tag,
  Empty,
} from '@douyinfe/semi-ui';
import MarkdownRenderer from '../../components/common/markdown/MarkdownRenderer';
import { timestamp2string } from '../../helpers/utils';
import PageContainer from '../../components/layout/PageContainer';

import {
  isHtmlContent,
  rehydrateNewApiScripts,
  sanitizeHtmlToSafePayload,
} from '../../helpers/safeHtml';

const { Title, Text } = Typography;

function getThemeMode() {
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  return mql?.matches ? 'dark' : 'light';
}

const ScenarioTutorialDetail = () => {
  const { t } = useTranslation();
  const { md5 } = useParams();
  const navigate = useNavigate();

  const [themeMode, setThemeMode] = useState(getThemeMode());

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);

  const [safeHtmlPayload, setSafeHtmlPayload] = useState({
    content: '',
    styles: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/scenario_tutorial/public/tutorials/md5/${md5}`,
      );
      if (res.data?.success) {
        setRow(res.data?.data);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md5]);

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mql) return;
    const update = () => setThemeMode(mql.matches ? 'dark' : 'light');
    update();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    mql.addListener?.(update);
    return () => mql.removeListener?.(update);
  }, []);

  const ct = String(row?.content_type || 'markdown').toLowerCase();

  const tags = useMemo(() => {
    const raw = String(row?.tags || '').trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [row?.tags]);

  const timeText = useMemo(() => {
    const parts = [];
    if (row?.published_at) {
      parts.push(`${t('发布时间')}: ${timestamp2string(row.published_at)}`);
    }
    if (row?.updated_at) {
      parts.push(`${t('更新时间')}: ${timestamp2string(row.updated_at)}`);
    }
    return parts.join(' / ');
  }, [row?.published_at, row?.updated_at, t]);
  const treatAsHtml = useMemo(() => {
    if (!row?.content) return false;
    if (ct === 'html') return true;
    return isHtmlContent(row.content);
  }, [ct, row?.content]);

  // Prefer iframe rendering for HTML tutorials to avoid CSS conflicts and to make
  // scripts work as expected (scripts inserted via innerHTML won't execute).
  const preferIframe = useMemo(() => {
    if (!treatAsHtml) return false;
    // Allow manual override via content_type
    if (ct === 'html-iframe') return true;
    // Heuristics: if HTML contains script/link/base tags, inline rendering tends to break.
    const raw = row?.content || '';
    return /<\s*(script|link|base)\b/i.test(raw);
  }, [ct, row?.content, treatAsHtml]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!treatAsHtml) {
        setSafeHtmlPayload({ content: '', styles: '' });
        return;
      }
      const payload = await sanitizeHtmlToSafePayload(row?.content || '');
      if (!cancelled) setSafeHtmlPayload(payload);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [treatAsHtml, row?.content]);

  // Inject <style> blocks extracted from HTML content.
  useEffect(() => {
    if (!treatAsHtml) return;
    const styleId = 'scenario-tutorial-detail-html-styles';

    if (safeHtmlPayload.styles) {
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.type = 'text/css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = safeHtmlPayload.styles;
    }

    return () => {
      const styleEl = document.getElementById(styleId);
      if (styleEl) styleEl.remove();
    };
  }, [treatAsHtml, safeHtmlPayload.styles]);

  return (
    <PageContainer>
      {/* Header (unified with system layout & colors) */}
      <div
        style={{
          borderRadius: 16,
          border: '1px solid var(--semi-color-border)',
          background:
            themeMode === 'dark'
              ? 'rgba(88,28,135,0.18)'
              : 'rgba(124,58,237,0.10)',
          position: 'relative',
          overflow: 'hidden',
          padding: 14,
          marginBottom: 12,
        }}
      >
        {/* subtle noise texture to avoid "muddy" gradients */}
        <div
          aria-hidden='true'
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: themeMode === 'dark' ? 0.1 : 0.08,
            mixBlendMode: themeMode === 'dark' ? 'overlay' : 'multiply',
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27%3E%3Cfilter id=%27n%27 x=%270%27 y=%270%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27160%27 height=%27160%27 filter=%27url(%23n)%27 opacity=%270.35%27/%3E%3C/svg%3E")',
            backgroundRepeat: 'repeat',
            backgroundSize: '220px 220px',
          }}
        />
        <div
          className='flex items-center justify-between gap-3 flex-wrap'
          style={{
            position: 'relative',
            borderRadius: 14,
            padding: 12,
            background:
              themeMode === 'dark'
                ? 'linear-gradient(135deg, rgba(88,28,135,0.72) 0%, rgba(49,46,129,0.40) 100%)'
                : 'linear-gradient(135deg, rgba(124,58,237,0.22) 0%, rgba(196,181,253,0.35) 100%)',
            border:
              themeMode === 'dark'
                ? '1px solid rgba(139,92,246,0.22)'
                : '1px solid rgba(124,58,237,0.16)',
            boxShadow:
              themeMode === 'dark'
                ? '0 12px 26px rgba(0,0,0,0.28)'
                : '0 12px 24px rgba(17,24,39,0.08)',
          }}
        >
          <div className='flex flex-col gap-2 min-w-0'>
            <Button
              theme='borderless'
              type='tertiary'
              size='small'
              onClick={() => navigate('/tutorial')}
              style={{
                alignSelf: 'flex-start',
                borderRadius: 999,
                border:
                  themeMode === 'dark'
                    ? '1px solid rgba(216,180,254,0.40)'
                    : '1px solid rgba(124,58,237,0.35)',
                // premium pill look
                background:
                  themeMode === 'dark'
                    ? 'linear-gradient(135deg, rgba(216,180,254,0.22) 0%, rgba(139,92,246,0.18) 55%, rgba(216,180,254,0.12) 100%)'
                    : 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(124,58,237,0.10) 60%, rgba(255,255,255,0.45) 100%)',
                color:
                  themeMode === 'dark'
                    ? 'rgba(255,255,255,0.96)'
                    : 'rgba(88,28,135,0.95)',
                fontWeight: 800,
                letterSpacing: 0.2,
                boxShadow:
                  themeMode === 'dark'
                    ? '0 10px 22px rgba(0,0,0,0.22)'
                    : '0 10px 18px rgba(17,24,39,0.08)',
              }}
            >
              {t('返回教程列表')}
            </Button>

            <div className='min-w-0'>
              <Title
                heading={4}
                style={{
                  margin: 0,
                  lineHeight: 1.25,
                  color:
                    themeMode === 'dark'
                      ? 'rgba(255,255,255,0.96)'
                      : 'var(--semi-color-text-0)',
                  textShadow:
                    themeMode === 'dark' ? '0 1px 0 rgba(0,0,0,0.25)' : 'none',
                }}
              >
                {row?.title || ''}
              </Title>
            </div>

            {tags.length > 0 ? (
              <div className='flex flex-wrap gap-2'>
                {tags.map((tag) => (
                  <Tag
                    key={tag}
                    size='small'
                    style={{
                      borderRadius: 999,
                      border:
                        themeMode === 'dark'
                          ? '1px solid rgba(216,180,254,0.42)'
                          : '1px solid rgba(124,58,237,0.26)',
                      background:
                        themeMode === 'dark'
                          ? 'rgba(216,180,254,0.16)'
                          : 'rgba(124,58,237,0.10)',
                      color:
                        themeMode === 'dark'
                          ? 'rgba(255,255,255,0.92)'
                          : 'rgba(88,28,135,0.92)',
                    }}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            ) : null}

            {timeText ? (
              <Text
                type='tertiary'
                style={{
                  fontSize: 12,
                  lineHeight: 1.2,
                  color:
                    themeMode === 'dark'
                      ? 'rgba(255,255,255,0.78)'
                      : 'var(--semi-color-text-2)',
                }}
              >
                {timeText}
              </Text>
            ) : null}
          </div>
        </div>
      </div>

      <Card
        style={{
          borderRadius: 16,
          background: 'var(--semi-color-bg-1)',
          border: '1px solid var(--semi-color-border)',
          padding: 0,
        }}
      >
        {loading ? (
          <Skeleton
            placeholder={<Skeleton.Paragraph rows={10} />}
            loading={true}
          />
        ) : !row ? (
          <Empty description={t('暂无内容')} />
        ) : (
          <>
            <div style={{ padding: 14 }}>
              {treatAsHtml ? (
                preferIframe ? (
                  <HtmlInIframe html={row?.content || ''} />
                ) : (
                  <HtmlWithInternalScripts html={safeHtmlPayload.content} />
                )
              ) : (
                <MarkdownRenderer content={row.content || ''} data-ct={ct} />
              )}
            </div>
          </>
        )}
      </Card>
    </PageContainer>
  );
};

function HtmlWithInternalScripts({ html }) {
  const containerRef = React.useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    rehydrateNewApiScripts(containerRef.current);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className='markdown-body'
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function HtmlInIframe({ html }) {
  const { t } = useTranslation();
  const iframeRef = React.useRef(null);
  const [height, setHeight] = useState(900);
  const [theme, setTheme] = useState('light');

  // Follow system dark/light mode (used by the app in most deployments).
  // If the project uses a custom theme store, we can wire it here later.
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setTheme(mql?.matches ? 'dark' : 'light');
    update();
    if (!mql) return;
    // Safari compatibility: addListener/removeListener
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    mql.addListener?.(update);
    return () => mql.removeListener?.(update);
  }, []);

  const srcDoc = useMemo(() => {
    // Ensure full document structure so <style>/<script> behave consistently.
    // No URL rewriting is done here; if your HTML uses relative assets, prefer
    // converting them to absolute URLs (or add a <base href="..."> in content).
    const normalized = String(html || '');
    if (/<\s*html\b/i.test(normalized)) return normalized;

    // Inject a minimal theme baseline. This only controls background/text colors
    // so user-provided HTML can still define its own styles.
    const themeCss = `
	  :root{color-scheme:${theme};}
	  html,body{margin:0;padding:14px;background:${
      theme === 'dark' ? '#0f0f1a' : '#ffffff'
    };color:${theme === 'dark' ? 'rgba(255,255,255,0.92)' : '#111827'};}
	  a{color:${theme === 'dark' ? 'rgba(196,181,253,1)' : 'rgba(124,58,237,1)'};}
	  /* Make common blocks blend better with Semi-like surfaces */
	  pre,code{font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace;}
	  code{background:${
      theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.08)'
    };padding:0.15em 0.35em;border-radius:6px;}
	  pre{background:${
      theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(124,58,237,0.06)'
    };padding:12px;border-radius:12px;overflow:auto;}
	  blockquote{margin:0;padding:10px 12px;border-left:3px solid rgba(124,58,237,0.55);background:${
      theme === 'dark' ? 'rgba(124,58,237,0.14)' : 'rgba(124,58,237,0.08)'
    };border-radius:10px;}
	`;

    return `<!doctype html><html lang="zh-CN" data-newapi-theme="${theme}"><head><meta charset="utf-8" /><meta name="color-scheme" content="${theme}" /><style>${themeCss}</style></head><body>${normalized}</body></html>`;
  }, [html, theme]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      // If we don't use allow-same-origin, we can't read content height (by design).
      // Keep a reasonable default height in that case.
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const h = Math.max(
          doc.documentElement?.scrollHeight || 0,
          doc.body?.scrollHeight || 0,
        );
        if (h > 0) setHeight(Math.min(Math.max(h + 16, 200), 3000));
      } catch {
        // ignore
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title={t('场景教程详情')}
      // Keep isolation by default. If you need scripts, add allow-scripts.
      // If you need to measure height / allow relative resources to load with cookies,
      // you may also need allow-same-origin (higher risk).
      sandbox='allow-scripts'
      srcDoc={srcDoc}
      className='w-full border-0 rounded'
      style={{ height }}
    />
  );
}

export default ScenarioTutorialDetail;
