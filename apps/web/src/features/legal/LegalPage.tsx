/**
 * LegalPage — 4 个法律页共用底层
 *
 * 设计:
 *   - 文档风 (跟 ErrorShell 黑底硬核风不同, 法律页要可读、严肃)
 *   - 左侧 sidebar TOC (Table of Contents),桌面 256px / 移动折叠
 *   - 右侧主体, 大量留白 + serif-friendly 段落
 *   - 顶部 breadcrumb (首页 > 法务文档) + lastUpdated + 标题
 *   - 全文 i18n 化 (I18nText), 默认中文 fallback
 *
 * 复用:
 *   - TermsPage / PrivacyPage / CookiesPage / RefundPage 都基于这个底层
 *   - 内容通过 `sections` prop 传入, 每段 { id, title, content }
 *
 * 移动适配:
 *   - < md: 隐藏 sidebar, 用顶部 dropdown 跳到 section (sticky)
 *   - ≥ md: 左侧固定 sidebar, 右侧内容滚动
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home, FileText } from 'lucide-react';
import { Seo } from '../../components/Seo';
import { contactHref } from '../../lib/contact';

export interface LegalSection {
  /** 锚点 id, 用于 sidebar 跳转和当前 section 高亮 */
  id: string;
  /** 段标题, h2 级别 */
  title: string;
  /** 段内容,可塞 ReactNode 灵活排版 */
  content: ReactNode;
}

export interface LegalPageProps {
  /** eyebrow 小标 (e.g. "/ Legal" "/ Legal · Privacy") */
  eyebrow: string;
  /** 主标题 (e.g. "服务条款") */
  title: string;
  /** 副标题/简介 (e.g. "SecondPlanet 平台服务协议") */
  subtitle?: string;
  /** 最后更新日期 ISO 字符串 (e.g. "2026-07-24") */
  lastUpdated: string;
  /** 内容 sections */
  sections: LegalSection[];
  /** 可选联系邮箱；未配置时引导到社区联系渠道 */
  contactEmail?: string;
}

export function LegalPage({
  eyebrow,
  title,
  subtitle,
  lastUpdated,
  sections,
  contactEmail,
}: LegalPageProps) {
  const location = useLocation();
  // 当前活跃 section (用于 sidebar 高亮 + scroll-spy)
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');

  // Scroll-spy: 监听 section 进入视口, 自动更新 activeId
  useEffect(() => {
    if (sections.length === 0) return;
    // jsdom 25 默认没 IntersectionObserver (Playwright jsdom 也有同样问题)
    // 真实浏览器一定有, 这里 try/catch 兜底
    if (typeof IntersectionObserver === 'undefined') return;
    try {
      const observer = new IntersectionObserver(
        (entries) => {
          // 找最靠上的可见 section
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]) {
            setActiveId(visible[0].target.id);
          }
        },
        { rootMargin: '-100px 0px -60% 0px', threshold: 0 },
      );
      sections.forEach((s) => {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      });
      return () => observer.disconnect();
    } catch {
      // 静默吞错 — scroll-spy 是 nice-to-have, 不挂 TOC 主功能
      return;
    }
  }, [sections]);

  const handleTocClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      // 更新 URL hash 但不触发 scroll
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F4F0] text-[#171717]">
      <Seo
        title={title}
        description={subtitle ?? title}
        path={location.pathname}
      />
      {/* 顶部 header — breadcrumb + eyebrow + title + lastUpdated */}
      <header className="border-b border-[#171717]/15 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10 md:py-14">
          {/* Breadcrumb */}
          <nav
            aria-label="breadcrumb"
            className="flex items-center gap-1.5 text-xs text-[#666666] mb-6 font-medium"
          >
            <Link to="/" className="hover:text-[#171717] inline-flex items-center gap-1">
              <Home className="w-3.5 h-3.5" aria-hidden="true" />
              首页
            </Link>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-[#171717]">{title}</span>
          </nav>

          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">
            {eyebrow}
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-3">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[#666666] text-base md:text-lg max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#666666] font-mono">
            <span>
              最后更新: <span className="text-[#171717] font-bold">{lastUpdated}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              预计阅读: <span className="text-[#171717] font-bold">~{Math.max(3, Math.ceil(sections.length * 1.5))} 分钟</span>
            </span>
          </div>
        </div>
      </header>

      {/* 主体 — sidebar + content */}
      <div className="max-w-6xl mx-auto px-6 py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-[256px_1fr] gap-8 md:gap-12">
          {/* Sidebar TOC — 桌面显示, 移动 sticky dropdown */}
          <aside className="md:sticky md:top-8 md:self-start">
            {/* 移动: sticky bar */}
            <div className="md:hidden mb-6">
              <label
                htmlFor="legal-toc-mobile"
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-2"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                跳到章节
              </label>
              <select
                id="legal-toc-mobile"
                value={activeId}
                onChange={(e) => handleTocClick(e.target.value)({ preventDefault: () => {} } as React.MouseEvent)}
                className="w-full px-3 py-2.5 bg-white border border-[#171717] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#171717]/20"
              >
                {sections.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {String(i + 1).padStart(2, '0')} · {s.title}
                  </option>
                ))}
              </select>
            </div>

            {/* 桌面: 垂直 sidebar */}
            <nav
              aria-label="Table of contents"
              className="hidden md:block border-l-2 border-[#171717]/15"
            >
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3 pl-4">
                / Contents
              </div>
              <ul className="space-y-1">
                {sections.map((s, i) => {
                  const isActive = activeId === s.id;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        onClick={handleTocClick(s.id)}
                        className={
                          'block pl-4 pr-2 py-1.5 -ml-0.5 border-l-2 text-sm leading-snug transition-colors ' +
                          (isActive
                            ? 'border-[#171717] text-[#171717] font-bold bg-[#EEEDE9]'
                            : 'border-transparent text-[#666666] hover:text-[#171717] hover:border-[#171717]/30')
                        }
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <span className="text-[10px] font-mono text-[#666666] mr-2">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {s.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* 主体内容 */}
          <main className="min-w-0">
            <article className="bg-white border-2 border-[#171717]">
              <div className="p-8 md:p-12 space-y-12">
                {sections.map((section, i) => (
                  <section key={section.id} id={section.id} className="scroll-mt-8">
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-[10px] font-mono text-[#666666] font-black">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h2 className="text-2xl md:text-3xl font-black tracking-tighter leading-tight">
                        {section.title}
                      </h2>
                    </div>
                    <div className="text-[#171717] leading-relaxed space-y-4 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_a]:underline [&_a]:underline-offset-4 [&_a]:font-medium hover:[&_a]:text-[#262626] [&_code]:bg-[#F5F4F0] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:font-mono [&_strong]:font-bold [&_strong]:text-[#171717]">
                      {section.content}
                    </div>
                  </section>
                ))}

                {/* 联系法务 footer */}
                <section
                  id="contact"
                  className="scroll-mt-8 border-t border-[#171717]/15 pt-8 mt-12"
                >
                  <h2 className="text-xl font-black tracking-tight mb-2">联系法务</h2>
                  <p className="text-[#666666] mb-3">
                    对本政策有任何疑问,或需要书面副本,请联系:
                  </p>
                  {contactEmail ? (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white text-sm font-black uppercase tracking-wider hover:bg-[#262626] transition-colors"
                    >
                      {contactEmail}
                    </a>
                  ) : (
                    <a
                      href={contactHref('法务咨询', '对法律文档有疑问，需要书面副本或协助处理。')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white text-sm font-black uppercase tracking-wider hover:bg-[#262626] transition-colors"
                    >
                      提交联系申请
                    </a>
                  )}
                </section>
              </div>
            </article>

            {/* 底部 back-to-top 链接 */}
            <div className="mt-6 text-center">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xs font-black uppercase tracking-[0.2em] text-[#666666] hover:text-[#171717]"
              >
                ↑ Back to top
              </a>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
