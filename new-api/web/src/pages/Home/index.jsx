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

import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@douyinfe/semi-ui';
import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Boxes,
  Copy as CopyIcon,
  Gauge,
  ShieldCheck,
  WalletCards,
  Workflow,
} from 'lucide-react';
import { IconGithubLogo, IconPlay, IconFile } from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import NoticeModal from '../../components/layout/NoticeModal';
import {
  Moonshot,
  OpenAI,
  XAI,
  Zhipu,
  Volcengine,
  Cohere,
  Claude,
  Gemini,
  Suno,
  Minimax,
  Wenxin,
  Spark,
  Qingyan,
  DeepSeek,
  Qwen,
  Midjourney,
  Grok,
  AzureAI,
  Hunyuan,
  Xinference,
} from '@lobehub/icons';

const useReveal = ({
  threshold = 0.18,
  rootMargin = '0px 0px -10% 0px',
  once = true,
} = {}) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, isVisible };
};

const useReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);

    return () =>
      mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  return reducedMotion;
};

const Reveal = ({
  children,
  className = '',
  delay = 0,
  as: Component = 'div',
  threshold,
  rootMargin,
  once,
  ...rest
}) => {
  const { ref, isVisible } = useReveal({ threshold, rootMargin, once });

  return (
    <Component
      ref={ref}
      className={`home-reveal ${isVisible ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` }}
      {...rest}
    >
      {children}
    </Component>
  );
};

const MagneticAction = ({ children, className = '' }) => {
  const reducedMotion = useReducedMotion();
  const innerRef = useRef(null);
  const frameRef = useRef(0);

  const applyOffset = useCallback(
    (x, y) => {
      if (!innerRef.current) {
        return;
      }

      innerRef.current.style.transform = reducedMotion
        ? ''
        : `translate3d(${x}px, ${y}px, 0)`;
    },
    [reducedMotion],
  );

  const handleMove = (event) => {
    if (reducedMotion) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);

    const nextX = Math.max(-10, Math.min(10, x * 0.16));
    const nextY = Math.max(-10, Math.min(10, y * 0.16));

    cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      applyOffset(nextX, nextY);
    });
  };

  useEffect(() => {
    applyOffset(0, 0);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [applyOffset]);

  return (
    <div
      className={`home-magnetic-wrap ${className}`}
      onPointerMove={handleMove}
      onPointerLeave={() => applyOffset(0, 0)}
    >
      <div ref={innerRef} className='home-magnetic-inner'>
        {children}
      </div>
    </div>
  );
};

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const actualTheme = useActualTheme();
  const reducedMotion = useReducedMotion();
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [activeEndpointIndex, setActiveEndpointIndex] = useState(0);
  const [activeCodeExampleIndex, setActiveCodeExampleIndex] = useState(0);
  const [landingGlowActive, setLandingGlowActive] = useState(false);
  const [scrollDepth, setScrollDepth] = useState(0);
  const isMobile = useIsMobile();
  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;
  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const isChinese = i18n.language.startsWith('zh');
  const endpointTabsRef = useRef(null);
  const codeExampleTabsRef = useRef(null);
  const landingRef = useRef(null);
  const heroPanelRef = useRef(null);
  const heroPrimaryOrbRef = useRef(null);
  const heroSecondaryOrbRef = useRef(null);
  const landingGlowFrameRef = useRef(0);
  const heroMotionFrameRef = useRef(0);
  const heroSpotlightRef = useRef({ x: 56, y: 28 });

  const heroProofs = [
    {
      title: t('统一模型接入'),
      desc: t(
        '一个 Base URL 连接 OpenAI、Claude、Gemini、Azure、AWS Bedrock 等上游能力。',
      ),
    },
    {
      title: t('稳定路由调度'),
      desc: t('把分组、优先级、熔断与重试收进一层，减少请求中断与切换成本。'),
    },
    {
      title: t('清晰运营视图'),
      desc: t('日志、余额、订阅、令牌与渠道消耗集中管理，判断更直接。'),
    },
  ];

  const featureCards = [
    {
      icon: <Workflow size={20} />,
      title: t('统一模型路由'),
      desc: t('把主流模型能力接入同一网关，减少多平台适配成本。'),
      badge: t('统一接入'),
      points: [
        t('按模型、分组与优先级自动选择更合适的渠道'),
        t('统一 OpenAI 风格协议，老应用迁移更顺滑'),
      ],
    },
    {
      icon: <Gauge size={20} />,
      title: t('高稳定与低延迟'),
      desc: t('把熔断、调度与负载策略放进一层，保障业务持续可用。'),
      badge: t('稳定优先'),
      points: [
        t('渠道健康检测与自动熔断协同工作'),
        t('负载均衡策略帮助降低首包延迟'),
      ],
    },
    {
      icon: <WalletCards size={20} />,
      title: t('清晰的用量与计费'),
      desc: t('余额、订阅、日志与渠道消耗集中呈现，运营判断更直接。'),
      badge: t('运营友好'),
      points: [
        t('余额、订阅、令牌和用量视图集中管理'),
        t('计费与日志联动，便于定位异常消耗'),
      ],
    },
    {
      icon: <ShieldCheck size={20} />,
      title: t('企业级权限与审计'),
      desc: t('JWT、Passkey、OAuth 与审计能力一体化，兼顾安全与易用。'),
      badge: t('安全审计'),
      points: [
        t('多种身份认证方式满足不同接入场景'),
        t('关键操作与调用日志可追踪、可排查'),
      ],
    },
  ];

  const consoleSignals = [
    {
      eyebrow: t('统一协议'),
      value: t('兼容 OpenAI 风格接口'),
      desc: t('替换 Base URL 与密钥即可迁移现有应用'),
      icon: <Workflow size={16} />,
    },
    {
      eyebrow: t('实时日志'),
      value: t('请求去向与消耗可追踪'),
      desc: t('帮助更快定位异常调用与资源变化'),
      icon: <WalletCards size={16} />,
    },
    {
      eyebrow: t('安全层'),
      value: t('认证与审计闭环'),
      desc: t('JWT、OAuth、Passkey 与审计能力一体化呈现'),
      icon: <ShieldCheck size={16} />,
    },
  ];

  const accessSteps = [
    {
      step: '01',
      title: t('登录并获取令牌'),
      desc: t(
        '通过账号、邮箱或短信方式进入控制台，系统自动为新用户创建初始令牌。',
      ),
    },
    {
      step: '02',
      title: t('替换接口地址'),
      desc: t(
        '将你的应用 Base URL 指向本站网关地址，并使用控制台中的密钥发起请求。',
      ),
    },
    {
      step: '03',
      title: t('按需管理渠道与计费'),
      desc: t(
        '在控制台查看日志、用量、余额与模型能力，逐步完成团队级接入与运营。',
      ),
    },
  ];

  const providerIcons = [
    <Moonshot size={36} key='moonshot' />,
    <OpenAI size={36} key='openai' />,
    <XAI size={36} key='xai' />,
    <Zhipu.Color size={36} key='zhipu' />,
    <Volcengine.Color size={36} key='volcengine' />,
    <Cohere.Color size={36} key='cohere' />,
    <Claude.Color size={36} key='claude' />,
    <Gemini.Color size={36} key='gemini' />,
    <Suno size={36} key='suno' />,
    <Minimax.Color size={36} key='minimax' />,
    <Wenxin.Color size={36} key='wenxin' />,
    <Spark.Color size={36} key='spark' />,
    <Qingyan.Color size={36} key='qingyan' />,
    <DeepSeek.Color size={36} key='deepseek' />,
    <Qwen.Color size={36} key='qwen' />,
    <Midjourney size={36} key='midjourney' />,
    <Grok size={36} key='grok' />,
    <AzureAI.Color size={36} key='azure' />,
    <Hunyuan.Color size={36} key='hunyuan' />,
    <Xinference.Color size={36} key='xinference' />,
  ];

  const normalizedServerAddress = serverAddress.replace(/\/+$/, '');
  const openAICompatibleBaseUrl = normalizedServerAddress.endsWith('/v1')
    ? normalizedServerAddress
    : `${normalizedServerAddress}/v1`;

  const endpointOptions = [
    {
      key: 'chat-completions',
      label: t('聊天补全'),
      path: '/v1/chat/completions',
      hint: t('最常用的 OpenAI 兼容聊天入口，适合多数对话式应用。'),
      codeTitle: t('标准聊天补全示例'),
      codeDescription: t(
        '展示统一网关下的聊天补全调用方式，适合大多数对话式应用接入。',
      ),
      codeTags: [t('OpenAI 兼容'), t('统一网关'), t('快速联调')],
    },
    {
      key: 'responses',
      label: t('Responses'),
      path: '/v1/responses',
      hint: t('统一文本与多模态结果返回结构，适合新接入场景。'),
      codeTitle: t('标准 Responses 示例'),
      codeDescription: t(
        '展示 Responses 接口调用方式，适合需要统一输出结构的新接入方案。',
      ),
      codeTags: [t('统一结果结构'), t('新接口'), t('多模态友好')],
    },
    {
      key: 'embeddings',
      label: t('向量嵌入'),
      path: '/v1/embeddings',
      hint: t('用于知识库检索、RAG、召回与相似度计算等场景。'),
      codeTitle: t('标准 Embeddings 示例'),
      codeDescription: t(
        '展示文本向量生成方式，适合检索增强、召回和相似度计算场景。',
      ),
      codeTags: [t('RAG'), t('检索增强'), t('向量计算')],
    },
    {
      key: 'images',
      label: t('图像生成'),
      path: '/v1/images/generations',
      hint: t('统一图像生成能力入口，便于快速切换不同图像模型。'),
      codeTitle: t('标准图像生成示例'),
      codeDescription: t(
        '展示统一图像生成接口调用方式，便于快速切换不同图像模型。',
      ),
      codeTags: [t('图像生成'), t('统一入口'), t('模型切换方便')],
    },
  ];

  const codeExampleOptions = [
    {
      key: 'curl',
      label: 'curl',
      badge: 'POST',
    },
    {
      key: 'javascript',
      label: 'JavaScript',
      badge: 'SDK',
    },
    {
      key: 'python',
      label: 'Python',
      badge: 'SDK',
    },
    {
      key: 'go',
      label: 'Go',
      badge: 'HTTP',
    },
  ];

  const buildCurlExample = (endpoint) => {
    switch (endpoint.key) {
      case 'responses':
        return `curl ${normalizedServerAddress}${endpoint.path} \\
  -H 'Authorization: Bearer $NEW_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "gpt-4.1-mini",
    "input": "${t('请总结一下统一 AI 网关的优势')}"
  }'`;
      case 'embeddings':
        return `curl ${normalizedServerAddress}${endpoint.path} \\
  -H 'Authorization: Bearer $NEW_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "text-embedding-3-small",
    "input": "${t('统一 AI 网关')}"
  }'`;
      case 'images':
        return `curl ${normalizedServerAddress}${endpoint.path} \\
  -H 'Authorization: Bearer $NEW_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "${t('生成一张体现统一 AI 网关的未来感插画')}"
  }'`;
      case 'chat-completions':
      default:
        return `curl ${normalizedServerAddress}${endpoint.path} \\
  -H 'Authorization: Bearer $NEW_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "${t('你是一个专业 AI 助手')}"},
      {"role": "user", "content": "${t('请总结一下统一 AI 网关的优势')}"}
    ],
    "stream": false
  }'`;
    }
  };

  const buildJavaScriptExample = (endpoint) => {
    switch (endpoint.key) {
      case 'responses':
        return `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NEW_API_KEY || 'sk-your_newapi_key',
  baseURL: '${openAICompatibleBaseUrl}',
});

const response = await client.responses.create({
  model: 'gpt-4.1-mini',
  input: '${t('请总结一下统一 AI 网关的优势')}',
});

console.log(response.output_text);`;
      case 'embeddings':
        return `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NEW_API_KEY || 'sk-your_newapi_key',
  baseURL: '${openAICompatibleBaseUrl}',
});

const response = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: '${t('统一 AI 网关')}',
});

console.log(response.data[0]?.embedding?.length);`;
      case 'images':
        return `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NEW_API_KEY || 'sk-your_newapi_key',
  baseURL: '${openAICompatibleBaseUrl}',
});

const response = await client.images.generate({
  model: 'gpt-image-1',
  prompt: '${t('生成一张体现统一 AI 网关的未来感插画')}',
});

console.log(response.data?.[0]);`;
      case 'chat-completions':
      default:
        return `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NEW_API_KEY || 'sk-your_newapi_key',
  baseURL: '${openAICompatibleBaseUrl}',
});

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: '${t('你是一个专业 AI 助手')}' },
    { role: 'user', content: '${t('请总结一下统一 AI 网关的优势')}' },
  ],
  stream: false,
});

console.log(response.choices[0]?.message?.content);`;
    }
  };

  const buildPythonExample = (endpoint) => {
    switch (endpoint.key) {
      case 'responses':
        return `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv('NEW_API_KEY') or 'sk-your_newapi_key',
    base_url='${openAICompatibleBaseUrl}',
)

response = client.responses.create(
    model='gpt-4.1-mini',
    input='${t('请总结一下统一 AI 网关的优势')}',
)

print(response.output_text)`;
      case 'embeddings':
        return `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv('NEW_API_KEY') or 'sk-your_newapi_key',
    base_url='${openAICompatibleBaseUrl}',
)

response = client.embeddings.create(
    model='text-embedding-3-small',
    input='${t('统一 AI 网关')}',
)

print(len(response.data[0].embedding))`;
      case 'images':
        return `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv('NEW_API_KEY') or 'sk-your_newapi_key',
    base_url='${openAICompatibleBaseUrl}',
)

response = client.images.generate(
    model='gpt-image-1',
    prompt='${t('生成一张体现统一 AI 网关的未来感插画')}',
)

print(response.data[0])`;
      case 'chat-completions':
      default:
        return `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv('NEW_API_KEY') or 'sk-your_newapi_key',
    base_url='${openAICompatibleBaseUrl}',
)

response = client.chat.completions.create(
    model='gpt-4o-mini',
    messages=[
        {'role': 'system', 'content': '${t('你是一个专业 AI 助手')}'},
        {'role': 'user', 'content': '${t('请总结一下统一 AI 网关的优势')}'},
    ],
    stream=False,
)

print(response.choices[0].message.content)`;
    }
  };

  const buildGoExample = (endpoint) => {
    const payloadMap = {
      'chat-completions': `{
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "${t('你是一个专业 AI 助手')}"},
    {"role": "user", "content": "${t('请总结一下统一 AI 网关的优势')}"}
  ],
  "stream": false
}`,
      responses: `{
  "model": "gpt-4.1-mini",
  "input": "${t('请总结一下统一 AI 网关的优势')}"
}`,
      embeddings: `{
  "model": "text-embedding-3-small",
  "input": "${t('统一 AI 网关')}"
}`,
      images: `{
  "model": "gpt-image-1",
  "prompt": "${t('生成一张体现统一 AI 网关的未来感插画')}"
}`,
    };

    return `package main

import (
    "bytes"
    "fmt"
    "io"
    "net/http"
    "os"
)

func main() {
    apiKey := os.Getenv("NEW_API_KEY")
    if apiKey == "" {
        apiKey = "sk-your_newapi_key"
    }

    payload := []byte(\`${payloadMap[endpoint.key] || payloadMap['chat-completions']}\`)

    req, err := http.NewRequest(
        http.MethodPost,
        "${normalizedServerAddress}${endpoint.path}",
        bytes.NewBuffer(payload),
    )
    if err != nil {
        panic(err)
    }

    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }

    fmt.Println(string(body))
}`;
  };

  const syncLandingGlow = useCallback((x, y) => {
    if (!landingRef.current) {
      return;
    }

    landingRef.current.style.setProperty('--home-glow-x', `${x}%`);
    landingRef.current.style.setProperty('--home-glow-y', `${y}%`);
  }, []);

  const syncHeroMotion = useCallback(
    (spotlight = heroSpotlightRef.current) => {
      const panel = heroPanelRef.current;
      const primaryOrb = heroPrimaryOrbRef.current;
      const secondaryOrb = heroSecondaryOrbRef.current;

      if (!panel || !primaryOrb || !secondaryOrb) {
        return;
      }

      const pointerVector = {
        x: (spotlight.x - 50) / 50,
        y: (spotlight.y - 50) / 50,
      };

      panel.style.setProperty('--home-spotlight-x', `${spotlight.x}%`);
      panel.style.setProperty('--home-spotlight-y', `${spotlight.y}%`);
      panel.style.transform = reducedMotion
        ? ''
        : `perspective(1400px) translate3d(0, ${Math.max(-18, -scrollDepth * 0.05)}px, 0) rotateX(${(-pointerVector.y * 6).toFixed(2)}deg) rotateY(${(pointerVector.x * 7).toFixed(2)}deg)`;

      primaryOrb.style.transform = reducedMotion
        ? ''
        : `translate3d(${pointerVector.x * -14}px, ${scrollDepth * 0.08}px, 0)`;
      secondaryOrb.style.transform = reducedMotion
        ? ''
        : `translate3d(${pointerVector.x * 18}px, ${scrollDepth * -0.06}px, 0)`;
    },
    [reducedMotion, scrollDepth],
  );

  const scheduleLandingGlow = useCallback(
    (x, y) => {
      cancelAnimationFrame(landingGlowFrameRef.current);
      landingGlowFrameRef.current = window.requestAnimationFrame(() => {
        syncLandingGlow(x, y);
      });
    },
    [syncLandingGlow],
  );

  const scheduleHeroMotion = useCallback(
    (spotlight) => {
      cancelAnimationFrame(heroMotionFrameRef.current);
      heroMotionFrameRef.current = window.requestAnimationFrame(() => {
        syncHeroMotion(spotlight);
      });
    },
    [syncHeroMotion],
  );

  const handleHeroPanelPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const spotlight = {
      x: Math.min(88, Math.max(12, x)),
      y: Math.min(82, Math.max(14, y)),
    };

    heroSpotlightRef.current = spotlight;
    scheduleHeroMotion(spotlight);
  };

  const handleHeroPanelPointerLeave = () => {
    const spotlight = { x: 56, y: 28 };
    heroSpotlightRef.current = spotlight;
    scheduleHeroMotion(spotlight);
  };

  const handleLandingPointerMove = (event) => {
    if (reducedMotion || isMobile) {
      return;
    }

    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const x = (event.clientX / viewportWidth) * 100;
    const y = (event.clientY / viewportHeight) * 100;

    if (!landingGlowActive) {
      setLandingGlowActive(true);
    }

    scheduleLandingGlow(
      Math.min(94, Math.max(6, x)),
      Math.min(96, Math.max(4, y)),
    );
  };

  const handleLandingPointerLeave = () => {
    setLandingGlowActive(false);
  };

  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    const res = await API.get('/api/home_page_content');
    const { success, message, data } = res.data;

    if (success) {
      let content = data;
      if (!data.startsWith('https://')) {
        content = marked.parse(data);
      }
      setHomePageContent(content);
      localStorage.setItem('home_page_content', content);

      if (data.startsWith('https://')) {
        const iframe = document.querySelector('iframe');
        if (iframe) {
          iframe.onload = () => {
            iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
            iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
          };
        }
      }
    } else {
      showError(message);
      setHomePageContent('加载首页内容失败...');
    }

    setHomePageContentLoaded(true);
  };

  const handleCopyBaseURL = async () => {
    const ok = await copy(fullEndpointAddress);
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  const handleCopyCodeExample = async () => {
    const ok = await copy(activeCodeExample.code);
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  const scrollShowcaseTabIntoView = (containerRef, index) => {
    const container = containerRef.current;
    const target = container?.querySelector(`[data-showcase-index="${index}"]`);

    if (!container || !target) {
      return;
    }

    const targetLeft = target.offsetLeft;
    const targetWidth = target.offsetWidth;
    const containerWidth = container.clientWidth;
    const nextScrollLeft = Math.max(
      0,
      targetLeft - (containerWidth - targetWidth) / 2,
    );

    container.scrollTo({
      left: nextScrollLeft,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  // NOTE: Do not auto-popup system notice on Home page entry.
  // Users can still open the NoticeModal from the header notice entry.

  useEffect(() => {
    displayHomePageContent().then();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const timer = setInterval(() => {
      setActiveEndpointIndex((prev) => (prev + 1) % endpointOptions.length);
    }, 4200);

    return () => clearInterval(timer);
  }, [endpointOptions.length, reducedMotion]);
  useEffect(() => {
    scrollShowcaseTabIntoView(endpointTabsRef, activeEndpointIndex);
  }, [activeEndpointIndex]);

  useEffect(() => {
    scrollShowcaseTabIntoView(codeExampleTabsRef, activeCodeExampleIndex);
  }, [activeCodeExampleIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let animationFrameId = 0;

    const updateScrollDepth = () => {
      animationFrameId = window.requestAnimationFrame(() => {
        setScrollDepth(window.scrollY || 0);
      });
    };

    updateScrollDepth();
    window.addEventListener('scroll', updateScrollDepth, { passive: true });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', updateScrollDepth);
    };
  }, []);

  useEffect(() => {
    if (!homePageContentLoaded || !homePageContent.startsWith('https://')) {
      return;
    }

    const iframe = document.querySelector('iframe');
    iframe?.contentWindow?.postMessage({ themeMode: actualTheme }, '*');
    iframe?.contentWindow?.postMessage({ lang: i18n.language }, '*');
  }, [actualTheme, homePageContent, homePageContentLoaded, i18n.language]);

  useEffect(() => {
    syncLandingGlow(50, 8);
  }, [syncLandingGlow]);

  useEffect(() => {
    syncHeroMotion();
  }, [syncHeroMotion]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(landingGlowFrameRef.current);
      cancelAnimationFrame(heroMotionFrameRef.current);
    };
  }, []);

  const activeFeature = featureCards[activeFeatureIndex];
  const activeEndpoint =
    endpointOptions[activeEndpointIndex] || endpointOptions[0];
  const activeCodeLanguage =
    codeExampleOptions[activeCodeExampleIndex] || codeExampleOptions[0];
  const activeCodeExample = {
    ...activeCodeLanguage,
    title: activeEndpoint.codeTitle,
    description: activeEndpoint.codeDescription,
    tags: activeEndpoint.codeTags,
    code:
      activeCodeLanguage.key === 'javascript'
        ? buildJavaScriptExample(activeEndpoint)
        : activeCodeLanguage.key === 'python'
          ? buildPythonExample(activeEndpoint)
          : activeCodeLanguage.key === 'go'
            ? buildGoExample(activeEndpoint)
            : buildCurlExample(activeEndpoint),
  };
  const selectedEndpoint = activeEndpoint.path;
  const fullEndpointAddress = `${normalizedServerAddress}${selectedEndpoint.startsWith('/') ? selectedEndpoint : `/${selectedEndpoint}`}`;

  return (
    <div className='w-full overflow-x-hidden'>
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />
      {homePageContentLoaded && homePageContent === '' ? (
        <div
          ref={landingRef}
          className={`home-landing w-full overflow-x-hidden ${
            landingGlowActive ? 'home-landing-glow-active' : ''
          }`}
          onPointerMove={handleLandingPointerMove}
          onPointerLeave={handleLandingPointerLeave}
        >
          <div className='home-mouse-glow' />
          <section className='home-hero-section'>
            <div className='home-grid-bg' />
            <div
              ref={heroPrimaryOrbRef}
              className='home-orb home-orb-primary'
            />
            <div
              ref={heroSecondaryOrbRef}
              className='home-orb home-orb-secondary'
            />
            <div className='max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-16 md:pt-24 pb-12 md:pb-20'>
              <div className='home-hero-minimal mx-auto max-w-5xl'>
                <Reveal
                  className='relative z-[1] home-hero-copy text-center'
                  threshold={0.12}
                >
                  <div className='home-hero-badge'>
                    <BadgeCheck size={16} className='text-violet-500' />
                    <span>{t('企业级 AI API 网关')}</span>
                  </div>

                  <h1
                    className={`home-hero-title mt-6 text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.02] tracking-tight ${
                      isChinese ? 'lg:tracking-[-0.04em]' : ''
                    }`}
                  >
                    {t('词元视界')}
                    <br />
                    <span className='home-gradient-text'>
                      {t('更强模型 更低价格 更易落地')}
                    </span>
                  </h1>

                  <p className='home-hero-description mt-6 max-w-2xl text-base md:text-lg lg:text-xl leading-8'>
                    {t(
                      '将 OpenAI、Claude、Gemini、Azure、AWS Bedrock 等上游能力统一到一个稳定网关中，让接入、调度与运营都在同一套入口里完成。',
                    )}
                  </p>

                  <p className='home-hero-tip mt-4 max-w-2xl mx-auto text-sm md:text-[15px] leading-6'>
                    {t('本站充值比例为')}
                    <span className='home-hero-tip-highlight'>
                      {(() => {
                        const price = Number(statusState?.status?.price);
                        if (Number.isFinite(price) && price > 0) {
                          // 充值价格（x元/美金） => “x元兑换1美元”
                          // 使用 toFixed(2) 保留两位小数，避免出现长小数。
                          return t('{{price}}元兑换1美元', {
                            price: price.toFixed(2).replace(/\.00$/, ''),
                          });
                        }
                        return t('2元兑换1美元');
                      })()}
                    </span>
                    {t('，按需充值，虚拟商品不支持退款')}
                  </p>

                  <div className='mt-8 flex flex-wrap justify-center gap-3'>
                    <MagneticAction>
                      <Link to='/console'>
                        <Button
                          theme='solid'
                          type='primary'
                          size={isMobile ? 'default' : 'large'}
                          className='home-primary-button !rounded-full !px-7 !h-12'
                          icon={<IconPlay />}
                        >
                          {t('立即开始')}
                        </Button>
                      </Link>
                    </MagneticAction>
                    {docsLink ? (
                      <MagneticAction>
                        <Button
                          size={isMobile ? 'default' : 'large'}
                          className='home-secondary-button !rounded-full !px-6 !h-12'
                          icon={<IconFile />}
                          onClick={() => window.open(docsLink, '_blank')}
                        >
                          {t('查看文档')}
                        </Button>
                      </MagneticAction>
                    ) : (
                      <MagneticAction>
                        <Button
                          size={isMobile ? 'default' : 'large'}
                          className='home-secondary-button !rounded-full !px-6 !h-12'
                          icon={<IconGithubLogo />}
                          onClick={() =>
                            window.open(
                              'https://github.com/QuantumNous/new-api',
                              '_blank',
                            )
                          }
                        >
                          {isDemoSiteMode && statusState?.status?.version
                            ? statusState.status.version
                            : t('项目地址')}
                        </Button>
                      </MagneticAction>
                    )}
                  </div>

                  <Reveal className='home-hero-proof-grid mt-10' delay={100}>
                    {heroProofs.map((item) => (
                      <div key={item.title} className='home-hero-proof-card'>
                        <div className='home-hero-proof-title'>
                          {item.title}
                        </div>
                        <p className='home-hero-proof-desc'>{item.desc}</p>
                      </div>
                    ))}
                  </Reveal>
                </Reveal>
              </div>
            </div>
          </section>

          <section
            id='home-matrix'
            className='home-story-band home-story-band-soft max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-10'
          >
            <Reveal className='home-glass-card rounded-[32px] px-5 md:px-8 py-6'>
              <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                <div>
                  <div className='text-sm uppercase tracking-[0.24em] home-muted-text'>
                    {t('模型矩阵')}
                  </div>
                  <div className='mt-2 text-2xl md:text-3xl font-black home-heading-text'>
                    {t('覆盖主流模型与多模态能力')}
                  </div>
                </div>
                <div className='text-sm md:text-base home-muted-text'>
                  {t('文本、图像、音频与任务能力集中接入，能力范围一眼可见。')}
                </div>
              </div>
              <div className='mt-6 flex flex-wrap items-center justify-center gap-4 md:gap-6'>
                {providerIcons.map((iconNode, index) => (
                  <Reveal key={index} delay={index * 40}>
                    <div className='home-provider-tile h-14 w-14 rounded-2xl flex items-center justify-center'>
                      {iconNode}
                    </div>
                  </Reveal>
                ))}
                <Reveal delay={providerIcons.length * 40}>
                  <div className='home-provider-tile h-14 min-w-[76px] rounded-2xl px-4 flex items-center justify-center text-lg font-black'>
                    40+
                  </div>
                </Reveal>
              </div>
              <div className='mt-6 flex flex-wrap justify-center gap-2'>
                {[
                  t('文本 / 图像 / 音频 / 视频'),
                  t('深浅色主题自动适配'),
                  t('兼容 OpenAI 风格接口'),
                ].map((item) => (
                  <span
                    key={item}
                    className='home-status-pill home-status-pill-soft'
                  >
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>
          </section>

          <section
            id='home-overview'
            className='home-anchor-section home-story-band home-story-band-solution max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-14'
          >
            <Reveal className='text-center max-w-3xl mx-auto'>
              <div className='home-section-tag'>{t('系统概览')}</div>
              <h2 className='mt-4 text-3xl md:text-4xl font-black home-heading-text'>
                {t('统一接入与调用链路一屏呈现')}
              </h2>
              <p className='mt-4 text-base md:text-lg leading-8 home-muted-text'>
                {t(
                  '聚焦标准接入地址、聊天补全示例与关键接入信号，便于快速评估网关集成方式。',
                )}
              </p>
            </Reveal>

            <div className='home-overview-grid home-overview-grid-panel-only mt-10'>
              <Reveal className='home-overview-console' delay={120}>
                <div
                  ref={heroPanelRef}
                  className='home-hero-panel home-glass-card rounded-[28px] p-4 md:p-6'
                  onPointerMove={handleHeroPanelPointerMove}
                  onPointerLeave={handleHeroPanelPointerLeave}
                >
                  <div className='home-panel-topbar'>
                    <div className='home-panel-lights'>
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className='home-panel-caption'>
                      {t('智能接入控制面板')}
                    </div>
                    <div className='home-status-pill'>{t('实时反馈')}</div>
                  </div>

                  <div className='home-console-primary mt-4 rounded-3xl px-4 py-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <div className='text-sm home-muted-text'>
                          {t('完整接入地址')}
                        </div>
                        <div className='mt-1 text-lg font-semibold home-heading-text break-all'>
                          {fullEndpointAddress}
                        </div>
                        <p className='mt-2 text-sm leading-6 home-muted-text'>
                          {activeEndpoint.hint}
                        </p>
                      </div>
                      <MagneticAction>
                        <Button
                          theme='solid'
                          type='primary'
                          className='home-primary-button home-console-copy-button !rounded-full shrink-0'
                          icon={<CopyIcon size={16} />}
                          onClick={handleCopyBaseURL}
                        >
                          {t('复制')}
                        </Button>
                      </MagneticAction>
                    </div>

                    <div
                      ref={endpointTabsRef}
                      className='home-showcase-tabs mt-4'
                      aria-label={t('完整接入地址列表')}
                    >
                      {endpointOptions.map((item, index) => (
                        <button
                          key={item.key}
                          type='button'
                          data-showcase-index={index}
                          className={`home-showcase-tab ${
                            index === activeEndpointIndex
                              ? 'home-showcase-tab-active'
                              : ''
                          }`}
                          aria-pressed={index === activeEndpointIndex}
                          onMouseEnter={() => setActiveEndpointIndex(index)}
                          onFocus={() => setActiveEndpointIndex(index)}
                          onClick={() => setActiveEndpointIndex(index)}
                        >
                          <span className='home-showcase-tab-kicker'>
                            {t('统一入口')}
                          </span>
                          <span className='home-showcase-tab-value'>
                            {item.label}
                          </span>
                          <span className='home-showcase-tab-path'>
                            {item.path}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className='mt-4 grid md:grid-cols-2 gap-4'>
                    <div className='home-console-mini-card rounded-3xl px-4 py-4'>
                      <div className='flex items-center gap-2 font-semibold home-heading-text'>
                        <Bot size={18} className='text-violet-500' />
                        {t('兼容 OpenAI 风格请求')}
                      </div>
                      <p className='mt-2 text-sm leading-6 home-muted-text'>
                        {t(
                          '只需替换 Base URL 与 Key，即可让现有应用无缝切换到统一网关。',
                        )}
                      </p>
                    </div>
                    <div className='home-console-mini-card rounded-3xl px-4 py-4'>
                      <div className='flex items-center gap-2 font-semibold home-heading-text'>
                        <Boxes size={18} className='text-violet-600' />
                        {t('统一的模型与令牌视图')}
                      </div>
                      <p className='mt-2 text-sm leading-6 home-muted-text'>
                        {t(
                          '在控制台集中管理密钥、渠道、余额、日志与模型能力，无需在多个平台反复切换。',
                        )}
                      </p>
                    </div>
                  </div>

                  <div className='home-console-window mt-4 rounded-3xl px-4 py-4'>
                    <div className='home-code-card'>
                      <div className='home-code-toolbar'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='home-code-method'>
                              {activeCodeExample.badge}
                            </span>
                            <span className='home-code-title'>
                              {activeCodeExample.title}
                            </span>
                          </div>
                          <p className='home-code-description mt-3'>
                            {activeCodeExample.description}
                          </p>
                        </div>
                        <MagneticAction className='home-code-copy-wrap'>
                          <Button
                            theme='borderless'
                            type='tertiary'
                            className='home-code-copy-button !rounded-full shrink-0'
                            icon={<CopyIcon size={15} />}
                            onClick={handleCopyCodeExample}
                          >
                            {t('复制代码')}
                          </Button>
                        </MagneticAction>
                      </div>

                      <div
                        ref={codeExampleTabsRef}
                        className='home-showcase-tabs home-code-tabs mt-4'
                        aria-label={t('代码示例列表')}
                      >
                        {codeExampleOptions.map((item, index) => (
                          <button
                            key={item.key}
                            type='button'
                            data-showcase-index={index}
                            className={`home-showcase-tab home-code-tab ${
                              index === activeCodeExampleIndex
                                ? 'home-showcase-tab-active'
                                : ''
                            }`}
                            aria-pressed={index === activeCodeExampleIndex}
                            onFocus={() => setActiveCodeExampleIndex(index)}
                            onClick={() => setActiveCodeExampleIndex(index)}
                          >
                            <span className='home-showcase-tab-kicker'>
                              {item.badge}
                            </span>
                            <span className='home-showcase-tab-value'>
                              {item.label}
                            </span>
                          </button>
                        ))}
                      </div>

                      <pre className='home-code-pre mt-4'>
                        {activeCodeExample.code}
                      </pre>
                    </div>

                    <div className='mt-4 flex flex-wrap gap-2'>
                      {activeCodeExample.tags.map((tag) => (
                        <span
                          key={tag}
                          className='home-status-pill home-status-pill-soft'
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className='mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3'>
                      {consoleSignals.map((item) => (
                        <div key={item.eyebrow} className='home-signal-cell'>
                          <div className='home-signal-eyebrow'>
                            {item.eyebrow}
                          </div>
                          <div className='home-signal-value'>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section
            id='home-features'
            className='home-anchor-section home-story-band home-story-band-feature max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-16'
          >
            <Reveal className='text-center max-w-3xl mx-auto'>
              <div className='home-section-tag'>{t('核心能力')}</div>
              <h2 className='mt-4 text-3xl md:text-4xl font-black home-heading-text'>
                {t('从接入到运营，一套后台完成 AI 网关管理')}
              </h2>
              <p className='mt-4 text-base md:text-lg leading-8 home-muted-text'>
                {t('聚焦统一接入、稳定调度、清晰计费与安全审计四个核心能力。')}
              </p>
            </Reveal>

            <div className='mt-10 grid md:grid-cols-2 xl:grid-cols-4 gap-5'>
              {featureCards.map((item, index) => (
                <Reveal key={item.title} delay={index * 80}>
                  <button
                    type='button'
                    className={`home-feature-card rounded-[28px] p-6 text-left ${
                      index === activeFeatureIndex
                        ? 'home-feature-card-active'
                        : ''
                    }`}
                    onMouseEnter={() => setActiveFeatureIndex(index)}
                    onFocus={() => setActiveFeatureIndex(index)}
                    onClick={() => setActiveFeatureIndex(index)}
                  >
                    <div className='home-feature-badge'>{item.badge}</div>
                    <div className='mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-500 text-white shadow-lg'>
                      {item.icon}
                    </div>
                    <h3 className='mt-5 text-xl font-bold home-heading-text'>
                      {item.title}
                    </h3>
                    <p className='mt-3 text-sm md:text-base leading-7 home-muted-text'>
                      {item.desc}
                    </p>
                  </button>
                </Reveal>
              ))}
            </div>

            <Reveal className='home-feature-detail mt-6' delay={120}>
              <div className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between'>
                <div className='max-w-2xl'>
                  <div className='home-section-tag home-inline-tag'>
                    {activeFeature.badge}
                  </div>
                  <h3 className='mt-4 text-2xl md:text-3xl font-black home-heading-text'>
                    {activeFeature.title}
                  </h3>
                  <p className='mt-3 text-sm md:text-base leading-7 home-muted-text'>
                    {activeFeature.desc}
                  </p>
                </div>
                <div className='home-status-pill'>
                  {t('悬浮或点击卡片可切换详情')}
                </div>
              </div>

              <div className='mt-6 grid gap-3 md:grid-cols-2'>
                {activeFeature.points.map((point, index) => (
                  <div key={point} className='home-detail-point'>
                    <div className='home-point-index'>0{index + 1}</div>
                    <p className='mt-3 text-sm leading-7 home-muted-text'>
                      {point}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </section>

          <section
            id='home-solution'
            className='home-anchor-section home-story-band home-story-band-solution max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-10'
          >
            <div className='grid lg:grid-cols-[0.95fr_1.05fr] gap-6'>
              <Reveal className='home-dark-panel rounded-[32px] p-6 md:p-8'>
                <div className='home-panel-kicker text-sm uppercase tracking-[0.24em]'>
                  {t('选择理由')}
                </div>
                <h2 className='mt-4 text-3xl md:text-4xl font-black leading-tight'>
                  {t('更像一个产品化 AI 平台，而不是单纯的中转接口')}
                </h2>
                <p className='home-panel-body mt-5 leading-8'>
                  {t(
                    '除了标准 API 接入外，还能在同一个控制台完成用户、令牌、订阅、日志与渠道管理。',
                  )}
                </p>
                <div className='mt-8 grid gap-4'>
                  {[
                    t('统一 API 兼容层，迁移与替换成本更低'),
                    t('智能熔断与多分组调度，提升可用性'),
                    t('日志、余额、令牌、渠道一体化可观测'),
                  ].map((item, index) => (
                    <Reveal
                      key={item}
                      delay={index * 90}
                      className='home-dark-list-item flex items-start gap-3 rounded-2xl px-4 py-4'
                    >
                      <BadgeCheck
                        size={18}
                        className='home-panel-list-icon mt-1 shrink-0'
                      />
                      <span className='home-panel-list-text'>{item}</span>
                    </Reveal>
                  ))}
                </div>

                <div className='mt-8 grid grid-cols-2 gap-3'>
                  {[
                    { value: t('跟随系统'), label: t('主题切换') },
                    { value: t('统一管理'), label: t('控制台入口') },
                    { value: t('未来感'), label: t('视觉层次') },
                    { value: t('低改造'), label: t('接口迁移') },
                  ].map((item) => (
                    <div key={item.label} className='home-dark-stat'>
                      <div className='home-dark-stat-value'>{item.value}</div>
                      <div className='home-dark-stat-label'>{item.label}</div>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal
                className='home-glass-card rounded-[32px] p-6 md:p-8'
                delay={120}
              >
                <div className='text-sm uppercase tracking-[0.24em] home-muted-text'>
                  {t('接入流程')}
                </div>
                <h2 className='mt-4 text-3xl md:text-4xl font-black home-heading-text'>
                  {t('三步接入你的应用')}
                </h2>
                <div className='mt-8 space-y-5'>
                  {accessSteps.map((item, index) => (
                    <Reveal
                      key={item.step}
                      delay={index * 90}
                      className='home-step-card flex gap-4 rounded-[24px] px-5 py-5'
                    >
                      <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-lg font-black text-violet-600 shadow-sm shrink-0'>
                        {item.step}
                      </div>
                      <div>
                        <h3 className='text-lg font-bold home-heading-text'>
                          {item.title}
                        </h3>
                        <p className='mt-2 text-sm md:text-base leading-7 home-muted-text'>
                          {item.desc}
                        </p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </Reveal>
            </div>
          </section>

          <section
            id='home-start'
            className='home-anchor-section home-story-band home-story-band-cta max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-20'
          >
            <Reveal className='home-cta-panel rounded-[36px] px-6 md:px-10 py-10 md:py-14'>
              <div className='max-w-3xl'>
                <div className='home-panel-kicker text-sm uppercase tracking-[0.24em]'>
                  {t('开始使用')}
                </div>
                <h2 className='mt-4 text-3xl md:text-5xl font-black leading-tight'>
                  {t('从一个统一网关开始，重构你的 AI 接入体验')}
                </h2>
                <p className='home-panel-body mt-5 text-base md:text-lg leading-8'>
                  {t(
                    '无论你是在寻找稳定的模型网关、可运营的用户面板，还是面向团队的多渠道接入能力，这里都可以作为你的统一入口。',
                  )}
                </p>
                <div className='mt-6 flex flex-wrap gap-2'>
                  {[
                    t('系统主题自动适配'),
                    t('滚动显现与视差层次'),
                    t('统一模型能力入口'),
                  ].map((item) => (
                    <span
                      key={item}
                      className='home-status-pill home-status-pill-contrast'
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <div className='mt-8 flex flex-wrap gap-3'>
                  <MagneticAction>
                    <Link to='/console'>
                      <Button
                        theme='solid'
                        className='home-cta-primary-button !rounded-full !h-12 !px-7'
                        icon={<ArrowRight size={16} />}
                      >
                        {t('进入控制台')}
                      </Button>
                    </Link>
                  </MagneticAction>
                  {docsLink && (
                    <MagneticAction>
                      <Button
                        theme='outline'
                        className='home-cta-secondary-button !rounded-full !h-12 !px-7'
                        icon={<IconFile />}
                        onClick={() => window.open(docsLink, '_blank')}
                      >
                        {t('查看文档')}
                      </Button>
                    </MagneticAction>
                  )}
                </div>
              </div>
            </Reveal>
          </section>
        </div>
      ) : (
        <div className='overflow-x-hidden w-full'>
          {homePageContent.startsWith('https://') ? (
            <iframe
              src={homePageContent}
              className='w-full h-screen border-none'
            />
          ) : (
            <div
              className='mt-[60px]'
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
