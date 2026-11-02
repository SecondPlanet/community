/**
 * certificatesApi — P1-8 证书 API
 *
 * 路由:
 *   - GET  /api/v1/certificates          登录: 我的证书列表
 *   - GET  /api/v1/certificates/:id      公开: 证书详情
 *   - GET  /api/v1/certificates/verify/:serial  公开: 验证 (匿名可访问)
 *
 * 撤销 (POST /certificates/revoke/:id) 不暴露给前端 API, 仅 admin 后台。
 */
import api from './api';
import type { Certificate, VerifyCertificateResult } from '@secondplanet/shared-types';

export const certificatesApi = {
  getMyCertificates: async (type?: string): Promise<Certificate[]> => {
    const params = type && type !== 'all' ? { type } : {};
    const { data } = await api.get<Certificate[]>('/api/v1/certificates', { params });
    return data;
  },
  getCertificate: async (id: string): Promise<Certificate> => {
    const { data } = await api.get<Certificate>(`/api/v1/certificates/${id}`);
    return data;
  },
  // 公开: 验证证书, 不需要登录
  verifyCertificate: async (serial: string): Promise<VerifyCertificateResult> => {
    const { data } = await api.get<VerifyCertificateResult>(
      `/api/v1/certificates/verify/${encodeURIComponent(serial)}`,
    );
    return data;
  },
};
