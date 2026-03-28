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
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import { Button, Skeleton, Tag, Typography } from '@douyinfe/semi-ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

const { Title, Text } = Typography;

function fmtDate(ts) {
  if (!ts) return '-';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch (e) {
    return String(ts);
  }
}

function splitTags(tags) {
  if (!tags) return [];
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const BlogDetail = () => {
  const { t } = useTranslation();
  const { md5 } = useParams();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/blog_manage/public/blogs/${md5}`, {
        skipErrorHandler: true,
      });
      if (res.data?.success) {
        setPost(res.data?.data);
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

  const tags = useMemo(() => splitTags(post?.tags), [post?.tags]);
  const ct = String(post?.content_type || 'markdown').toLowerCase();

  return (
    <div className='mt-[60px] px-3 md:px-6 max-w-4xl mx-auto'>
      <div className='mb-5 flex items-center justify-between gap-3'>
        <Link to='/blog'>
          <Button theme='light' type='tertiary'>
            {t('返回博客')}
          </Button>
        </Link>
      </div>

      {loading ? (
        <Skeleton
          placeholder={<Skeleton.Paragraph rows={10} />}
          loading={true}
          active
        />
      ) : !post ? (
        <Text type='tertiary'>{t('文章不存在')}</Text>
      ) : (
        <>
          <div className='mb-4'>
            <Title heading={2} style={{ margin: 0 }}>
              {post.title}
            </Title>
            <div className='mt-2 flex items-center justify-between gap-3 flex-wrap'>
              <Text type='tertiary'>{fmtDate(post.published_at)}</Text>
              <div className='flex gap-2 flex-wrap'>
                {tags.map((tag) => (
                  <Tag key={tag} size='small' color='orange'>
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>
          </div>

          {post.image_url ? (
            <div className='w-full overflow-hidden mb-6' style={{ borderRadius: 16 }}>
              <img
                src={post.image_url}
                alt=''
                loading='lazy'
                decoding='async'
                className='w-full h-auto object-cover'
              />
            </div>
          ) : null}

          <div
            className='p-4 md:p-6'
            style={{
              borderRadius: 16,
              background: 'var(--semi-color-bg-1)',
              border: '1px solid var(--semi-color-border)',
            }}
          >
            {ct === 'html' ? (
              <div
                className='prose max-w-none'
                // NOTE: content is sanitized to reduce XSS risk.
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeSanitize]}
                >
                  {post.content || ''}
                </ReactMarkdown>
              </div>
            ) : (
              <div className='prose max-w-none'>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {post.content || ''}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BlogDetail;

