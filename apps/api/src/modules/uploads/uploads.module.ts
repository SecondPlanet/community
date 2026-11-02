/**
 * uploads.module.ts — 注册 uploads 全套
 */
import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { S3StorageService } from './storage/s3-storage.service';
import { StorageProvider } from './storage/storage.interface';

@Module({
  imports: [],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    S3StorageService,
    // StorageProvider abstract class 当 DI token, 绑到 S3StorageService (provider 模式)
    { provide: StorageProvider, useExisting: S3StorageService },
  ],
  exports: [UploadsService, S3StorageService, StorageProvider],
})
export class UploadsModule {}
