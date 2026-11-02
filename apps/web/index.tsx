import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './src/router';
import { queryClient } from './src/lib/queryClient';
import { AuthProvider } from './src/lib/auth/AuthProvider';
import { ToastProvider } from './src/components/auth/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { CmsErrorBanner } from './src/components/CmsErrorBanner';
import { initThemeFromStorage } from './src/components/Layout';

// 启动时同步 theme 到 <html class="dark">,避免首屏闪烁
initThemeFromStorage();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* P1: 全局 ErrorBoundary,任一子组件 throw 不再白屏 */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <CmsErrorBanner />
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
