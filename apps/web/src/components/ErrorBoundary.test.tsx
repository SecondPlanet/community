import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// 故意抛错的子组件
function ThrowingChild({ shouldThrow = true }: { shouldThrow?: boolean }): ReactNode {
  if (shouldThrow) {
    throw new Error('test error message');
  }
  return <div>正常内容</div>;
}

// 让 ErrorBoundary 不在测试中刷屏 console.error
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function withRouter(ui: ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe('ErrorBoundary', () => {
  it('正常 children 不被拦截', () => {
    render(
      withRouter(
        <ErrorBoundary>
          <div>hello</div>
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('子组件 throw 时降级到错误页', () => {
    render(
      withRouter(
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>,
      ),
    );
    // 错误页应该有「重试」+「回首页」按钮 + role="alert"
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/页面出了点问题/i)).toBeInTheDocument();
    expect(screen.getByText(/重试/)).toBeInTheDocument();
    expect(screen.getByText(/回首页/)).toBeInTheDocument();
  });

  it('开发模式显示 error message', () => {
    // import.meta.env.DEV 默认在 vitest 下是 true
    render(
      withRouter(
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText(/test error message/)).toBeInTheDocument();
  });

  it('点击"重试"会重新渲染子组件', () => {
    // 用 shouldThrow flag 控制,reset 后不抛
    let shouldThrow = true;
    function ToggleChild() {
      if (shouldThrow) throw new Error('boom');
      return <div>recovered</div>;
    }

    const { rerender } = render(
      withRouter(
        <ErrorBoundary>
          <ToggleChild />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText(/页面出了点问题/i)).toBeInTheDocument();

    // 修复条件
    shouldThrow = false;
    // 点击重试
    screen.getByText(/重试/).click();
    rerender(
      withRouter(
        <ErrorBoundary>
          <ToggleChild />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('支持自定义 fallback', () => {
    const fallback = vi.fn((err: Error, reset: () => void) => (
      <div>
        custom: {err.message} <button onClick={reset}>reset</button>
      </div>
    ));
    render(
      withRouter(
        <ErrorBoundary fallback={fallback}>
          <ThrowingChild />
        </ErrorBoundary>,
      ),
    );
    expect(fallback).toHaveBeenCalled();
    expect(screen.getByText(/custom: test error message/)).toBeInTheDocument();
  });
});
