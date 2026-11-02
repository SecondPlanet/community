/**
 * seed-cms.ts — CMS 16 张表默认值灌入
 *
 * 严格按 review/cms-design.md §6.2 清单:
 *   - enum_translations  9 个 enum × ~5 状态 × 2 locale = ~70 行
 *   - site_settings      ~12 行
 *   - page_settings      ~30 行 (7 路由 × ~4-5 keys)
 *   - app_settings       6 行
 *   - date_format_templates 6 行
 *   - industries         8 行
 *   - testimonials       不写入演示数据，由后台录入真实学员授权内容
 *   - quick_prompts      4 行
 *   - course_categories  6 行
 *   - popular_searches   4 行
 *   - hot_keywords       5 行
 *   - auth_providers     6 行
 *   - top_nav_items      4 行
 *   - footer_columns     3 行
 *   - i18n_messages      ~30 行
 *
 * 全部用 upsert, 幂等, 可重复跑.
 */
import {
  PrismaClient,
  Prisma,
  CourseLevel,
  OrderStatus,
  HackathonStatus,
  SubmissionStatus,
  UserRole,
  CostType,
  CourseStatus,
  DateFormatTemplateScope,
  QuickPromptScope,
  HotKeywordScope,
} from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// 1. enum_translations (~70 行)
// ============================================================================

interface EnumRow {
  enumType: string;
  enumValue: string;
  locale: string;
  label: string;
  colorClass?: string;
  icon?: string;
  sortOrder: number;
}

const enumRows: EnumRow[] = [
  // course_level (4 状态 × 2 locale)
  ...['Beginner', 'Intermediate', 'Advanced', 'Expert'].flatMap((v, i) => [
    {
      enumType: 'course_level',
      enumValue: v,
      locale: 'zh-CN',
      label: { Beginner: '入门', Intermediate: '进阶', Advanced: '高级', Expert: '专家' }[v]!,
      colorClass: ['bg-success-100 text-success-700', 'bg-info-100 text-info-700', 'bg-warning-100 text-warning-700', 'bg-danger-100 text-danger-700'][i],
      icon: ['BookOpen', 'GraduationCap', 'Award', 'Crown'][i],
      sortOrder: i,
    },
    {
      enumType: 'course_level',
      enumValue: v,
      locale: 'en-US',
      label: v,
      sortOrder: i,
    },
  ]),

  // order_status (5 状态 × 2 locale)
  ...['pending', 'paid', 'failed', 'expired', 'refunded'].flatMap((v, i) => [
    {
      enumType: 'order_status',
      enumValue: v,
      locale: 'zh-CN',
      label: { pending: '待支付', paid: '已支付', failed: '失败', expired: '已过期', refunded: '已退款' }[v]!,
      colorClass: ['bg-warning-100 text-warning-700', 'bg-success-100 text-success-700', 'bg-danger-100 text-danger-700', 'bg-neutral-100 text-neutral-700', 'bg-info-100 text-info-700'][i],
      icon: ['Clock', 'CheckCircle2', 'XCircle', 'Clock', 'RotateCcw'][i],
      sortOrder: i,
    },
    {
      enumType: 'order_status',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),

  // hackathon_status (5 状态 × 2 locale)
  // colorClass 是浅色徽章方案: bg-*-100 + 深色正文(*-700)。
  // 暗色下 bg-*-100 与正文文字是同一浅色系, 对比度不足 — 所以补一个 dark: 文本变体。
  ...['upcoming', 'active', 'judging', 'finished', 'cancelled'].flatMap((v, i) => [
    {
      enumType: 'hackathon_status',
      enumValue: v,
      locale: 'zh-CN',
      label: { upcoming: '即将开始', active: '进行中', judging: '评审中', finished: '已结束', cancelled: '已取消' }[v]!,
      colorClass: [
        'bg-info-100 text-info-700 dark:text-info-700',
        'bg-success-100 text-success-700 dark:text-success-700',
        'bg-warning-100 text-warning-700 dark:text-warning-700',
        'bg-neutral-100 text-neutral-700 dark:text-neutral-700',
        'bg-danger-100 text-danger-700 dark:text-danger-700',
      ][i],
      sortOrder: i,
    },
    {
      enumType: 'hackathon_status',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),

  // inquiry_status (5 状态 × 2 locale)
  ...['pending', 'contacted', 'qualified', 'closed', 'archived'].flatMap((v, i) => [
    {
      enumType: 'inquiry_status',
      enumValue: v,
      locale: 'zh-CN',
      label: { pending: '待跟进', contacted: '已联系', qualified: '合格', closed: '已关闭', archived: '已归档' }[v]!,
      sortOrder: i,
    },
    {
      enumType: 'inquiry_status',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),

  // submission_status (6 状态 × 2 locale)
  ...['draft', 'submitted', 'under_review', 'shortlisted', 'winner', 'rejected'].flatMap((v, i) => [
    {
      enumType: 'submission_status',
      enumValue: v,
      locale: 'zh-CN',
      label: { draft: '草稿', submitted: '已提交', under_review: '评审中', shortlisted: '入围', winner: '获奖', rejected: '未通过' }[v]!,
      sortOrder: i,
    },
    {
      enumType: 'submission_status',
      enumValue: v,
      locale: 'en-US',
      label: v.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
      sortOrder: i,
    },
  ]),

  // notification_type (4 类 × 2 locale)
  ...['announcement', 'comment', 'hackathon', 'order'].flatMap((v, i) => [
    {
      enumType: 'notification_type',
      enumValue: v,
      locale: 'zh-CN',
      label: { announcement: '系统公告', comment: '评论', hackathon: '黑客松', order: '订单' }[v]!,
      sortOrder: i,
    },
    {
      enumType: 'notification_type',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),

  // user_role (3 × 2)
  ...['admin', 'student', 'instructor'].flatMap((v, i) => [
    {
      enumType: 'user_role',
      enumValue: v,
      locale: 'zh-CN',
      label: { admin: '管理员', student: '学员', instructor: '讲师' }[v]!,
      sortOrder: i,
    },
    {
      enumType: 'user_role',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),

  // cost_type (3 × 2)
  ...['free', 'paid', 'charity'].flatMap((v, i) => [
    {
      enumType: 'cost_type',
      enumValue: v,
      locale: 'zh-CN',
      label: { free: '免费', paid: '付费', charity: '公益' }[v]!,
      sortOrder: i,
    },
    {
      enumType: 'cost_type',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),

  // course_status (3 × 2)
  ...['draft', 'published', 'archived'].flatMap((v, i) => [
    {
      enumType: 'course_status',
      enumValue: v,
      locale: 'zh-CN',
      label: { draft: '草稿', published: '已发布', archived: '已归档' }[v]!,
      sortOrder: i,
    },
    {
      enumType: 'course_status',
      enumValue: v,
      locale: 'en-US',
      label: v.charAt(0).toUpperCase() + v.slice(1),
      sortOrder: i,
    },
  ]),
];

// ============================================================================
// 2. site_settings (~12 行)
// ============================================================================

const siteSettings: Array<{
  key: string;
  value: Prisma.InputJsonValue;
  description?: string;
}> = [
  { key: 'brand.hero.headline', value: { 'zh-CN': '与 AI 一起, 构建未来' }, description: '首页 hero 主标题' },
  { key: 'brand.hero.subheadline', value: { 'zh-CN': 'SecondPlanet — 与世界级 AI 工程师一起实战' }, description: '首页 hero 副标题' },
  { key: 'brand.footer.tagline', value: { 'zh-CN': 'SecondPlanet · 实战驱动的 AI 工程师培养平台' }, description: 'footer 一句话定位' },
  { key: 'brand.footer.signature', value: { 'zh-CN': '© 2026 SecondPlanet · 保留所有权利' }, description: 'footer 版权信息' },
  { key: 'brand.auth.shell_headline', value: { 'zh-CN': '加入 SecondPlanet 学员社区' }, description: 'AuthShell (登录/注册页) 品牌侧标题' },
  { key: 'brand.auth.shell_sub_template', value: { 'zh-CN': '{count} 名工程师、创业者、CTO 在这里把 AI 能力变成可被验证的作品。' }, description: 'AuthShell 品牌侧副标题模板' },
  { key: 'brand.global.product_name', value: { 'zh-CN': 'SecondPlanet' }, description: '全站通用产品名' },
  { key: 'nav.top_items', value: { items: ['课程', '学位', '黑客松', '企业培训'] }, description: '顶部导航 4 项 label' },
  {
    key: 'footer.columns',
    value: {
      columns: [
        { title: '学习', links: [{ label: '全部课程', path: '/courses' }, { label: '纳米学位', path: '/degrees' }, { label: '黑客松', path: '/hackathons' }] },
        { title: '公司', links: [{ label: 'GitHub 开源仓库', path: 'https://github.com/SecondPlanet/community' }, { label: '关于我们', path: '/about' }, { label: '浏览课程', path: '/courses' }] },
        { title: '法律', links: [{ label: '服务条款', path: '/terms' }, { label: '隐私政策', path: '/privacy' }, { label: 'Cookie 政策', path: '/cookies' }, { label: '退款政策', path: '/refund' }] },
      ],
    },
    description: 'footer 3 列结构',
  },
  { key: 'meta.default_title', value: { 'zh-CN': 'SecondPlanet' }, description: '默认 page title' },
  { key: 'meta.default_description', value: { 'zh-CN': '实战驱动的 AI 工程师培养平台' }, description: '默认 meta description' },
  { key: 'meta.default_og_image', value: { url: '/og-default.png' }, description: '默认 OG 图片' },
];

// ============================================================================
// 3. page_settings (~30 行, 按 7 路由)
// ============================================================================

const pageSettings: Array<{
  page: string;
  key: string;
  value: Prisma.InputJsonValue;
  description?: string;
}> = [
  // home
  { page: 'home', key: 'hero.eyebrow', value: { 'zh-CN': 'AI · 实战 · 学位' }, description: '首页 eyebrow' },
  { page: 'home', key: 'hero.cta_primary', value: { 'zh-CN': '开始学习' }, description: '首页主 CTA' },
  { page: 'home', key: 'hero.cta_secondary', value: { 'zh-CN': '了解学位' }, description: '首页次 CTA' },
  { page: 'home', key: 'stats.label_projects', value: { 'zh-CN': '实践项目' } },
  { page: 'home', key: 'empty.title', value: { 'zh-CN': '暂无推荐课程' } },
  { page: 'home', key: 'empty.description', value: { 'zh-CN': '稍后再来看看' } },

  // courses
  { page: 'courses', key: 'hero.headline', value: { 'zh-CN': '实战驱动的 AI 课程' } },
  { page: 'courses', key: 'filter.tabs', value: { tabs: ['全部', 'LLM 应用', 'RAG', 'Agent', 'MLOps', '微调', '理论'] } },
  { page: 'courses', key: 'empty.title', value: { 'zh-CN': '暂无匹配课程' } },
  { page: 'courses', key: 'empty.description', value: { 'zh-CN': '试试调整筛选条件' } },

  // degrees
  { page: 'degrees', key: 'hero.headline', value: { 'zh-CN': '纳米学位, 工程师级成长路径' } },
  { page: 'degrees', key: 'hero.subline', value: { 'zh-CN': '3-9 个月实战 + 1v1 导师 + 真实项目' } },
  { page: 'degrees', key: 'empty.title', value: { 'zh-CN': '暂无学位' } },

  // hackathons
  { page: 'hackathons', key: 'hero.headline', value: { 'zh-CN': '黑客松, 与顶尖 AI 工程师对决' } },
  { page: 'hackathons', key: 'filter.statuses', value: { statuses: ['全部', '即将开始', '进行中', '评审中', '已结束'] } },
  { page: 'hackathons', key: 'empty.title', value: { 'zh-CN': '暂无黑客松' } },

  // auth
  { page: 'auth', key: 'login.title', value: { 'zh-CN': '登录' } },
  { page: 'auth', key: 'register.title', value: { 'zh-CN': '注册' } },
  { page: 'auth', key: 'login.cta', value: { 'zh-CN': '登录' } },
  { page: 'auth', key: 'register.cta', value: { 'zh-CN': '注册' } },

  // dashboard
  { page: 'dashboard', key: 'welcome', value: { 'zh-CN': '欢迎回来' } },
  { page: 'dashboard', key: 'empty.courses', value: { 'zh-CN': '还没有报名课程' } },
  { page: 'dashboard', key: 'empty.cta_browse', value: { 'zh-CN': '浏览课程' } },
  { page: 'dashboard', key: 'lesson.duration_label', value: { 'zh-CN': '课时' } },
  { page: 'dashboard', key: 'lesson.progress_label', value: { 'zh-CN': '进度' } },
  { page: 'dashboard', key: 'ai.greeting', value: { 'zh-CN': '我是你的 AI 助手' } },
];

// ============================================================================
// 4. app_settings (6 行)
// ============================================================================

const appSettings: Array<{
  key: string;
  valueJson: Prisma.InputJsonValue;
  description?: string;
}> = [
  {
    key: 'duration_buckets',
    valueJson: { buckets: [
      { key: 'lt1h', label: '< 1 小时', minMinutes: 0, maxMinutes: 60 },
      { key: '1to3h', label: '1-3 小时', minMinutes: 60, maxMinutes: 180 },
      { key: '3to6h', label: '3-6 小时', minMinutes: 180, maxMinutes: 360 },
      { key: 'gt6h', label: '> 6 小时', minMinutes: 360, maxMinutes: 99999 },
    ] },
    description: '课程时长分桶 (前端按桶显示)',
  },
  {
    key: 'number_format',
    valueJson: { currency: '¥', thousands: ',', decimals: 2, decimalPoint: '.' },
    description: '前端数字/货币格式',
  },
  {
    key: 'datetime_input_format',
    valueJson: { format: 'YYYY-MM-DD HH:mm', hour12: false },
    description: '前端 datetime input 格式',
  },
  {
    key: 'ai.quick_prompts',
    valueJson: { prompts: [
      { emoji: '💡', label: '解释这节课', promptText: '请用通俗的语言解释这节课的核心概念' },
      { emoji: '🧪', label: '给个例子', promptText: '请给出一个可以动手尝试的代码例子' },
      { emoji: '❓', label: '我卡住了', promptText: '我在某个地方卡住了, 提示我下一步' },
    ] },
    description: 'AI 助手默认快捷 prompt 列表',
  },
  {
    key: 'cover_palette',
    valueJson: { colors: ['#1D8C80', '#222831', '#EEEEEE', '#393E46', '#00ADB5'] },
    description: '课程封面默认调色板',
  },
  {
    key: 'pagination',
    valueJson: { defaultSize: 20, sizes: [10, 20, 50, 100] },
    description: '列表分页默认参数',
  },
];

// ============================================================================
// 5. date_format_templates (6 行)
// ============================================================================

const dateFormatTemplates: Array<{ scope: string; locale: string; template: string }> = [
  { scope: 'admin.users.list', locale: 'zh-CN', template: 'YYYY-MM-DD HH:mm' },
  { scope: 'admin.users.list', locale: 'en-US', template: 'MMM d, yyyy HH:mm' },
  { scope: 'dashboard.lesson.duration', locale: 'zh-CN', template: 'M 分钟' },
  { scope: 'dashboard.lesson.duration', locale: 'en-US', template: 'M min' },
  { scope: 'common.date', locale: 'zh-CN', template: 'YYYY-MM-DD' },
  { scope: 'common.date', locale: 'en-US', template: 'MMM d, yyyy' },
];

// ============================================================================
// 8. testimonials
// 不提供演示证言。此类内容必须由后台录入真实且获得授权的学员反馈。
// ============================================================================

const testimonials: Array<{
  name: string;
  title: string;
  quote: string;
  avatar: string;
}> = [];

// ============================================================================
// 9. quick_prompts (4 行)
// ============================================================================

const quickPrompts: Array<{
  emoji: string;
  label: string;
  promptText: string;
  scope: QuickPromptScope;
}> = [
  { emoji: '💡', label: '解释这节课', promptText: '请用通俗易懂的语言, 给我讲解这节课的核心概念, 配合一个生活化的例子', scope: 'lesson' },
  { emoji: '🧪', label: '给个代码例子', promptText: '基于本节内容, 给我一段可以立刻运行的代码示例, 加上逐行注释', scope: 'lesson' },
  { emoji: '❓', label: '我卡住了', promptText: '我在某个地方卡住了, 请给我一个引导式提示, 让我自己想到下一步', scope: 'lesson' },
  { emoji: '📝', label: '总结要点', promptText: '把这节课的要点压缩成 5 条笔记, 每条不超过 20 字', scope: 'lesson' },
  { emoji: '📚', label: '推荐 AI 入门课', promptText: '请根据平台当前已发布课程，推荐一门适合零基础学习者的 AI 入门课，并说明理由。', scope: 'global' },
  { emoji: '🎓', label: '了解纳米学位', promptText: '请介绍平台当前可报名的纳米学位、包含课程和适合人群。', scope: 'global' },
  { emoji: '🏆', label: '查看黑客松', promptText: '请列出平台当前可以报名的黑客松，并说明报名条件和截止时间。', scope: 'global' },
  { emoji: '🏢', label: '了解企业培训', promptText: '请根据平台企业培训页面，介绍可提供的企业 AI 培训方案。', scope: 'global' },
];

// ============================================================================
// 10. course_categories (6 行)
// ============================================================================

const courseCategories: Array<{ key: string; label: string }> = [
  { key: 'llm_app', label: 'LLM 应用' },
  { key: 'rag', label: 'RAG' },
  { key: 'agent', label: 'Agent' },
  { key: 'mlops', label: 'MLOps' },
  { key: 'fine_tune', label: '模型微调' },
  { key: 'theory', label: 'AI 理论' },
];

// ============================================================================
// 11. popular_searches (4 行)
// ============================================================================

const popularSearches: Array<{ keyword: string; clickCount: number }> = [
  { keyword: 'LLM 微调实战', clickCount: 1280 },
  { keyword: 'RAG 入门', clickCount: 980 },
  { keyword: 'Agent 开发', clickCount: 760 },
  { keyword: 'CUDA 性能优化', clickCount: 540 },
];

// ============================================================================
// 12. hot_keywords (5 行, scope=courses)
// ============================================================================

const hotKeywords: Array<{ keyword: string; scope: HotKeywordScope }> = [
  { keyword: 'Python 基础', scope: 'courses' },
  { keyword: 'PyTorch', scope: 'courses' },
  { keyword: 'LangChain', scope: 'courses' },
  { keyword: 'Transformer', scope: 'courses' },
  { keyword: 'Diffusion 模型', scope: 'courses' },
];

// ============================================================================
// 13. auth_providers (6 行)
// ============================================================================

const authProviders: Array<{
  id: string;
  label: string;
  icon: string;
  isActive: boolean;
  config?: Prisma.InputJsonValue;
}> = [
  { id: 'email', label: '邮箱', icon: 'Mail', isActive: true },
  { id: 'google', label: 'Google', icon: 'Chrome', isActive: true, config: { scopes: ['openid', 'email', 'profile'] } },
  { id: 'github', label: 'GitHub', icon: 'Github', isActive: true, config: { scopes: ['read:user', 'user:email'] } },
  { id: 'wechat', label: '微信', icon: 'MessageCircle', isActive: false, config: { appId: '', scopes: ['snsapi_login'] } },
  { id: 'wecom', label: '企业微信', icon: 'Briefcase', isActive: false, config: { corpId: '' } },
  { id: 'feishu', label: '飞书', icon: 'MessageSquare', isActive: false, config: { appId: '' } },
];

// ============================================================================
// 14. top_nav_items
// ============================================================================

const topNavItems: Array<{ label: string; path: string; icon: string }> = [
  { label: '课程工坊', path: '/ai-courses', icon: 'Sparkles' },
  { label: '课程', path: '/courses', icon: 'BookOpen' },
  { label: '学位', path: '/degrees', icon: 'GraduationCap' },
  { label: '黑客松', path: '/hackathons', icon: 'Trophy' },
  
];

// ============================================================================
// 15. footer_columns (3 行)
// ============================================================================

const footerColumns: Array<{
  title: string;
  links: Array<{ label: string; path: string }>;
}> = [
  { title: '学习', links: [
    { label: '全部课程', path: '/courses' },
    { label: '纳米学位', path: '/degrees' },
    { label: '黑客松', path: '/hackathons' },
  ] },
  { title: '公司', links: [
    { label: 'GitHub 开源仓库', path: 'https://github.com/SecondPlanet/community' },
    { label: '关于我们', path: '/about' },

    { label: '浏览课程', path: '/courses' },
  ] },
  { title: '法律', links: [
    { label: '服务条款', path: '/terms' },
    { label: '隐私政策', path: '/privacy' },
    { label: 'Cookie 政策', path: '/cookies' },
    { label: '退款政策', path: '/refund' },
  ] },
];

// ============================================================================
// 16. i18n_messages (~30 行)
// ============================================================================

const i18nMessages: Array<{
  key: string;
  locale: string;
  value: string;
  // P2-2: 改用 enum 值,旧 'empty'/'loading'/'error'/'toast' 归并到 'common'
  category: 'common' | 'auth' | 'course' | 'hackathon' | 'degree' | 'admin';
}> = [
  // common — 旧 empty/loading/error/toast 都归并到 common
  { key: 'course.empty.title', locale: 'zh-CN', value: '暂无课程', category: 'course' },
  { key: 'course.empty.description', locale: 'zh-CN', value: '稍后再来看看', category: 'course' },
  { key: 'hackathon.empty.title', locale: 'zh-CN', value: '暂无黑客松', category: 'hackathon' },
  { key: 'degree.empty.title', locale: 'zh-CN', value: '暂无学位', category: 'degree' },
  { key: 'order.empty.title', locale: 'zh-CN', value: '暂无订单', category: 'common' },

  // common — loading
  { key: 'loading.default', locale: 'zh-CN', value: '加载中…', category: 'common' },
  { key: 'loading.submit', locale: 'zh-CN', value: '提交中…', category: 'common' },
  { key: 'loading.payment', locale: 'zh-CN', value: '支付处理中…', category: 'common' },
  { key: 'loading.uploading', locale: 'zh-CN', value: '上传中…', category: 'common' },

  // common — error
  { key: 'error.network', locale: 'zh-CN', value: '网络异常, 请稍后重试', category: 'common' },
  { key: 'error.unauthorized', locale: 'zh-CN', value: '请先登录', category: 'auth' },
  { key: 'error.forbidden', locale: 'zh-CN', value: '没有权限', category: 'common' },
  { key: 'error.not_found', locale: 'zh-CN', value: '资源不存在', category: 'common' },
  { key: 'error.payment_failed', locale: 'zh-CN', value: '支付失败, 请重试', category: 'common' },
  { key: 'error.server', locale: 'zh-CN', value: '服务器异常, 请稍后重试', category: 'common' },

  // common — toast
  { key: 'toast.save_success', locale: 'zh-CN', value: '保存成功', category: 'common' },
  { key: 'toast.save_failed', locale: 'zh-CN', value: '保存失败', category: 'common' },
  { key: 'toast.delete_success', locale: 'zh-CN', value: '删除成功', category: 'common' },
  { key: 'toast.delete_confirm', locale: 'zh-CN', value: '确定要删除吗?', category: 'common' },
  { key: 'toast.copy_success', locale: 'zh-CN', value: '已复制到剪贴板', category: 'common' },
  { key: 'toast.enroll_success', locale: 'zh-CN', value: '报名成功', category: 'common' },
  { key: 'toast.payment_success', locale: 'zh-CN', value: '支付成功', category: 'common' },
  { key: 'toast.register_success', locale: 'zh-CN', value: '注册成功', category: 'common' },

  // common
  { key: 'common.confirm', locale: 'zh-CN', value: '确认', category: 'common' },
  { key: 'common.cancel', locale: 'zh-CN', value: '取消', category: 'common' },
  { key: 'common.submit', locale: 'zh-CN', value: '提交', category: 'common' },
  { key: 'common.search', locale: 'zh-CN', value: '搜索', category: 'common' },
  { key: 'common.all', locale: 'zh-CN', value: '全部', category: 'common' },
  { key: 'common.view_more', locale: 'zh-CN', value: '查看更多', category: 'common' },
  { key: 'common.back', locale: 'zh-CN', value: '返回', category: 'common' },
];

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🌱 Seeding CMS tables...\n');

  // 1. enum_translations
  console.log(`  enum_translations: ${enumRows.length} rows`);
  for (const r of enumRows) {
    await prisma.enumTranslation.upsert({
      where: { enumType_enumValue_locale: { enumType: r.enumType, enumValue: r.enumValue, locale: r.locale } },
      create: r,
      update: { label: r.label, colorClass: r.colorClass, icon: r.icon, sortOrder: r.sortOrder },
    });
  }

  // 2. site_settings
  console.log(`  site_settings: ${siteSettings.length} rows`);
  for (const s of siteSettings) {
    await prisma.siteSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value, description: s.description },
      update: { value: s.value, description: s.description },
    });
  }

  // 3. page_settings
  console.log(`  page_settings: ${pageSettings.length} rows`);
  for (const p of pageSettings) {
    await prisma.pageSetting.upsert({
      where: { page_key: { page: p.page, key: p.key } },
      create: { page: p.page, key: p.key, value: p.value, description: p.description },
      update: { value: p.value, description: p.description },
    });
  }

  // 4. app_settings
  console.log(`  app_settings: ${appSettings.length} rows`);
  for (const a of appSettings) {
    await prisma.appSetting.upsert({
      where: { key: a.key },
      create: { key: a.key, valueJson: a.valueJson, description: a.description },
      update: { valueJson: a.valueJson, description: a.description },
    });
  }

  // 5. date_format_templates
  // P1-2 修了: enum 加 admin_users_list / common_date / dashboard_lesson_duration,
  // seed 用点风格 key 转下划线风格以匹配 enum
  console.log(`  date_format_templates: ${dateFormatTemplates.length} rows`);
  for (const d of dateFormatTemplates) {
    // seed 数组用点风格 (admin.users.list), enum 用下划线 (admin_users_list)
    const enumScope = d.scope.replace(/\./g, '_') as DateFormatTemplateScope;
    await prisma.dateFormatTemplate.upsert({
      where: { scope_locale: { scope: enumScope, locale: d.locale } },
      create: { ...d, scope: enumScope },
      update: { template: d.template },
    });
  }

  // 8. testimonials (按 name + title 幂等)
  console.log(`  testimonials: ${testimonials.length} rows`);
  for (let i = 0; i < testimonials.length; i++) {
    const t = testimonials[i]!;
    const existing = await prisma.testimonial.findFirst({ where: { name: t.name, title: t.title } });
    if (existing) {
      await prisma.testimonial.update({
        where: { id: existing.id },
        data: { quote: t.quote, avatar: t.avatar, orderIndex: i },
      });
    } else {
      await prisma.testimonial.create({
        data: { name: t.name, title: t.title, quote: t.quote, avatar: t.avatar, isActive: true, orderIndex: i },
      });
    }
  }

  // 9. quick_prompts (按 label + scope 幂等)
  console.log(`  quick_prompts: ${quickPrompts.length} rows`);
  for (let i = 0; i < quickPrompts.length; i++) {
    const q = quickPrompts[i]!;
    const existing = await prisma.quickPrompt.findFirst({ where: { label: q.label, scope: q.scope as QuickPromptScope } });
    if (existing) {
      await prisma.quickPrompt.update({
        where: { id: existing.id },
        data: { emoji: q.emoji, promptText: q.promptText, orderIndex: i },
      });
    } else {
      await prisma.quickPrompt.create({
        data: { emoji: q.emoji, label: q.label, promptText: q.promptText, scope: q.scope as QuickPromptScope, isActive: true, orderIndex: i },
      });
    }
  }

  // 10. course_categories
  console.log(`  course_categories: ${courseCategories.length} rows`);
  for (let i = 0; i < courseCategories.length; i++) {
    const c = courseCategories[i]!;
    await prisma.courseCategory.upsert({
      where: { key: c.key },
      create: { key: c.key, label: c.label, isActive: true, orderIndex: i },
      update: { label: c.label, orderIndex: i },
    });
  }

  // 11. popular_searches
  console.log(`  popular_searches: ${popularSearches.length} rows`);
  for (let i = 0; i < popularSearches.length; i++) {
    const s = popularSearches[i]!;
    await prisma.popularSearch.upsert({
      where: { keyword: s.keyword },
      create: { keyword: s.keyword, clickCount: s.clickCount, isActive: true, orderIndex: i },
      update: { clickCount: s.clickCount, orderIndex: i },
    });
  }

  // 12. hot_keywords (按 keyword + scope 幂等)
  console.log(`  hot_keywords: ${hotKeywords.length} rows`);
  for (let i = 0; i < hotKeywords.length; i++) {
    const k = hotKeywords[i]!;
    const existing = await prisma.hotKeyword.findFirst({ where: { keyword: k.keyword, scope: k.scope as HotKeywordScope } });
    if (existing) {
      await prisma.hotKeyword.update({ where: { id: existing.id }, data: { orderIndex: i } });
    } else {
      await prisma.hotKeyword.create({ data: { keyword: k.keyword, scope: k.scope as HotKeywordScope, isActive: true, orderIndex: i } });
    }
  }

  // 13. auth_providers (主键 id, 直接 upsert)
  console.log(`  auth_providers: ${authProviders.length} rows`);
  for (let i = 0; i < authProviders.length; i++) {
    const a = authProviders[i]!;
    await prisma.authProvider.upsert({
      where: { id: a.id },
      create: { id: a.id, label: a.label, icon: a.icon, isActive: a.isActive, orderIndex: i, config: a.config ?? Prisma.JsonNull },
      update: { label: a.label, icon: a.icon, isActive: a.isActive, orderIndex: i, config: a.config ?? Prisma.JsonNull },
    });
  }

  // 14. top_nav_items (按 path 幂等)
  console.log(`  top_nav_items: ${topNavItems.length} rows`);
  for (let i = 0; i < topNavItems.length; i++) {
    const n = topNavItems[i]!;
    const existing = await prisma.topNavItem.findFirst({ where: { path: n.path } });
    if (existing) {
      await prisma.topNavItem.update({ where: { id: existing.id }, data: { label: n.label, icon: n.icon, orderIndex: i } });
    } else {
      await prisma.topNavItem.create({ data: { label: n.label, path: n.path, icon: n.icon, isActive: true, orderIndex: i } });
    }
  }

  // 15. footer_columns (按 title 幂等)
  console.log(`  footer_columns: ${footerColumns.length} rows`);
  for (let i = 0; i < footerColumns.length; i++) {
    const c = footerColumns[i]!;
    const existing = await prisma.footerColumn.findFirst({ where: { title: c.title } });
    if (existing) {
      await prisma.footerColumn.update({ where: { id: existing.id }, data: { links: c.links, orderIndex: i } });
    } else {
      await prisma.footerColumn.create({ data: { title: c.title, links: c.links, isActive: true, orderIndex: i } });
    }
  }

  // 16. i18n_messages
  console.log(`  i18n_messages: ${i18nMessages.length} rows`);
  for (const m of i18nMessages) {
    await prisma.i18nMessage.upsert({
      where: { key_locale: { key: m.key, locale: m.locale } },
      create: m,
      update: { value: m.value, category: m.category },
    });
  }

  const total =
    enumRows.length +
    siteSettings.length +
    pageSettings.length +
    appSettings.length +
    dateFormatTemplates.length +
    testimonials.length +
    quickPrompts.length +
    courseCategories.length +
    popularSearches.length +
    hotKeywords.length +
    authProviders.length +
    topNavItems.length +
    footerColumns.length +
    i18nMessages.length;

  console.log(`\n✅ Done. Total: ${total} rows across 16 tables.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
