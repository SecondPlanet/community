/**
 * AboutPage — 关于页测试(静态页)
 * 关注:
 *   - Hero 文案 + 三条理念卡片
 *   - CTA 链接指向 /courses
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AboutPage } from './AboutPage';

function renderAbout() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('AboutPage', () => {
  it('渲染 Hero 标题与介绍', () => {
    renderAbout();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('让 AI 时代的能力');
    expect(screen.getByText(/面向个人学习者的 AI 学习平台/)).toBeInTheDocument();
  });

  it('渲染三条理念卡片', () => {
    renderAbout();
    expect(screen.getByRole('heading', { name: '我们坚持的三件事' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '以实践检验学习' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '让能力可被验证' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '连接学习者与讲师' })).toBeInTheDocument();
    expect(screen.getByText(/让知识最终落到可以展示和复用的作品/)).toBeInTheDocument();
  });

  it('CTA 链接指向课程页', () => {
    renderAbout();
    expect(screen.getByRole('link', { name: /浏览课程/ })).toHaveAttribute('href', '/courses');
  });
});