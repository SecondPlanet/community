/**
 * CertificateDetailPage — P1-8 证书详情
 *
 * 设计:
 *   - 大证书视图：brutalist 黑底 + 装饰 + 平台 logo + 标题 + holder + serial + 颁发日期
 *   - 底部操作：浏览器打印为 PDF + 验证(跳 /verify/:serial) + 返回
 *   - 公开页面(任何人都能看), 响应式
 */
import { useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  ArrowLeft,
  Download,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import type { CertificateType } from '@secondplanet/shared-types';
import { certificatesApi } from '../../../lib/certificatesApi';
import { useToast } from '../../../components/auth/Toast';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { QueryErrorState } from '../../../components/QueryErrorState';
import { cn } from '../../../lib/cn';
import { getCertificateTypeMeta } from '../../../lib/certificateMeta.tsx';

export function CertificateDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const certRef = useRef<HTMLDivElement>(null);

  const { data: cert, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['certificates', id],
    queryFn: () => certificatesApi.getCertificate(id),
    enabled: !!id,
    retry: 0,
  });

  /**
   * 下载 PDF — 走浏览器原生 print 对话框,用户可选「另存为 PDF」
   * 配合内联 @media print 样式,只打印证书大图,隐藏其他 UI
   * 比引入 jsPDF/html2canvas 轻量,无新依赖
   */
  const handleDownloadPdf = () => {
    showToast('正在准备打印对话框,选择"另存为 PDF"即可保存', 'info');
    setTimeout(() => window.print(), 100);
  };

  /**
   * 复制公开验证链接到剪贴板
   */
  const handleCopyVerifyLink = async () => {
    if (!cert) return;
    const url = `${window.location.origin}/verify/${cert.serialNumber}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('验证链接已复制', 'success');
    } catch {
      showToast('复制失败,请手动选择链接', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton variant="text" className="h-8 w-1/3" />
          <Skeleton variant="rectangle" className="h-80 w-full" />
        </div>
      </div>
    );
  }

  // P0 (audit 2026-07-24): 区分"网络挂"和"找不到"
  if (isError) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-4xl mx-auto">
          <QueryErrorState
            error={error}
            onRetry={() => refetch()}
            title="无法加载证书详情"
            description="请检查网络后重试"
          />
        </div>
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-neutral-600 dark:text-neutral-600 mb-4">证书不存在</p>
          <Link
            to="/dashboard/certificates"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white rounded-md hover:bg-[#262626]"
          >
            <ArrowLeft className="w-4 h-4" />
            返回证书列表
          </Link>
        </div>
      </div>
    );
  }

  const typeKey = (cert.type as CertificateType) ?? 'course';
  const typeMeta = getCertificateTypeMeta(typeKey);
  const issuedDate = new Date(cert.issuedAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const completedDate = new Date(cert.completedAt).toLocaleDateString('zh-CN');

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 顶部 */}
        <PageHeader
          backHref="/dashboard/certificates"
          icon={<Award className="w-5 h-5 text-cert-500" />}
          title="证书详情"
        />

        {/* 大证书视图 */}
        <Card padding="none" variant="elevated" className="overflow-hidden">
          <div
            ref={certRef}
            className={cn(
              'relative aspect-[16/10] sm:aspect-[16/9] text-white p-8 sm:p-12 flex flex-col items-center justify-center text-center',
              'print:aspect-auto print:min-h-[80vh] print:p-16',
              typeMeta.gradientClass,
            )}
          >
            {/* 装饰 */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-4 w-16 h-16 border-2 border-white rounded-full" />
              <div className="absolute top-4 right-4 w-16 h-16 border-2 border-white rounded-full" />
              <div className="absolute bottom-4 left-4 w-16 h-16 border-2 border-white rounded-full" />
              <div className="absolute bottom-4 right-4 w-16 h-16 border-2 border-white rounded-full" />
              <div className="absolute inset-8 border-2 border-white rounded-md" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-md flex items-center justify-center">
                  <Award className="w-6 h-6" />
                </div>
                <span className="text-sm font-mono tracking-[0.2em] uppercase">
                  SecondPlanet
                </span>
              </div>

              <div className="text-xs uppercase tracking-[0.3em] opacity-80 mb-3 inline-flex items-center gap-1.5">
                {typeMeta.icon}
                {typeMeta.fullLabel}
              </div>

              <h2 className="text-2xl sm:text-4xl font-bold mb-2 leading-tight">
                {cert.title}
              </h2>

              {cert.holderName && (
                <div className="text-base sm:text-lg opacity-90 mb-4">
                  特授予 <span className="font-bold">{cert.holderName}</span> 同学
                </div>
              )}

              {cert.description && (
                <p className="text-sm sm:text-base opacity-80 max-w-lg mx-auto leading-relaxed">
                  {cert.description}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs">
                <div>
                  <div className="opacity-60 uppercase tracking-wider mb-1">证书编号</div>
                  <div className="font-mono font-bold tracking-wider">{cert.serialNumber}</div>
                </div>
                <div>
                  <div className="opacity-60 uppercase tracking-wider mb-1">颁发日期</div>
                  <div className="font-bold">{issuedDate}</div>
                </div>
                <div>
                  <div className="opacity-60 uppercase tracking-wider mb-1">完成日期</div>
                  <div className="font-bold">{completedDate}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 元数据 + 操作 */}
          <div className="p-6 space-y-4">
            {cert.metadata && Object.keys(cert.metadata).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">证书元数据</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {Object.entries(cert.metadata).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2">
                      <dt className="text-neutral-600 dark:text-neutral-600 capitalize">
                        {k}:
                      </dt>
                      <dd className="font-mono text-xs">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {cert.revokedAt && (
              <div className="rounded-md border border-danger-500/30 bg-danger-100 dark:bg-danger-500/20 p-3 text-sm text-danger-500">
                ⚠️ 此证书已被撤销 ({new Date(cert.revokedAt).toLocaleString('zh-CN')})
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 print:hidden">
              <button
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white rounded-md hover:bg-[#262626] text-sm font-medium transition-colors"
              >
                <Printer className="w-4 h-4" />
                下载 PDF
              </button>
              <button
                onClick={handleCopyVerifyLink}
                className="inline-flex items-center gap-2 px-4 py-2 bg-info-100 text-info-500 rounded-md hover:bg-info-500/20 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                复制验证链接
              </button>
              <Link
                to={`/verify/${cert.serialNumber}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-success-100 text-success-500 rounded-md hover:bg-success-500/20 text-sm font-medium transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                公开验证
              </Link>
              <Link
                to="/dashboard/certificates"
                className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-100 text-neutral-900 dark:text-neutral-900 rounded-md hover:bg-neutral-200 text-sm font-medium transition-colors"
              >
                返回列表
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
