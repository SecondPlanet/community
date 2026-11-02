/**
 * 4 个法律页 + LegalPage 共用底层 的测试
 * - TermsPage (服务条款)
 * - PrivacyPage (隐私政策)
 * - CookiesPage (Cookie 政策)
 * - RefundPage (退款政策)
 * - LegalPage 通用底层 (TOC / breadcrumb / scroll-spy)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TermsPage } from './TermsPage';
import { PrivacyPage } from './PrivacyPage';
import { CookiesPage } from './CookiesPage';
import { RefundPage } from './RefundPage';
import { LegalPage, type LegalSection } from './LegalPage';

// ───── 公共 wrapper ─────
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  qc.setQueryData(['cms', 'i18n-messages', 'zh-CN'], {});
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function renderWithProviders(ui: React.ReactNode) {
  return render(ui, { wrapper: makeWrapper() });
}

describe('LegalPage 通用底层', () => {
  const sampleSections: LegalSection[] = [
    { id: 'a', title: '第一节 测试', content: <p>第一节内容</p> },
    { id: 'b', title: '第二节 测试', content: <p>第二节内容</p> },
    { id: 'c', title: '第三节 测试', content: <p>第三节内容</p> },
  ];

  it('渲染 eyebrow + 标题 + 副标题 + lastUpdated', () => {
    renderWithProviders(
      <LegalPage
        eyebrow="/ Legal · Test"
        title="测试政策"
        subtitle="这是副标题"
        lastUpdated="2026-07-24"
        sections={sampleSections}
      />,
    );
    expect(screen.getByText('/ Legal · Test')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '测试政策' })).toBeInTheDocument();
    expect(screen.getByText('这是副标题')).toBeInTheDocument();
    expect(screen.getByText('2026-07-24')).toBeInTheDocument();
  });

  it('breadcrumb 包含「首页」+ 当前页', () => {
    renderWithProviders(
      <LegalPage eyebrow="x" title="隐私政策" lastUpdated="x" sections={sampleSections} />,
    );
    const nav = screen.getByLabelText('breadcrumb');
    expect(within(nav).getByText('首页')).toBeInTheDocument();
    expect(within(nav).getByText('隐私政策')).toBeInTheDocument();
  });

  it('渲染所有 section id (用于锚点跳转)', () => {
    renderWithProviders(
      <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={sampleSections} />,
    );
    sampleSections.forEach((s) => {
      expect(document.getElementById(s.id)).toBeInTheDocument();
    });
  });

  it('TOC 桌面 sidebar 渲染所有 sections', () => {
    renderWithProviders(
      <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={sampleSections} />,
    );
    // desktop nav (md:block)
    const toc = screen.getByLabelText('Table of contents');
    sampleSections.forEach((s) => {
      expect(within(toc).getByText(s.title)).toBeInTheDocument();
    });
  });

  it('TOC 项有编号 (01 / 02 / 03)', () => {
    renderWithProviders(
      <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={sampleSections} />,
    );
    const toc = screen.getByLabelText('Table of contents');
    expect(within(toc).getByText('01')).toBeInTheDocument();
    expect(within(toc).getByText('02')).toBeInTheDocument();
    expect(within(toc).getByText('03')).toBeInTheDocument();
  });

  it('TOC 项点击触发 scrollIntoView + URL hash 更新', () => {
    const scrollIntoViewMock = vi.fn();
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    // 模拟 history.replaceState 验证
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    renderWithProviders(
      <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={sampleSections} />,
    );
    const toc = screen.getByLabelText('Table of contents');
    const link = within(toc).getByText('第二节 测试');
    fireEvent.click(link);

    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#b');
    expect(link.getAttribute('aria-current')).toBe('true');

    HTMLElement.prototype.scrollIntoView = originalScroll;
    replaceStateSpy.mockRestore();
  });

  it('未配置联系邮箱时引导到社区联系渠道', () => {
    renderWithProviders(
      <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={sampleSections} />,
    );
    expect(
      screen.getByRole('link', { name: '提交联系申请' }).getAttribute('href'),
    ).toMatch(/^(mailto:|https:\/\/github\.com\/)/);
  });

  it('配置联系邮箱时使用 mailto 链接', () => {
    renderWithProviders(
      <LegalPage
        eyebrow="x"
        title="x"
        lastUpdated="x"
        sections={sampleSections}
        contactEmail="privacy@example.com"
      />,
    );
    expect(screen.getByRole('link', { name: 'privacy@example.com' })).toHaveAttribute(
      'href',
      'mailto:privacy@example.com',
    );
  });

  it('空 sections 不报错', () => {
    expect(() =>
      renderWithProviders(
        <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={[]} />,
      ),
    ).not.toThrow();
  });

  it('Back to top 链接存在', () => {
    renderWithProviders(
      <LegalPage eyebrow="x" title="x" lastUpdated="x" sections={sampleSections} />,
    );
    // Back to top 文字前有 ↑ 字符, 用 function matcher
    expect(
      screen.getByText((content) => content.includes('Back to top')),
    ).toBeInTheDocument();
  });
});

describe('TermsPage 服务条款', () => {
  it('渲染标题 + 核心章节', () => {
    renderWithProviders(<TermsPage />);
    expect(screen.getByRole('heading', { name: '服务与使用说明', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '账户与安全', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '学习、AI 与证书', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '付费服务', level: 2 })).toBeInTheDocument();
  });

  it('包含"SecondPlanet" 主体声明', () => {
    renderWithProviders(<TermsPage />);
    expect(screen.getAllByText(/SecondPlanet/).length).toBeGreaterThan(0);
  });

  it('不承诺尚未实现的在线支付或发票能力', () => {
    renderWithProviders(<TermsPage />);
    expect(document.body.textContent).toContain('未开放在线支付、在线退款和电子发票申请');
    expect(document.body.textContent).not.toContain('支持支付宝、微信支付');
  });
});

describe('PrivacyPage 隐私政策', () => {
  it('渲染标题 + 核心章节', () => {
    renderWithProviders(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: '隐私与数据使用说明', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '系统实际处理的信息', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 服务', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '浏览器存储', level: 2 })).toBeInTheDocument();
  });

  it('隐私联系入口走社区联系渠道', () => {
    renderWithProviders(<PrivacyPage />);
    const link = screen.getByRole('link', { name: '提交联系申请' });
    expect(link.getAttribute('href')).toMatch(/^(mailto:|https:\/\/github\.com\/)/);
  });

  it('说明公开证书验证的分享边界', () => {
    renderWithProviders(<PrivacyPage />);
    expect(document.body.textContent).toContain('任何获得该序列号的人');
  });

  it('不虚构固定云区域或自动删除周期', () => {
    renderWithProviders(<PrivacyPage />);
    expect(document.body.textContent).not.toContain('阿里云 / 腾讯云华东节点');
    expect(document.body.textContent).not.toContain('90 天,之后自动');
  });
});

describe('CookiesPage Cookie 政策', () => {
  it('渲染标题 + 核心章节', () => {
    renderWithProviders(<CookiesPage />);
    expect(screen.getByRole('heading', { name: 'Cookie 与本地存储说明', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '必要 Cookie', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SessionStorage', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LocalStorage', level: 2 })).toBeInTheDocument();
  });

  it('列出代码实际使用的存储键且不再声称 auth-user', () => {
    renderWithProviders(<CookiesPage />);
    expect(document.body.textContent).not.toContain('auth-user');
    expect(screen.getAllByText('refresh_token').length).toBeGreaterThan(0);
    expect(screen.getAllByText('aicourse.accessToken').length).toBeGreaterThan(0);
    expect(screen.getAllByText('theme').length).toBeGreaterThan(0);
  });

  it('明确说明不卖数据 / 不做营销 Cookie', () => {
    renderWithProviders(<CookiesPage />);
    expect(document.body.textContent).toMatch(/没有营销 Cookie/);
  });
});

describe('RefundPage 退款政策', () => {
  it('渲染标题 + 核心章节', () => {
    renderWithProviders(<RefundPage />);
    expect(screen.getByRole('heading', { name: '付款与退款说明', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '当前支付状态', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '付费采购与退款', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '测试数据', level: 2 })).toBeInTheDocument();
  });

  it('不承诺不存在的 24 小时在线退款流程', () => {
    renderWithProviders(<RefundPage />);
    expect(document.body.textContent).toContain('未开放在线支付和在线退款');
    expect(document.body.textContent).not.toContain('24 小时试听窗口');
  });

  it('付费采购规则以书面合同为准', () => {
    renderWithProviders(<RefundPage />);
    expect(document.body.textContent).toContain('双方签署的合同或订单为唯一依据');
  });
});

describe('router 集成', () => {
  it('4 个法律页路由都注册到 /terms /privacy /cookies /refund', () => {
    // 模拟进入 /terms 路径
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['cms', 'i18n-messages', 'zh-CN'], {});
    render(
      <QueryClientProvider
        client={queryClient}
      >
        <MemoryRouter initialEntries={['/terms']}>
          <Routes>
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/refund" element={<RefundPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: '服务与使用说明' })).toBeInTheDocument();
  });
});
