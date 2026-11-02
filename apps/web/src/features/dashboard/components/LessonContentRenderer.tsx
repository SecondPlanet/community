import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { AlertTriangle, CheckCircle2, Lightbulb, MessageCircleQuestion, Quote } from 'lucide-react';
import type { LessonBlock } from '../../ai-courses/aiCourses.types';
import { cn } from '../../../lib/cn';

function safeUrl(url: string) {
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      urlTransform={safeUrl}
      components={{
        a: ({ children: label, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-neutral-400 underline-offset-4 hover:decoration-neutral-950">{label}</a>,
        p: ({ children: content }) => <p className="my-4 leading-8 text-neutral-800">{content}</p>,
        h2: ({ children: content }) => <h2 className="mb-3 mt-10 text-2xl font-semibold tracking-tight text-neutral-950">{content}</h2>,
        h3: ({ children: content }) => <h3 className="mb-2 mt-8 text-xl font-semibold text-neutral-950">{content}</h3>,
        ul: ({ children: content }) => <ul className="my-4 list-disc space-y-2 pl-6 leading-7 text-neutral-800">{content}</ul>,
        ol: ({ children: content }) => <ol className="my-4 list-decimal space-y-2 pl-6 leading-7 text-neutral-800">{content}</ol>,
        code: ({ children: content, className }) => className
          ? <code className={cn('block overflow-x-auto rounded-xl bg-neutral-950 p-4 text-sm leading-6 text-neutral-100', className)}>{content}</code>
          : <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[0.9em] text-neutral-950">{content}</code>,
        blockquote: ({ children: content }) => <blockquote className="my-5 border-l-4 border-neutral-300 pl-5 italic text-neutral-600">{content}</blockquote>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function BlockShell({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return <section id={id} data-block-id={id} className={cn('scroll-mt-24', className)}>{children}</section>;
}

export function LessonContentRenderer({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className="mx-auto w-full max-w-[760px] pb-24">
      {blocks.map((block) => {
        switch (block.type) {
          case 'objective':
            return (
              <BlockShell key={block.id} id={block.id} className="mb-8 rounded-2xl border border-[#BCD5F5] bg-[#EEF6FF] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950"><CheckCircle2 className="h-5 w-5" />本节目标</div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">{block.items.map((item) => <li key={item} className="flex gap-2"><span>—</span>{item}</li>)}</ul>
              </BlockShell>
            );
          case 'paragraph':
            return <BlockShell key={block.id} id={block.id}>{block.title && <h2 className="mb-3 mt-10 text-2xl font-semibold tracking-tight text-neutral-950">{block.title}</h2>}<Markdown>{block.markdown}</Markdown></BlockShell>;
          case 'callout': {
            const Icon = block.tone === 'warning' ? AlertTriangle : block.tone === 'intuition' ? Lightbulb : Quote;
            return <BlockShell key={block.id} id={block.id} className={cn('my-8 rounded-2xl border p-5', block.tone === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-[#F7F6F2]')}><div className="flex items-center gap-2 font-semibold text-neutral-950"><Icon className="h-5 w-5" />{block.title}</div><Markdown>{block.markdown}</Markdown></BlockShell>;
          }
          case 'example':
            return <BlockShell key={block.id} id={block.id} className="my-8 rounded-2xl bg-neutral-950 p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Worked example</p><h2 className="mt-2 text-xl font-semibold">{block.title}</h2><p className="mt-3 text-sm leading-6 text-neutral-300">{block.scenario}</p><ol className="mt-5 space-y-4">{block.walkthrough.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs text-neutral-950">{index + 1}</span><span>{step}</span></li>)}</ol></BlockShell>;
          case 'steps':
            return <BlockShell key={block.id} id={block.id} className="my-8"><h2 className="text-2xl font-semibold text-neutral-950">{block.title}</h2><div className="mt-4 space-y-3">{block.items.map((item, index) => <div key={`${block.id}-${index}`} className="rounded-xl border border-neutral-200 p-5"><h3 className="font-semibold text-neutral-950">{index + 1}. {item.title}</h3><Markdown>{item.markdown}</Markdown></div>)}</div></BlockShell>;
          case 'misconception':
            return <BlockShell key={block.id} id={block.id} className="my-8 grid overflow-hidden rounded-2xl border border-neutral-200 md:grid-cols-2"><div className="bg-[#FFF0EE] p-5"><p className="text-xs font-semibold uppercase tracking-wider text-[#8B3B31]">常见误解</p><p className="mt-2 leading-7 text-neutral-800">{block.claim}</p></div><div className="bg-[#EFF7E8] p-5"><p className="text-xs font-semibold uppercase tracking-wider text-[#31551F]">更准确的理解</p><p className="mt-2 leading-7 text-neutral-800">{block.correction}</p></div></BlockShell>;
          case 'reflection':
            return <BlockShell key={block.id} id={block.id} className="my-8 rounded-2xl border-2 border-neutral-950 p-6"><MessageCircleQuestion className="h-6 w-6" /><p className="mt-4 text-lg font-medium leading-8 text-neutral-950">{block.prompt}</p><p className="mt-3 text-sm text-neutral-500">先停下来，用自己的话回答，再继续阅读。</p></BlockShell>;
          case 'summary':
            return <BlockShell key={block.id} id={block.id} className="mt-12 rounded-2xl bg-[#E9F4DD] p-6"><h2 className="text-xl font-semibold text-neutral-950">本节小结</h2><ul className="mt-4 space-y-3">{block.items.map((item) => <li key={item} className="flex gap-3 leading-7 text-neutral-800"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />{item}</li>)}</ul></BlockShell>;
          default: {
            const unknown = block as { id?: string };
            return <BlockShell key={unknown.id ?? 'unknown'} id={unknown.id ?? 'unknown'} className="my-6 rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-600">暂时无法显示这个内容块，请刷新或稍后重试。</BlockShell>;
          }
        }
      })}
    </div>
  );
}
