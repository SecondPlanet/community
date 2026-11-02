/**
 * OrderStatus meta — 集中订单状态文案 / chip 配色
 *
 * 历史:OrdersPage + OrderDetailPage 各自维护一份 fallback 标签和 chip 配色,
 * 任何新状态或配色调整都要两处同步 — 容易出现"颜色不一致"或"漏改"bug。
 *
 * 现状:
 *   - 后端 enum 翻译 (useEnum('order_status')) 是首选,这里只作为 fallback
 *   - chip 配色走 brutalist 设计的 5 色系:warning / success / danger / neutral / info
 *
 * 用法:
 *   import { getOrderStatusMeta } from '@/lib/orderStatusMeta';
 *   const { label, chipClass, icon } = getOrderStatusMeta(status);
 */
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrderStatus } from '@secondplanet/shared-types';

export interface OrderStatusMeta {
  label: string;
  /** brutalist chip 配色 (含 dark mode 变体) */
  chipClass: string;
  /** 圆点状态图标 (用于详情页 hero icon) */
  icon: ReactNode;
}

const LABEL: Record<OrderStatus, string> = {
  pending: '待支付',
  paid: '已支付',
  failed: '支付失败',
  expired: '已取消',
  refunded: '已退款',
};

const CHIP_CLASS: Record<OrderStatus, string> = {
  pending: 'bg-warning-100 text-warning-500 dark:bg-warning-500/20 dark:text-warning-500',
  paid: 'bg-success-100 text-success-500 dark:bg-success-500/20 dark:text-success-500',
  failed: 'bg-danger-100 text-danger-500 dark:bg-danger-500/20 dark:text-danger-500',
  expired: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-200 dark:text-neutral-600',
  refunded: 'bg-info-100 text-info-500 dark:bg-info-500/20 dark:text-info-500',
};

const ICON: Record<OrderStatus, ReactNode> = {
  pending: <Clock className="w-5 h-5" />,
  paid: <CheckCircle2 className="w-5 h-5" />,
  failed: <AlertCircle className="w-5 h-5" />,
  expired: <XCircle className="w-5 h-5" />,
  refunded: <RotateCcw className="w-5 h-5" />,
};

/**
 * 取订单状态元数据 — 业务方应优先用 useEnum('order_status').getLabel(),
 * 此函数仅作为 API 失败 / 静态渲染时的 fallback。
 */
export function getOrderStatusMeta(status: OrderStatus): OrderStatusMeta {
  return {
    label: LABEL[status],
    chipClass: CHIP_CLASS[status],
    icon: ICON[status],
  };
}

/** 取纯文案(给 tab / chip 等需要 label 单独的场景) */
export function getOrderStatusLabel(status: OrderStatus): string {
  return LABEL[status];
}

/** 取纯 chip 配色 */
export function getOrderStatusChipClass(status: OrderStatus): string {
  return CHIP_CLASS[status];
}
