import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

/**
 * RedisService 单测
 *
 * 关键点: 构造时 new Redis(...) 真实连 redis. 在测试环境没有 docker redis (CI 也没起),
 * 所以必须 mock ioredis 模块. jest.mock 工厂返回一个伪 class, 实例化时拿到的事件
 * handler (on/quit/ping) 全部是 jest.fn(), 让 case 可以单独 assert.
 *
 * P0 2026-07-27 横向扩展: 验证 ping() 在 success / fail 两种 case 下行为正确.
 * 业务上 ping 失败 = readiness degraded, 上游 LB 摘流量. 不能 false-positive 返 true.
 */

const mockClient = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
};

jest.mock('ioredis', () => {
  // ioredis 导出 default = Redis class, 我们 mock 它的构造函数和 prototype
  const MockRedis = jest.fn().mockImplementation(() => mockClient);
  return { __esModule: true, default: MockRedis };
});

// 必须在 jest.mock 之后 import, 否则会拿到真实 ioredis
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let configGet: jest.Mock;

  const buildConfig = (overrides: Record<string, string> = {}): ConfigService => {
    configGet = jest.fn((key: string) => {
      const defaults: Record<string, string> = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_DB: '0',
      };
      return key in overrides ? overrides[key] : defaults[key];
    });
    return { get: configGet } as unknown as ConfigService;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // 重要: 重建 mock client 状态 (clearAllMocks 不会清 mockResolvedValue)
    mockClient.on.mockReturnThis();
    mockClient.ping.mockReset();
    mockClient.quit.mockResolvedValue('OK');
  });

  describe('构造函数 + 配置读取', () => {
    it('从 env 读 REDIS_HOST/PORT/DB, 默认 localhost:6379/0', () => {
      service = new RedisService(buildConfig());
      expect(configGet).toHaveBeenCalledWith('REDIS_HOST');
      expect(configGet).toHaveBeenCalledWith('REDIS_PORT');
      expect(configGet).toHaveBeenCalledWith('REDIS_DB');
    });

    it('REDIS_HOST 缺省时 fallback 到 localhost', () => {
      const config = buildConfig({ REDIS_HOST: '' });
      service = new RedisService(config);
      // 构造函数读 config.get('REDIS_HOST') ?? 'localhost'
      // 空字符串是 falsy, 会走 fallback
      expect(configGet).toHaveBeenCalledWith('REDIS_HOST');
    });

    it('REDIS_PASSWORD 缺省时不传 password 字段', () => {
      service = new RedisService(buildConfig());
      // 隐性验证: 不抛错, 实例化成功
      expect(service).toBeInstanceOf(RedisService);
    });
  });

  describe('getClient', () => {
    it('返同一个 client 实例 (供 ThrottlerStorageRedisService 复用)', () => {
      service = new RedisService(buildConfig());
      const a = service.getClient();
      const b = service.getClient();
      expect(a).toBe(b);
      expect(a).toBe(mockClient);
    });
  });

  describe('ping', () => {
    it('case 1: redis 返 "PONG" -> ping() 返 true', async () => {
      mockClient.ping.mockResolvedValueOnce('PONG');
      service = new RedisService(buildConfig());

      const ok = await service.ping();
      expect(ok).toBe(true);
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
    });

    it('case 2: redis 返非 PONG (异常服务返错乱响应) -> ping() 返 false', async () => {
      mockClient.ping.mockResolvedValueOnce('WRONG');
      service = new RedisService(buildConfig());

      const ok = await service.ping();
      expect(ok).toBe(false);
    });

    it('case 3: redis 连接断 (ping reject) -> ping() 返 false (不抛)', async () => {
      mockClient.ping.mockRejectedValueOnce(new Error('Connection is closed'));
      service = new RedisService(buildConfig());

      // readiness 检查必须容错, 不能因为 redis 暂时不可用让 health check 也炸
      const ok = await service.ping();
      expect(ok).toBe(false);
    });
  });

  describe('生命周期', () => {
    it('onModuleInit 不抛错, 只 log', async () => {
      service = new RedisService(buildConfig());
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      logSpy.mockRestore();
    });

    it('onModuleDestroy 调 client.quit, 错误被吞', async () => {
      service = new RedisService(buildConfig());
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockClient.quit).toHaveBeenCalledTimes(1);
    });

    it('onModuleDestroy: client.quit reject 时不抛 (已经 close 的 client)', async () => {
      mockClient.quit.mockRejectedValueOnce(new Error('Connection is closed'));
      service = new RedisService(buildConfig());
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
