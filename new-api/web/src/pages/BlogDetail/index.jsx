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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import { Button, Skeleton, Tag, Typography } from '@douyinfe/semi-ui';
import MarkdownRenderer from '../../components/common/markdown/MarkdownRenderer';
import GithubSlugger from 'github-slugger';
import './blogDetail.css';

import {
  isHtmlContent,
  sanitizeHtmlToSafePayload,
} from '../../helpers/safeHtml';

const { Text } = Typography;

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

function extractTocFromMarkdown(content) {
  if (!content) return [];
  const slugger = new GithubSlugger();
  const lines = String(content).split(/\r?\n/);

  // Handle ATX headings only (#, ##, ...). Plenty for blog TOC.
  const toc = [];
  for (const raw of lines) {
    const m = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    if (level < 2 || level > 4) continue; // keep TOC compact (h2~h4)

    let text = m[2]
      // remove trailing closing hashes: "Title ###"
      .replace(/\s+#+\s*$/, '')
      // strip inline code/backticks
      .replace(/`([^`]+)`/g, '$1')
      // strip emphasis markers
      .replace(/[\\*_~]/g, '')
      // strip markdown links [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .trim();

    if (!text) continue;
    toc.push({ level, text, id: slugger.slug(text) });
    if (toc.length >= 40) break;
  }
  return toc;
}

// Same idea as 通用设置「公告」: support Markdown & HTML.

function extractTocFromHtml(html) {
  if (!html) return { toc: [], html: html || '' };
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const slugger = new GithubSlugger();
  const toc = [];
  const headings = tempDiv.querySelectorAll('h2, h3, h4');
  for (const h of headings) {
    const level = Number(h.tagName.replace('H', ''));
    const text = (h.textContent || '').trim();
    if (!text) continue;
    if (!h.id) h.id = slugger.slug(text);
    toc.push({ level, text, id: h.id });
    if (toc.length >= 40) break;
  }

  return { toc, html: tempDiv.innerHTML };
}

const BlogDetail = () => {
  const { t } = useTranslation();
  const { md5 } = useParams();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState(null);
  const [activeHeadingId, setActiveHeadingId] = useState('');
  const articleRef = useRef(null);

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

  const treatAsHtml = useMemo(() => {
    if (ct === 'html') return true;
    return isHtmlContent(post?.content);
  }, [ct, post?.content]);

  const [safeHtmlPayload, setSafeHtmlPayload] = useState({
    content: '',
    styles: '',
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!treatAsHtml) {
        setSafeHtmlPayload({ content: '', styles: '' });
        return;
      }
      const payload = await sanitizeHtmlToSafePayload(post?.content || '');
      if (!cancelled) setSafeHtmlPayload(payload);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [treatAsHtml, post?.content]);

  const { toc: tocFromHtml, html: htmlWithHeadingIds } = useMemo(() => {
    if (!treatAsHtml) return { toc: [], html: '' };
    return extractTocFromHtml(safeHtmlPayload.content);
  }, [treatAsHtml, safeHtmlPayload.content]);

  const toc = useMemo(() => {
    if (!post?.content) return [];
    return treatAsHtml ? tocFromHtml : extractTocFromMarkdown(post.content);
  }, [post?.content, treatAsHtml, tocFromHtml]);

  // Inject <style> blocks extracted from HTML content (same behavior as 公告)
  useEffect(() => {
    if (!treatAsHtml) return;
    const styleId = 'blog-detail-html-styles';

    if (safeHtmlPayload.styles) {
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.type = 'text/css';
        document.head.appendChild(styleEl);
      }
      styleEl.innerHTML = safeHtmlPayload.styles;
    } else {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    }

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [treatAsHtml, safeHtmlPayload.styles]);

  const scrollToHeading = (id) => {
    if (!id) return;
    const scroller = articleRef.current;
    const el = scroller?.querySelector(`#${CSS.escape(id)}`);
    if (!scroller || !el) return;

    // Compute position relative to the scroller to avoid offset bias from nested elements.
    const offset = 16;
    const scrollerTop = scroller.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const y = scroller.scrollTop + (elTop - scrollerTop) - offset;
    scroller.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  };

  // Highlight current section in TOC.
  useEffect(() => {
    if (!toc.length) return;
    const scroller = articleRef.current;
    if (!scroller) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;

        // Determine current heading by real-time position in scroller.
        const offset = 22;
        const scrollerTop = scroller.getBoundingClientRect().top;
        let current = '';
        for (const item of toc) {
          const el = scroller.querySelector(`#${CSS.escape(item.id)}`);
          if (!el) continue;
          const top = el.getBoundingClientRect().top - scrollerTop;
          if (top - offset <= 0) {
            current = item.id;
          } else {
            break;
          }
        }
        setActiveHeadingId(current);
      });
    };

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [toc]);

  return (
    <div className='blog-detail'>
      <div className='blog-detail-topbar'>
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
        <div className='blog-detail-layout'>
          {/* Sidebar: fixed */}
          <aside className='blog-detail-sidebar'>
            {toc.length ? (
              <nav
                className='blog-detail-toc blog-detail-toc--sidebar'
                aria-label='Table of contents'
              >
                <div className='blog-detail-toc-title'>{t('目录')}</div>
                <div className='blog-detail-toc-list'>
                  {toc.map((item) => (
                    <a
                      key={`${item.id}-${item.level}`}
                      href={`#${item.id}`}
                      className={
                        'blog-detail-toc-item' +
                        (activeHeadingId === item.id ? ' is-active' : '')
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToHeading(item.id);
                      }}
                      style={{
                        paddingLeft:
                          item.level === 2 ? 0 : item.level === 3 ? 12 : 22,
                      }}
                    >
                      {item.text}
                    </a>
                  ))}
                </div>
              </nav>
            ) : null}
          </aside>

          {/* Article */}
          <main className='blog-detail-article'>
            {/* Make the whole right column the scroll container */}
            <div className='blog-detail-article-scroll' ref={articleRef}>
              <div className='blog-detail-hero-main'>
                {post.image_url ? (
                  <div className='blog-detail-cover'>
                    <img
                      src={post.image_url}
                      alt=''
                      loading='lazy'
                      decoding='async'
                    />
                  </div>
                ) : null}

                <div className='blog-detail-meta'>
                  {fmtDate(post.published_at)}
                </div>
                <div className='blog-detail-tags'>
                  {tags.map((tag) => (
                    <Tag key={tag} size='small' color='purple'>
                      {tag}
                    </Tag>
                  ))}
                </div>

                <div className='blog-detail-title'>{post.title}</div>
                <div className='blog-detail-divider' />
              </div>

              <div className='blog-detail-content-card blog-detail-content-card--plain'>
                {treatAsHtml ? (
                  <div
                    className='markdown-body'
                    dangerouslySetInnerHTML={{ __html: htmlWithHeadingIds }}
                  />
                ) : (
                  <MarkdownRenderer content={post.content || ''} data-ct={ct} />
                )}
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
};

export default BlogDetail;
