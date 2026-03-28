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
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import { Empty, Popover, Skeleton, Tag, Typography } from '@douyinfe/semi-ui';

const { Title, Paragraph, Text } = Typography;

function fmtDate(ts) {
  if (!ts) return '-';
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch (e) {
    return String(ts);
  }
}

function normalizeTags(tags) {
  if (!tags) return [];
  const arr = String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  // De-duplicate while preserving order
  return Array.from(new Set(arr));
}

const TagRow = ({ tags }) => {
  const allTags = normalizeTags(tags);
  const maxShown = 4;
  const shown = allTags.slice(0, maxShown);
  const hidden = allTags.slice(maxShown);

  const moreContent = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 420 }}>
      {hidden.map((t) => (
        <Tag key={t} size='small' color='purple'>
          {t}
        </Tag>
      ))}
    </div>
  );

  return (
    <div
      className='flex gap-2 items-center'
      style={{
        height: 26,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Always reserve one line; if empty show a hidden placeholder */}
      {shown.length ? (
        <div
          className='flex gap-2 items-center'
          style={{
            overflow: 'hidden',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          {shown.map((tag) => (
            <Tag
              key={tag}
              size='small'
              color='purple'
              style={{
                // Do not ellipsis tags; show full text.
                maxWidth: 'unset',
              }}
            >
              {tag}
            </Tag>
          ))}

          {hidden.length > 0 && (
            <Popover
              content={moreContent}
              position='top'
              trigger='hover'
              showArrow={false}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
              }}
            >
              <Tag
                size='small'
                color='grey'
                style={{
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                +{hidden.length} more
              </Tag>
            </Popover>
          )}
        </div>
      ) : (
        <span style={{ visibility: 'hidden' }}>-</span>
      )}
    </div>
  );
};

const blogIntroEllipsis = {
  // Match the "perfect" behavior used by Title: only show tooltip when actually ellipsized.
  showTooltip: {
    position: 'top',
    showArrow: false,
    className: 'blog-intro-tooltip',
  },
};

const FeaturedCard = ({ post, t }) => {
  if (!post) return null;
  const tags = post.tags;
  const introText = post.intro || t('暂无简介');

  return (
    <Link
      to={`/blog/${post.md5}`}
      className='block w-full no-underline'
      style={{ textDecoration: 'none' }}
    >
      <div
        className='w-full overflow-hidden'
        style={{
          borderRadius: 16,
          background: 'var(--semi-color-bg-1)',
          border: '1px solid var(--semi-color-border)',
        }}
      >
        <div className='grid grid-cols-1 lg:grid-cols-2'>
          <div className='relative w-full' style={{ aspectRatio: '16 / 9' }}>
            {post.image_url ? (
              <img
                src={post.image_url}
                alt=''
                loading='lazy'
                decoding='async'
                className='absolute inset-0 w-full h-full object-cover'
              />
            ) : (
              <div
                className='absolute inset-0'
                style={{ background: 'var(--semi-color-fill-0)' }}
              />
            )}
          </div>
          <div className='p-5 flex flex-col gap-3'>
            <div>
              <Text type='tertiary'>{fmtDate(post.published_at)}</Text>
              <div className='mt-2'>
                <TagRow tags={tags} />
              </div>
            </div>
            <Title heading={2} style={{ margin: 0 }}>
              {post.title}
            </Title>
            <div style={{ height: 72, overflow: 'hidden' }}>
              <Paragraph
                type='tertiary'
                style={{ margin: 0, lineHeight: '24px' }}
                ellipsis={{ ...blogIntroEllipsis, rows: 3 }}
              >
                {introText}
              </Paragraph>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

const GridCard = ({ post, t }) => {
  const tags = post.tags;
  const introText = post.intro || t('暂无简介');
  return (
    <Link
      to={`/blog/${post.md5}`}
      className='block w-full no-underline'
      style={{ textDecoration: 'none' }}
    >
      <div
        className='w-full overflow-hidden'
        style={{
          borderRadius: 16,
          background: 'var(--semi-color-bg-1)',
          border: '1px solid var(--semi-color-border)',
        }}
      >
        <div className='relative w-full' style={{ aspectRatio: '16 / 9' }}>
          {post.image_url ? (
            <img
              src={post.image_url}
              alt=''
              loading='lazy'
              decoding='async'
              className='absolute inset-0 w-full h-full object-cover'
            />
          ) : (
            <div
              className='absolute inset-0'
              style={{ background: 'var(--semi-color-fill-0)' }}
            />
          )}
        </div>
        <div className='p-4 flex flex-col gap-2'>
          <Title heading={4} style={{ margin: 0 }} ellipsis={{ showTooltip: true }}>
            {post.title}
          </Title>
          <div style={{ height: 54, overflow: 'hidden' }}>
            <Paragraph
              type='tertiary'
              style={{ margin: 0, lineHeight: '27px' }}
              ellipsis={{ ...blogIntroEllipsis, rows: 2 }}
            >
              {introText}
            </Paragraph>
          </div>
          <div className='mt-1'>
            <Text type='tertiary' size='small'>
              {fmtDate(post.published_at)}
            </Text>
            <div className='mt-2'>
              <TagRow tags={tags} />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

const Blog = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/blog_manage/public/blogs', {
        params: { page: 1, page_size: 50 },
        skipErrorHandler: true,
      });
      if (res.data?.success) {
        setPosts(res.data?.data?.items || []);
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

  const featured = posts?.[0];
  const rest = useMemo(() => (posts || []).slice(1), [posts]);

  return (
    <div className='mt-[60px] px-3 md:px-6 max-w-6xl mx-auto'>
      <style>{`
        /* Purple tooltip theme for blog intro; auto-switch via Semi's html[data-theme] */
        html[data-theme='light'] .blog-intro-tooltip.semi-tooltip-wrapper .semi-tooltip-content {
          max-width: 520px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(99, 58, 203, 0.92);
          color: #fff;
          box-shadow: 0 12px 34px rgba(99, 58, 203, 0.22);
          white-space: pre-wrap;
          word-break: break-word;
        }

        html[data-theme='dark'] .blog-intro-tooltip.semi-tooltip-wrapper .semi-tooltip-content {
          max-width: 520px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(168, 124, 255, 0.15);
          border: 1px solid rgba(168, 124, 255, 0.35);
          color: rgba(240, 234, 255, 0.98);
          box-shadow: 0 16px 46px rgba(0, 0, 0, 0.38);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
      <div className='mb-5'>
        <Title heading={2} style={{ margin: 0 }}>
          {t('博客')}
        </Title>
        <Text type='tertiary'>{t('按时间倒序排列，展示已发布文章')}</Text>
      </div>

      {loading ? (
        <Skeleton
          placeholder={<Skeleton.Paragraph rows={8} />}
          loading={true}
          active
        />
      ) : posts.length === 0 ? (
        <Empty description={t('暂无文章')} style={{ padding: 40 }} />
      ) : (
        <>
          <FeaturedCard post={featured} t={t} />

          {rest.length > 0 && (
            <div className='mt-6 grid grid-cols-1 md:grid-cols-2 gap-5'>
              {rest.map((p) => (
                <GridCard key={p.md5} post={p} t={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Blog;

