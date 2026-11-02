import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAYMENT_METHOD, ordersApi } from './ordersApi';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from './api';

describe('ordersApi.pay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'order-1' } });
  });

  it('默认提交后端支持的微信支付方式', async () => {
    await ordersApi.pay('order-1');

    expect(DEFAULT_PAYMENT_METHOD).toBe('wechat');
    expect(api.post).toHaveBeenCalledWith('/api/v1/orders/order-1/pay', {
      paymentMethod: 'wechat',
    });
  });

  it('允许显式选择其他受支持支付方式', async () => {
    await ordersApi.pay('order-1', 'alipay');

    expect(api.post).toHaveBeenCalledWith('/api/v1/orders/order-1/pay', {
      paymentMethod: 'alipay',
    });
  });
});
