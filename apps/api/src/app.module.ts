import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { AdminController } from './modules/admin/admin.controller';
import { CmsAdminController } from './modules/cms/cms-admin.controller';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { DegreesModule } from './modules/degrees/degrees.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { PracticesModule } from './modules/practices/practices.module';
import { PointsModule } from './modules/points/points.module';
import { BadgesModule } from './modules/badges/badges.module';
import { ProgressModule } from './modules/progress/progress.module';
import { HackathonsModule } from './modules/hackathons/hackathons.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AiModule } from './modules/ai/ai.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { NotificationModule } from './modules/notification/notification.module';
import { UrlImportModule } from './modules/url-import/url-import.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { LearningEventsModule } from './modules/learning-events/learning-events.module';
import { SiteModule } from './modules/site/site.module';
import { CmsModule } from './modules/cms/cms.module';
import { ChatModule } from './modules/chat/chat.module';
import { InstructorsModule } from './modules/instructors/instructors.module';
import { HealthModule } from './modules/health/health.module';
import { NotesModule } from './modules/notes/notes.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { AiProviderModule } from './common/ai-provider/ai-provider.module';
import { validateAiPersonalCourseEnv } from './config/ai-personal-courses.config';
import { AiJobsModule } from './modules/ai-jobs/ai-jobs.module';
import { LearningProjectsModule } from './modules/learning-projects/learning-projects.module';
import { ContentSafetyModule } from './common/content-safety/content-safety.module';
import { PersonalLearningModule } from './modules/personal-learning/personal-learning.module';
import { ProjectTutorModule } from './modules/project-tutor/project-tutor.module';
import { LearningHomeModule } from './modules/learning-home/learning-home.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateAiPersonalCourseEnv,
    }),
    RedisModule,
    ContentSafetyModule,
    // Global read/navigation budget must accommodate an SPA's parallel queries
    // and users sharing one corporate/NAT address. Sensitive write endpoints
    // (login, password reset, reviews, AI, imports, uploads) define tighter
    // controller-level limits below this broad transport safety net.
    // P0 v1.5.4 横向扩展: 改用 Redis storage 共享计数 (key 走 THROTTLER_REDIS_PREFIX
    // 命名空间, 多实例部署下不会重复计数). 复用在 RedisModule 里创建的同一个 ioredis 连接,
    // 不再额外开连接.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000,
            limit: Number(process.env.THROTTLE_SHORT) || 30,
          },
          {
            name: 'medium',
            ttl: 60000,
            limit: Number(process.env.THROTTLE_MEDIUM) || 600,
          },
        ],
        storage: new ThrottlerStorageRedisService(redis.getClient()),
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    DegreesModule,
    EnrollmentsModule,
    PracticesModule,
    PointsModule,
    BadgesModule,
    ProgressModule,
    HackathonsModule,
    OrdersModule,
    AiModule,
    // 2026-07-24 P0: 视频 / 图片 / 资源 上传管道 (presigned URL)
    UploadsModule,
    NotificationModule,
    UrlImportModule,
    CertificatesModule,
    AdminModule,
    ReviewsModule,
    LearningEventsModule,
    SiteModule,
    CmsModule,
    InstructorsModule,
    AiProviderModule,
    ChatModule,
    HealthModule,
    NotesModule,
    AiJobsModule,
    LearningProjectsModule,
    PersonalLearningModule,
    ProjectTutorModule,
    LearningHomeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * P0 2026-07-23 CSRF 防御第二层: admin 写操作的 mutating 请求 (POST/PATCH/
   * PUT/DELETE) 强制 Origin / Referer 头检查, 跟 CORS_ORIGIN 白名单对比,
   * 跨站直接 403。配合 cookie sameSite=strict (生产) 双层防御。
   *
   * 范围: /api/v1/admin/* + /api/v1/admin/cms/* (cms-admin 用同一前缀)。
   *       其他公开端点不强加, 因为公开端点本来就不要鉴权, CSRF 没什么意义。
   */
  configure(consumer: MiddlewareConsumer) {
    // 用 controller class 而非 path 字符串 — path-to-regexp v8 + NestJS
    // globalPrefix + URI versioning 一起处理, string path 容易踩坑。
    // (P0 2026-07-23 修复: 之前用 'api/v1/admin/{*path}' 字符串 path 不生效)
    consumer
      .apply(OriginCheckMiddleware)
      .forRoutes(
        AdminController,
        CmsAdminController,
      );
  }
}
