import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './api';
import { aiApi } from './aiApi';

vi.mock('./api', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('aiApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateCourse', () => {
    it('should POST to /ai/generate-course and return draft', async () => {
      const mockDraft = {
        title: 'RAG 系统实战',
        description: '企业级 RAG',
        learningPoints: '理解 RAG',
        instructor: 'SecondPlanet',
        level: 'Intermediate' as const,
        duration: '2 小时',
        tags: 'RAG,LLM',
        thumbnail: 'https://example.com',
        costType: 'paid' as const,
        price: 199,
        courseType: 'own' as const,
        externalUrl: '',
      };
      (api.post as any).mockResolvedValue({ data: { draft: mockDraft } });

      const result = await aiApi.generateCourse('RAG 系统实战');

      expect(api.post).toHaveBeenCalledWith('/api/v1/ai/generate-course', {
        topic: 'RAG 系统实战',
        hint: undefined,
      });
      expect(result).toEqual(mockDraft);
    });

    it('should return external courseType and externalUrl from external draft', async () => {
      const mockDraft = {
        title: 'OpenAI Cookbook 精读',
        description: '外部参考课',
        learningPoints: '看 cookbook',
        instructor: 'SecondPlanet',
        level: 'Beginner' as const,
        duration: '45 分钟',
        tags: 'OpenAI,Cookbook',
        thumbnail: 'https://example.com',
        costType: 'free' as const,
        price: 0,
        courseType: 'external' as const,
        externalUrl: 'https://cookbook.openai.com',
      };
      (api.post as any).mockResolvedValue({ data: { draft: mockDraft } });

      const result = await aiApi.generateCourse('OpenAI Cookbook 外部课', 'https://cookbook.openai.com');

      expect(result.courseType).toBe('external');
      expect(result.externalUrl).toBe('https://cookbook.openai.com');
    });

    it('should pass hint when provided', async () => {
      (api.post as any).mockResolvedValue({ data: { draft: {} } });

      await aiApi.generateCourse('topic', 'extra hint');

      expect(api.post).toHaveBeenCalledWith('/api/v1/ai/generate-course', {
        topic: 'topic',
        hint: 'extra hint',
      });
    });
  });

  describe('generateDegree', () => {
    it('should POST to /ai/generate-degree and return draft', async () => {
      const mockDraft = {
        title: 'AI 全栈工程师',
        description: '从零到精通',
        learningPoints: '完整知识',
        icon: 'sparkles',
        costType: 'paid' as const,
        price: 1999,
        thumbnail: 'https://example.com',
        tags: 'AI',
      };
      (api.post as any).mockResolvedValue({ data: { draft: mockDraft } });

      const result = await aiApi.generateDegree('AI 全栈工程师');

      expect(api.post).toHaveBeenCalledWith('/api/v1/ai/generate-degree', {
        topic: 'AI 全栈工程师',
        hint: undefined,
      });
      expect(result).toEqual(mockDraft);
    });
  });
});