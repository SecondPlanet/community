import api from './api';

export type AiProvider = 'gemini' | 'openai' | 'claude' | 'minimax' | 'openai-compatible' | 'ollama';
export interface UserAiProviderConfig {
  id: string;
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  isActive: boolean;
  verifiedAt: string | null;
  lastVerifyError: string | null;
  apiKeyMasked: string;
}

export const aiProviderApi = {
  async list() {
    const { data } = await api.get<UserAiProviderConfig[]>('/api/v1/ai/config/providers');
    return data;
  },
  async save(payload: { provider: AiProvider; apiKey?: string; model: string; baseUrl?: string; isActive: boolean }) {
    const { data } = await api.put<UserAiProviderConfig>('/api/v1/ai/config/providers', payload);
    return data;
  },
  async verify(provider: AiProvider) {
    const { data } = await api.post<{ ok: boolean; sample?: string; error?: string }>(
      `/api/v1/ai/config/providers/${encodeURIComponent(provider)}/verify`,
    );
    return data;
  },
  async remove(provider: AiProvider) {
    await api.delete(`/api/v1/ai/config/providers/${provider}`);
  },
};
