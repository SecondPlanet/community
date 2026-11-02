import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ordersApi } from '../../lib/ordersApi';
import { useAuthStore } from '../../stores/authStore';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';
import { PAYMENT_OPERATIONS_AVAILABLE } from '../../lib/runtimeFeatures';
import { contactHref } from '../../lib/contact';
import { useDialogFocus } from '../../components/ui/useDialogFocus';

interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  type: 'course' | 'degree';
  itemId: string;
  title: string;
  price: number;
  costType: 'free' | 'paid' | 'charity';
}

type Step = 'confirm' | 'paying' | 'success';

export function PurchaseModal({
  open,
  onClose,
  type,
  itemId,
  title,
  price,
  costType,
}: PurchaseModalProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>('confirm');
  // 支付失败重试时复用已创建的订单, 避免每次重试都新建一条 pending 订单
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // CMS-driven copy
  const { t } = useI18n();
  const { data: pageData } = usePageSettings('purchase', [
    'confirm_title_template', 'confirm_desc_template',
    'success_title_template', 'success_desc_template',
    'go_learn', 'pay_now', 'enroll_now',
  ]);
  const isFree = costType === 'free' || costType === 'charity';
  const checkoutAvailable = isFree || PAYMENT_OPERATIONS_AVAILABLE;
  // 简化版 title: 用两个独立 key(避免 i18n template 复杂度)
  const confirmTitle = isFree
    ? pickPage(pageData, 'confirm_title_free', 'zh-CN', t('purchase.confirm_title_free', '确认报名'))
    : PAYMENT_OPERATIONS_AVAILABLE
      ? pickPage(pageData, 'confirm_title_paid', 'zh-CN', t('purchase.confirm_title_paid', '确认下单'))
      : '提交购买咨询';
  const confirmDesc = isFree
    ? pickPage(pageData, 'confirm_desc_free', 'zh-CN', t('purchase.confirm_desc_free', '该内容免费,注册后即可开始学习'))
    : PAYMENT_OPERATIONS_AVAILABLE
      ? pickPage(pageData, 'confirm_desc_paid', 'zh-CN', t('purchase.confirm_desc_paid', '请确认订单信息,支付后立即开通学习权限'))
      : '在线支付接入前，可提交购买需求，由平台顾问协助确认付款与开通权限。';
  const successTitle = isFree
    ? pickPage(pageData, 'success_title_free', 'zh-CN', t('purchase.success_title_free', '报名成功'))
    : pickPage(pageData, 'success_title_paid', 'zh-CN', t('purchase.success_title_paid', '支付成功'));
  const successDesc = type === 'degree'
    ? pickPage(pageData, 'success_desc_degree', 'zh-CN', t('purchase.success_desc_degree', '已同步开通学位下所有课程,立即开始学习吧'))
    : pickPage(pageData, 'success_desc_course', 'zh-CN', t('purchase.success_desc_course', '课程已开通,去个人中心开始学习吧'));
  const goLearn = pickPage(pageData, 'go_learn', 'zh-CN', t('purchase.go_learn', '开始学习'));

  const createMutation = useMutation({
    mutationFn: () =>
      ordersApi.create({
        type,
        courseId: type === 'course' ? itemId : undefined,
        degreeId: type === 'degree' ? itemId : undefined,
      }),
  });

  const payMutation = useMutation({
    mutationFn: (orderId: string) => ordersApi.pay(orderId),
  });

  const busy = createMutation.isPending || payMutation.isPending;

  const close = () => {
    if (busy) return;
    setStep('confirm');
    createMutation.reset();
    payMutation.reset();
    onClose();
  };

  useDialogFocus(dialogRef, { open, onClose: close, disableEscape: busy });

  useEffect(() => {
    if (open) return;
    setStep('confirm');
    setPendingOrderId(null);
    createMutation.reset();
    payMutation.reset();
  }, [open]);

  // Each step replaces the dialog body. Move focus to the new state after the
  // DOM commits so focus never falls back to <body> when the prior button is removed.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const target =
        dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
        dialogRef.current;
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, step]);

  if (!open) return null;

  const handleConfirm = async () => {
    try {
      // 已有未支付订单时直接重试支付, 不再重复创建订单
      const orderId = pendingOrderId ?? (await createMutation.mutateAsync()).order?.id;
      if (orderId) {
        setPendingOrderId(orderId);
        setStep('paying');
        await payMutation.mutateAsync(orderId);
        setPendingOrderId(null);
        setStep('success');
        void qc.invalidateQueries({ queryKey: ['enrollments', 'me'] });
        // 支付前课程详情里的课时 videoUrl 被后端剥离, 必须失效详情缓存才能立即可看
        void qc.invalidateQueries({ queryKey: [type, itemId] });
        return;
      }
      setStep('success');
      void qc.invalidateQueries({ queryKey: ['enrollments', 'me'] });
      void qc.invalidateQueries({ queryKey: [type, itemId] });
    } catch {
      setStep('confirm');
    }
  };

  const handleGoLearn = () => {
    close();
    navigate('/profile');
  };

  const handleConsult = () => {
    close();
    window.location.href = contactHref(
      `购买咨询：${title}`,
      `${type === 'course' ? '课程' : '学位'}：${title}\n项目 ID：${itemId}\n标价：¥${Number(price).toFixed(2)}`,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <button
        type="button"
        aria-label="关闭购买窗口"
        onClick={close}
        disabled={busy}
        className="absolute inset-0 bg-black/50 disabled:cursor-wait"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={step === 'confirm' ? descriptionId : undefined}
        aria-busy={busy}
        tabIndex={-1}
        className="bg-white border-2 border-[#171717] max-w-md w-full p-6 md:p-8 relative animate-in zoom-in-95"
      >
        <button
          type="button"
          onClick={close}
          disabled={busy}
          aria-label="关闭购买窗口"
          className="absolute top-3 right-3 p-2 hover:bg-[#EEEDE9] disabled:cursor-wait disabled:opacity-50"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        {step === 'confirm' && (
          <>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
              / {isFree ? t('purchase.eyebrow.enroll', 'Enroll') : t('purchase.eyebrow.checkout', 'Checkout')}
            </div>
            <h2 id={titleId} className="text-2xl font-black tracking-tight mb-2">
              {confirmTitle}
            </h2>
            <p id={descriptionId} className="text-sm text-[#666666] mb-6">
              {confirmDesc}
            </p>

            <div className="border-2 border-[#171717] p-5 mb-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">
                / {type === 'course' ? t('purchase.field.course', 'Course') : t('purchase.field.degree', 'Degree')}
              </div>
              <div className="font-black text-lg mb-4 tracking-tight">{title}</div>
              <div className="flex items-center justify-between pt-4 border-t border-[#171717]">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
                  {isFree ? t('purchase.label.free', 'Free') : t('purchase.label.total', 'Total')}
                </span>
                <span className="text-2xl font-black tracking-tighter">
                  {isFree ? t('purchase.label.free_zh', '免费') : `¥${Number(price).toFixed(2)}`}
                </span>
              </div>
            </div>

            {!user && (
              <div className="text-sm font-medium border-2 border-[#171717] px-3 py-2 mb-4 bg-[#F5F4F0]">
                {t('purchase.guest_warning', '请先登录后再购买')}
              </div>
            )}

            {!isFree && !PAYMENT_OPERATIONS_AVAILABLE && (
              <div className="text-sm font-medium border-2 border-[#171717] px-3 py-2 mb-4 bg-warning-100">
                在线支付尚未开放，但可以提交购买咨询，由平台顾问协助办理。
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                data-autofocus
                onClick={close}
                className="flex-1 py-3 border-2 border-[#171717] text-[#171717] text-xs font-black uppercase tracking-widest hover:bg-[#EEEDE9] transition-colors"
              >
                {t('purchase.cancel', '取消')}
              </button>
              {!isFree && !PAYMENT_OPERATIONS_AVAILABLE ? (
                <button
                  type="button"
                  onClick={handleConsult}
                  className="flex-1 py-3 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
                >
                  联系顾问购买
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!user || !checkoutAvailable || createMutation.isPending}
                  className="flex-1 py-3 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2
                        className="w-4 h-4 animate-spin mx-auto"
                        aria-hidden="true"
                      />
                      <span className="sr-only">提交中…</span>
                    </>
                  ) : isFree ? (
                    t('purchase.enroll_now', '立即报名')
                  ) : (
                    t('purchase.pay_now', '立即支付')
                  )}
                </button>
              )}
            </div>

            {(createMutation.isError || payMutation.isError) && (
              <div
                role="alert"
                aria-live="assertive"
                className="text-sm text-red-600 mt-3 text-center"
              >
                {payMutation.isError
                  ? t('purchase.error.payment', '支付失败，请检查网络后重试')
                  : t('purchase.error.fail', '操作失败，请稍后重试')}
              </div>
            )}
          </>
        )}

        {step === 'paying' && (
          <div role="status" aria-live="polite" className="text-center py-8">
            <Loader2
              className="w-10 h-10 animate-spin mx-auto text-[#171717] mb-4"
              aria-hidden="true"
            />
            <div id={titleId} className="font-black text-lg tracking-tight">
              {t('common.paying', '支付中…')}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-2">
              {t('common.paying.suffix', '正在安全处理订单，请勿关闭此窗口')}
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto bg-[#171717] text-white flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" strokeWidth={3} aria-hidden="true" />
            </div>
            <h2
              id={titleId}
              data-autofocus
              tabIndex={-1}
              className="text-2xl font-black tracking-tighter mb-2 outline-none"
            >
              {successTitle}
            </h2>
            <p className="text-sm text-[#666666] mb-6">
              {successDesc}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={close}
                className="flex-1 py-3 border-2 border-[#171717] text-[#171717] text-xs font-black uppercase tracking-widest hover:bg-[#EEEDE9] transition-colors"
              >
                {t('purchase.later', '稍后')}
              </button>
              <button
                type="button"
                onClick={handleGoLearn}
                className="flex-1 py-3 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
              >
                {goLearn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
