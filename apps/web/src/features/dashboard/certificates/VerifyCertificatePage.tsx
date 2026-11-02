/**
 * VerifyCertificatePage — P1-8 证书公开验证
 *
 * 公开路由 `/verify/:serial`, 任何人都能访问(匿名), 用于第三方验证证书真伪。
 *
 * 设计:
 *   - 顶部: 大 ✓ 绿色对勾 / ✗ 红色叉 (valid: true/false)
 *   - 证书信息 (holder / title / issuedAt / serial)
 *   - 底部: "返回 SecondPlanet"
 *
 * 响应式: mobile 单列, 居中卡片
 */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ShieldCheck, ArrowLeft, Award } from 'lucide-react';
import { certificatesApi } from '../../../lib/certificatesApi';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Card } from '../../../components/ui/Card';
import { QueryErrorState } from '../../../components/QueryErrorState';
import { cn } from '../../../lib/cn';

export function VerifyCertificatePage() {
  const { serial = '' } = useParams<{ serial: string }>();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['certificates', 'verify', serial],
    queryFn: () => certificatesApi.verifyCertificate(serial),
    enabled: !!serial,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton variant="rectangle" className="h-32 w-full" />
          <Skeleton variant="rectangle" className="h-48 w-full" />
        </div>
      </div>
    );
  }

  // P0 (audit 2026-07-24): 网络错 / 后端挂 不能错把 "未找到证书" 显示给第三方
  // 验证人,要明确区分"挂了"和"没找到"
  if (isError) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-2xl mx-auto">
          <QueryErrorState
            error={error}
            onRetry={() => refetch()}
            title="验证服务暂不可用"
            description="无法连接验证服务, 请稍后重试或联系发证方"
          />
        </div>
      </div>
    );
  }

  const valid = data?.valid === true;
  const cert = data?.certificate;
  const reason = data?.reason;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-900">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 状态卡 */}
        <Card padding="lg" variant="elevated" className="text-center mb-6">
          <div
            className={cn(
              'mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4',
              valid
                ? 'bg-success-100 text-success-500 dark:bg-success-500/20'
                : 'bg-danger-100 text-danger-500 dark:bg-danger-500/20',
            )}
          >
            {valid ? (
              <CheckCircle2 className="w-12 h-12" />
            ) : (
              <XCircle className="w-12 h-12" />
            )}
          </div>
          <h1
            className={cn(
              'text-2xl font-bold mb-1',
              valid ? 'text-success-500' : 'text-danger-500',
            )}
          >
            {valid ? '证书有效' : '证书无效'}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-600">
            {valid
              ? '该证书已通过 SecondPlanet 官方验证'
              : reason === 'revoked'
                ? '该证书已被撤销, 不再有效'
                : reason === 'not_found'
                  ? '未找到该证书编号对应的记录'
                  : '验证失败, 请检查证书编号'}
          </p>
        </Card>

        {/* 证书信息 */}
        {cert && (
          <Card padding="lg" variant="default">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-[#171717]" />
              <h2 className="text-lg font-semibold">证书信息</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {cert.title && <VerifyField label="证书标题" value={cert.title} />}
              {cert.holderName && <VerifyField label="持证人" value={cert.holderName} />}
              {cert.type && <VerifyField label="类型" value={cert.type} />}
              <VerifyField label="证书编号" value={cert.serialNumber} mono />
              {cert.issuedAt && (
                <VerifyField
                  label="颁发日期"
                  value={new Date(cert.issuedAt).toLocaleString('zh-CN')}
                />
              )}
              {cert.completedAt && (
                <VerifyField
                  label="完成日期"
                  value={new Date(cert.completedAt).toLocaleString('zh-CN')}
                />
              )}
              {cert.revokedAt && (
                <VerifyField
                  label="撤销时间"
                  value={new Date(cert.revokedAt).toLocaleString('zh-CN')}
                />
              )}
            </dl>
          </Card>
        )}

        {/* 底部 */}
        <div className="mt-8 text-center space-y-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white rounded-md hover:bg-[#262626] text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回 SecondPlanet
          </Link>
          <p className="text-xs text-neutral-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            证书验证由 SecondPlanet 官方提供
          </p>
        </div>
      </div>
    </div>
  );
}

function VerifyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-neutral-200 last:border-b-0 pb-2 last:pb-0">
      <dt className="w-24 shrink-0 text-neutral-600 dark:text-neutral-600">{label}</dt>
      <dd className={cn('flex-1', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
