/**
 * Tailwind config — P0-4 落地
 * 严格按 review/redesign-spec.md §2.2 的色值,不要自己加色 / 改值。
 * 暗色走 class 模式 — 由 <html class="dark"> 触发。
 *
 * 颜色实现细节(突破 spec §2.2 hex 写法的部分):
 *   - 颜色用 `rgb(var(--xxx-rgb) / <alpha-value>)` 形式,值从 tokens.css 拿
 *   - tokens.css 里同时定义 `--brand-500: #3B82F6`(人读 + spec 字段)
 *     和 `--brand-500-rgb: 59 130 246`(Tailwind 消费)
 *   - 这样 .dark 翻转 CSS var 时,Tailwind utility 自动跟着翻
 *   - 妥协:hex 值在 spec 和 tokens.css 中保留;Tailwind config 用 rgb channel
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // CMS enum colorClass 存在数据库里(运行时注入 className), Tailwind 扫描不到 — 白名单兜底,
  // 否则 bg-info-100 / text-info-700 等徽章类不会生成 CSS, 徽章在暗色下文字继承页面色(对比度 ~1:1)。
  safelist: [
    { pattern: /^(bg|text)-(info|success|warning|danger|neutral)-(100|400|500|700)$/ },
  ],
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
      colors: {
        brand:   { 50:'rgb(var(--brand-50-rgb) / <alpha-value>)', 100:'rgb(var(--brand-100-rgb) / <alpha-value>)', 300:'rgb(var(--brand-300-rgb) / <alpha-value>)', 500:'rgb(var(--brand-500-rgb) / <alpha-value>)', 700:'rgb(var(--brand-700-rgb) / <alpha-value>)', 900:'rgb(var(--brand-900-rgb) / <alpha-value>)' },
        neutral: { 0:'rgb(var(--neutral-0-rgb) / <alpha-value>)', 50:'rgb(var(--neutral-50-rgb) / <alpha-value>)', 100:'rgb(var(--neutral-100-rgb) / <alpha-value>)', 200:'rgb(var(--neutral-200-rgb) / <alpha-value>)', 400:'rgb(var(--neutral-400-rgb) / <alpha-value>)', 600:'rgb(var(--neutral-600-rgb) / <alpha-value>)', 700:'rgb(var(--neutral-700-rgb) / <alpha-value>)', 800:'rgb(var(--neutral-800-rgb) / <alpha-value>)', 900:'rgb(var(--neutral-900-rgb) / <alpha-value>)', 950:'rgb(var(--neutral-950-rgb) / <alpha-value>)' },
        success: { 500:'rgb(var(--success-500-rgb) / <alpha-value>)', 100:'rgb(var(--success-100-rgb) / <alpha-value>)', 700:'rgb(var(--success-700-rgb) / <alpha-value>)' },
        warning: { 500:'rgb(var(--warning-500-rgb) / <alpha-value>)', 100:'rgb(var(--warning-100-rgb) / <alpha-value>)', 700:'rgb(var(--warning-700-rgb) / <alpha-value>)' },
        danger:  { 500:'rgb(var(--danger-500-rgb) / <alpha-value>)',  100:'rgb(var(--danger-100-rgb) / <alpha-value>)',  700:'rgb(var(--danger-700-rgb) / <alpha-value>)' },
        info:    { 500:'rgb(var(--info-500-rgb) / <alpha-value>)',    100:'rgb(var(--info-100-rgb) / <alpha-value>)',    700:'rgb(var(--info-700-rgb) / <alpha-value>)' },
        xp:      { 500:'rgb(var(--xp-500-rgb) / <alpha-value>)',      100:'rgb(var(--xp-100-rgb) / <alpha-value>)' },
        cert:    { 500:'rgb(var(--cert-500-rgb) / <alpha-value>)',    100:'rgb(var(--cert-100-rgb) / <alpha-value>)' },
      },
      fontFamily: {
        sans:    ['"Inter"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        display: ['"Inter"', '"PingFang SC"', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      spacing: {
        '0.5': '0.125rem', '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem',
        '5': '1.25rem', '6': '1.5rem', '8': '2rem', '10': '2.5rem', '12': '3rem',
        '16': '4rem', '20': '5rem', '24': '6rem', '32': '8rem',
      },
      borderRadius: {
        'sm':  '0.25rem',
        'md':  '0.5rem',
        'lg':  '0.75rem',
        'xl':  '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        'sm':   '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'md':   '0 4px 8px -2px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'lg':   '0 12px 24px -6px rgb(0 0 0 / 0.08), 0 4px 8px -4px rgb(0 0 0 / 0.04)',
        'glow': '0 0 0 1px rgb(29 140 128 / 0.2), 0 8px 24px -8px rgb(29 140 128 / 0.3)',
      },
    },
  },
  plugins: [
    // ponytail: 12 处用 animate-in slide-in-* / fade-in / zoom-in-95 (Drawer/Toast/Modal)；
    // 没装的话这些 class 在生产 CSS 不存在 → 所有弹层/Toast 没过渡。装好后用 motion-reduce:
    // 包裹真正可关闭动画（见 Drawer.tsx 等）。
    require('tailwindcss-animate'),
  ],
};
