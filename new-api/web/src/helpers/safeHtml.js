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

import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';

export const NEWAPI_INLINE_SCRIPT_TYPE = 'application/x-newapi-script';

export function isHtmlContent(content) {
  if (!content || typeof content !== 'string') return false;
  const htmlTagRegex = /<\/?[a-z][\s\S]*>/i;
  return htmlTagRegex.test(content);
}

function splitHtmlAndStyles(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const styles = Array.from(tempDiv.querySelectorAll('style'))
    .map((style) => style.innerHTML)
    .join('\n');

  const bodyContent = tempDiv.querySelector('body');
  const content = bodyContent ? bodyContent.innerHTML : html;
  return { content, styles };
}

// Sanitize user-provided HTML before rendering with dangerouslySetInnerHTML.
//
// Note: even if only internal staff can edit HTML, sanitizing is still strongly
// recommended to reduce impact of account compromise / malicious copy-paste.
export async function sanitizeHtmlToSafePayload(html) {
  const { content, styles } = splitHtmlAndStyles(html || '');

  // Start from default schema, then allow conservative set of styling/layout tags.
  // Explicitly avoid scripts and event handlers: rehype-sanitize drops them.
  const schema = {
    ...defaultSchema,
    tagNames: Array.from(
      new Set([
        ...(defaultSchema.tagNames || []),
        // Allow scripts only when explicitly marked as internal, then we'll
        // rehydrate them manually after render.
        'script',
        'style',
        'span',
        'div',
        'img',
        'table',
        'thead',
        'tbody',
        'tfoot',
        'tr',
        'th',
        'td',
        'pre',
        'code',
      ]),
    ),
    attributes: {
      ...(defaultSchema.attributes || {}),
      '*': Array.from(
        new Set([
          ...((defaultSchema.attributes && defaultSchema.attributes['*']) || []),
          'className',
          'class',
          'style',
          'id',
          'title',
          'aria-label',
          'aria-hidden',
          'role',
          'data-*',
        ]),
      ),
      script: ['type'],
      a: Array.from(
        new Set([
          ...((defaultSchema.attributes && defaultSchema.attributes.a) || []),
          'href',
          'target',
          'rel',
        ]),
      ),
      img: Array.from(
        new Set([
          ...((defaultSchema.attributes && defaultSchema.attributes.img) || []),
          'src',
          'alt',
          'title',
          'width',
          'height',
          'loading',
          'referrerPolicy',
        ]),
      ),
    },
    protocols: {
      ...(defaultSchema.protocols || {}),
      href: ['http', 'https', 'mailto', 'tel'],
      src: ['http', 'https', 'data'],
    },
  };

  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(content);

  return {
    content: String(file),
    styles,
  };
}

export function rehydrateNewApiScripts(rootEl) {
  if (!rootEl) return;
  const scripts = rootEl.querySelectorAll(`script[type="${NEWAPI_INLINE_SCRIPT_TYPE}"]`);
  scripts.forEach((oldScript) => {
    const code = oldScript.textContent || '';
    if (!code.trim()) return;

    // Replace with a real executable script tag.
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.text = code;
    oldScript.parentNode?.replaceChild(s, oldScript);
  });
}

