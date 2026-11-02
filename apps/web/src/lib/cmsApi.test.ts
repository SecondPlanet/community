import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { getI18nMessages, getPageSettings } from './cmsApi';

vi.mock('./api', () => ({
  default: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

describe('cmsApi response normalization', () => {
  beforeEach(() => mockedGet.mockReset());

  it('unwraps the page-keyed response returned by the Nest CMS API', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        home: {
          'hero.eyebrow': { 'zh-CN': '真实数据库文案' },
        },
      },
    });

    await expect(getPageSettings('home')).resolves.toEqual({
      'hero.eyebrow': { 'zh-CN': '真实数据库文案' },
    });
  });

  it('normalizes i18n database rows into a key-value map', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        { key: 'common.confirm', locale: 'zh-CN', value: '确认', category: 'common' },
        { key: 'common.cancel', locale: 'zh-CN', value: '取消', category: 'common' },
      ],
    });

    await expect(getI18nMessages('zh-CN')).resolves.toEqual({
      'common.confirm': '确认',
      'common.cancel': '取消',
    });
  });
});
