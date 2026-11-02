import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

// Security: AI provider API keys must NEVER be injected into the client bundle.
// Any Gemini call goes through the backend (apps/api) — see ai.service.ts.
export default defineConfig(({ mode }) => {
    // 读根目录 .env(与 apps/api 共享),不注入到 client
    const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
    const API_TARGET = env.API_INTERNAL_URL ?? 'http://localhost:8080';
    const webPackage = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
    ) as { version: string };

    // P0 安全加固 2026-07-23: dev mode 给 index.html 注入 HMR 需要的
    //   connect-src ws://localhost:* + http://localhost:*, prod build 不注入.
    //   prod 用静态 meta CSP (index.html),严格限制 inline script.
    const devCspPlugin: PluginOption = {
      name: 'dev-csp-relax',
      apply: 'serve', // 只 dev mode
      transformIndexHtml(html) {
        const relaxed = html.replace(
          /connect-src 'self'( https:\/\/generativelanguage\.googleapis\.com)?;/,
          "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*$1;",
        );
        return relaxed;
      },
    };

    return {
      server: {
        port: 5500,
        strictPort: true,
        host: '0.0.0.0',
        // P1 fix: 把 /api/* proxy 到后端,让 frontend 与 backend 视为同源
        //
        // 为什么需要: 后端用 httpOnly cookie (refresh_token) 鉴权,cookie 设了
        //   sameSite=lax + path=/api/v1/auth。浏览器对 **跨站 fetch(XHR/axios)
        //   不送 lax cookie**,所以 hard reload 后 401 → refresh 永远失败。
        // 通过 Vite proxy 让浏览器把请求都发到 5500(proxy 转发到 8080),
        //   Set-Cookie 落到 5500 这个 origin,后续 fetch 同源,cookie 正常带。
        //
        // 生产环境: 真实部署时 nginx / cloudfront 同源反向代理,行为一致。
        proxy: {
          '/api': {
            target: API_TARGET,
            changeOrigin: true,
            // 不要 rewrite — 后端路径已经以 /api/v1 开头,直接转发
          },
        },
      },
      plugins: [react(), devCspPlugin],
      define: {
        __APP_VERSION__: JSON.stringify(webPackage.version),
        // 强制让 import.meta.env.DEV 在 prod build 时是字面量 false。
        // 默认 Vite 也会替换, 但通过 define 显式声明让 esbuild 在 minify 阶段
        // 把 `false ? [devRoutes] : []` 折叠为 `[]`, 消除 dev-only 路由
        // (防止 /__design-system 与 /__error-demo/* 在 production bundle 暴露)。
        'import.meta.env.DEV': mode === 'production' ? 'false' : 'true',
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('/react-router') ||
                id.includes('/scheduler/')
              ) {
                return 'vendor-react';
              }
              if (id.includes('/@tanstack/')) return 'vendor-query';
              if (id.includes('/axios/')) return 'vendor-http';
              if (id.includes('/react-hook-form/') || id.includes('/zod/')) {
                return 'vendor-forms';
              }
              return undefined;
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
    };
});
