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
import { API, showError } from '../../helpers';
import { Card, Typography, Tag, Skeleton, Empty } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';

const { Title, Paragraph, Text } = Typography;

const ScenarioTutorial = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/scenario_tutorial/public/tutorials', {
        params: { page: 1, page_size: 50 },
      });
      if (res.data?.success) {
        setItems(res.data?.data?.items || []);
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
  }, []);

  const listItems = useMemo(() => items, [items]);

  const tokens = useMemo(() => {
    return {
      heroBorder: '1px solid var(--semi-color-border)',
      heroBg:
        'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(168,85,247,0.10) 55%, rgba(255,255,255,0.00) 100%)',
      heroTitle: 'var(--semi-color-text-0)',
      heroSub: 'var(--semi-color-text-2)',
      tagBorder: '1px solid rgba(124,58,237,0.25)',
      tagBg: 'rgba(124,58,237,0.10)',
      tagText: 'var(--semi-color-text-0)',
      cardBorder: '1px solid var(--semi-color-border)',
      cardBg: 'var(--semi-color-bg-1)',
      cardTitle: 'var(--semi-color-text-0)',
      cardIntro: 'var(--semi-color-text-2)',
      cardHoverBorder: '1px solid rgba(124,58,237,0.55)',
      cardHoverShadow: '0 10px 28px rgba(17,24,39,0.10)',
    };
  }, []);

  return (
    <PageContainer>
      {/* Purple hero header (fits system theme) */}
      <div
        style={{
          borderRadius: 16,
          border: tokens.heroBorder,
          background: tokens.heroBg,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div className='flex items-start justify-between gap-3 flex-wrap'>
          <div className='flex flex-col gap-2 min-w-0'>
            <Title
              heading={4}
              style={{
                margin: 0,
                lineHeight: 1.25,
                color: tokens.heroTitle,
              }}
            >
              {t('场景教程')}
            </Title>
            <Paragraph
              type='secondary'
              style={{ margin: 0, color: tokens.heroSub }}
            >
              {t('这里汇总了常用场景的使用教程与最佳实践。')}
            </Paragraph>
          </div>
        </div>
      </div>

      <Card
        style={{
          borderRadius: 16,
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          padding: 0,
        }}
      >
        {loading ? (
          <div style={{ padding: 14 }}>
            <Skeleton
              placeholder={<Skeleton.Paragraph rows={10} />}
              loading={true}
            />
          </div>
        ) : listItems.length === 0 ? (
          <div style={{ padding: 20 }}>
            <Empty description={t('暂无教程')} />
          </div>
        ) : (
          <div
            className='grid gap-3'
            style={{
              padding: 14,
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}
          >
            {listItems.map((it) => (
              <ScenarioTutorialCard
                key={it.id || it.md5 || it.slug}
                it={it}
                tokens={tokens}
              />
            ))}
          </div>
        )}
      </Card>
    </PageContainer>
  );
};

function ScenarioTutorialCard({ it, tokens }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);

  const tags = useMemo(() => {
    const raw = String(it?.tags || '').trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  }, [it?.tags]);

  // Route currently expects :md5. Fall back to slug if backend supports it.
  const href = useMemo(() => {
    if (it?.md5) return `/tutorial/${it.md5}`;
    if (it?.slug) return `/tutorial/${it.slug}`;
    return '/tutorial';
  }, [it?.md5, it?.slug]);

  return (
    <Link to={href} style={{ textDecoration: 'none' }}>
      <Card
        style={{
          borderRadius: 16,
          background: tokens.cardBg,
          border: hover ? tokens.cardHoverBorder : tokens.cardBorder,
          boxShadow: hover ? tokens.cardHoverShadow : 'none',
          transition:
            'box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease',
          transform: hover ? 'translateY(-1px)' : 'translateY(0px)',
          cursor: 'pointer',
          height: '100%',
        }}
        bodyStyle={{ padding: 14 }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className='flex flex-col gap-2'>
          <div className='flex items-start gap-2 justify-between'>
            <Text
              strong
              style={{
                fontSize: 14,
                color: tokens.cardTitle,
                lineHeight: 1.25,
              }}
            >
              {it?.title || t('未命名教程')}
            </Text>
            <Text
              type='tertiary'
              style={{
                fontSize: 12,
                color: 'var(--semi-color-text-2)',
                whiteSpace: 'nowrap',
              }}
            >
              {t('查看')}
            </Text>
          </div>

          {it?.intro ? (
            <Text
              type='secondary'
              style={{
                fontSize: 12,
                color: tokens.cardIntro,
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                lineHeight: 1.4,
              }}
            >
              {it.intro}
            </Text>
          ) : null}

          {tags.length > 0 ? (
            <div className='flex flex-wrap gap-2'>
              {tags.map((tag) => (
                <Tag
                  key={tag}
                  size='small'
                  style={{
                    borderRadius: 999,
                    border: tokens.tagBorder,
                    background: tokens.tagBg,
                    color: tokens.tagText,
                  }}
                >
                  {tag}
                </Tag>
              ))}
            </div>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

export default ScenarioTutorial;
