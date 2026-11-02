/**
 * ErrorDemoPage — dev-only 错误页演示路由
 *
 * 路径: /__error-demo/:type
 *   type = '404' | '403' | '500' | 'network'
 *
 * 用途:
 *   - 截图 / QA 验证 4 个错误页
 *   - 跟 router.tsx 的 import.meta.env.DEV 保护一起, prod build 自动 tree-shake
 *
 * 切勿在生产环境访问 — 只是 dev tool
 */
import { useParams, Link } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';
import { ForbiddenPage } from './ForbiddenPage';
import { ServerErrorPage } from './ServerErrorPage';
import { NetworkErrorPage } from './NetworkErrorPage';

export function ErrorDemoPage() {
  const { type = '404' } = useParams<{ type: string }>();

  let body: React.ReactNode;
  switch (type) {
    case '403':
      body = <ForbiddenPage />;
      break;
    case '500':
      body = <ServerErrorPage error={new Error('Demo: Database connection failed (simulated)')} onRetry={() => window.location.reload()} />;
      break;
    case 'network':
      body = <NetworkErrorPage onRetry={() => window.location.reload()} />;
      break;
    case '404':
    default:
      body = <NotFoundPage />;
      break;
  }

  return (
    <>
      {body}
      {/* 顶部小条: dev-only 标识 + 切换链接, 截图时方便 */}
      <div className="fixed top-2 left-2 z-50 flex items-center gap-1 bg-yellow-300 text-black text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow">
        <span>Dev / Error Demo:</span>
        {(['404', '403', '500', 'network'] as const).map((t) => (
          <Link
            key={t}
            to={`/__error-demo/${t}`}
            className={
              'px-1.5 py-0.5 rounded hover:bg-black/10 ' +
              (t === type ? 'bg-black text-yellow-300' : '')
            }
          >
            {t}
          </Link>
        ))}
      </div>
    </>
  );
}
