import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3StorageService } from './s3-storage.service';

const config = {
  get: (key: string) =>
    ({
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9010',
      MINIO_BUCKET: 'secondplanet',
      MINIO_ROOT_USER: 'u',
      MINIO_ROOT_PASSWORD: 'p',
    })[key],
} as ConfigService;

describe('S3StorageService', () => {
  it('对象不存在返回 null, 存储故障转为受控 503', async () => {
    const service = new S3StorageService(config);
    service.onModuleInit();

    (service as any).client = {
      send: jest.fn().mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } }),
    };
    await expect(service.headObject('missing')).resolves.toBeNull();

    (service as any).client = {
      send: jest.fn().mockRejectedValue(Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' })),
    };
    await expect(service.headObject('any')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
