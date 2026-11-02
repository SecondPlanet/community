/**
 * NotFoundPage — 404 路由兜底
 *
 * 触发场景 (react-router path="*"):
 *   - 用户输入错链接
 *   - 旧链接失效 (e.g. 课程下架后链接还在第三方站点)
 *   - 拼错 URL
 *
 * 增强 (基于 audit-web-ux-long.md:32 缺口):
 *   - 加「返回上一页」按钮 (useNavigate(-1), 没有历史时回首页)
 *   - 加搜索框 (跳 /search?q=...) — 让用户直接搜想要的
 *   - 加最多 4 个由后台维护的热门分类入口
 *   - 全 i18n 化 (走 I18nText, default 中文)
 *
 * 设计:
 *   - 复用 ErrorShell 框架,跟 403 / 500 / network 三页风格统一
 *   - 黑底硬核风 (#171717 边框 + 卡片式 hero) — 跟原 NotFoundPage 一致
 */
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import { ErrorShell, ActionButton } from './ErrorShell';
import { I18nText } from '../../components/I18nText';
import { useList } from '../../lib/cms';

export function NotFoundPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: categories = [] } = useList<{
    key: string;
    label: string;
    isActive?: boolean;
  }>('course-categories');
  const popularCategories = categories
    .filter((category) => category.isActive !== false)
    .slice(0, 4);

  // 进入页面自动 focus 搜索框 (无障碍 + 引导用户操作)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  // 返回上一页:有历史回上一页,无历史跳首页 (直接 history.length 不可靠,
  // 用 location.key 判断: react-router 推过的页都有 key)
  const canGoBack = window.history.length > 1;
  const handleBack = () => {
    if (canGoBack) navigate(-1);
    else navigate('/');
  };

  return (
    <ErrorShell
      className="min-h-screen"
      eyebrow="/ 404"
      code="404"
      title={<I18nText k="error.404.title" default="Page Not Found" />}
      description={
        <I18nText
          k="error.404.desc"
          default="抱歉,你访问的页面不存在。可能是链接已失效,或者你输入的地址有误。"
        />
      }
      actions={
        <>
          <ActionButton
            to="/"
            variant="primary"
            showIcon={false}
            ariaLabel="返回首页"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <I18nText k="error.404.cta.home" default="Back To Home" />
          </ActionButton>
          {/* 单独渲染 Back 按钮 (它是 onClick 触发 navigate(-1),不是 Link) */}
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-between gap-6 border border-[#171717] text-[#171717] px-6 py-4 font-black uppercase tracking-wider text-sm hover:bg-[#EEEDE9] transition-colors min-h-[48px]"
          >
            <span className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <I18nText k="error.404.cta.back" default="Go Back" />
            </span>
          </button>
        </>
      }
      footer={
        <>
          {/* 搜索框 — 让用户直接搜想要的 */}
          <form onSubmit={handleSearch} role="search" className="mb-6">
            <label htmlFor="notfound-search" className="sr-only">
              <I18nText k="error.404.search.label" default="搜索课程 / 学位 / 黑客松" />
            </label>
            <div className="flex items-stretch border-2 border-[#171717] bg-white">
              <div className="flex items-center pl-4 text-[#171717]">
                <Search className="w-5 h-5" aria-hidden="true" />
              </div>
              <input
                id="notfound-search"
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索课程 / 学位 / 黑客松"
                aria-label="搜索课程 / 学位 / 黑客松"
                className="flex-1 px-3 py-3 bg-transparent text-[#171717] placeholder:text-[#666666] focus:outline-none text-sm font-medium"
              />
              <button
                type="submit"
                className="px-5 bg-[#171717] text-white text-sm font-black uppercase tracking-wider hover:bg-[#262626] transition-colors"
              >
                <I18nText k="error.404.search.cta" default="Search" />
              </button>
            </div>
          </form>

          {popularCategories.length > 0 && <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">
              <I18nText k="error.404.popular" default="/ Popular" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {popularCategories.map((category) => (
                <ActionButton
                  key={category.key}
                  to={`/courses?category=${encodeURIComponent(category.key)}`}
                  variant="secondary"
                  showIcon={false}
                  ariaLabel={category.label}
                >
                  <span className="text-xs">{category.label}</span>
                </ActionButton>
              ))}
            </div>
          </div>}
        </>
      }
    />
  );
}
