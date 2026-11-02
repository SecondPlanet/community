/**
 * reviews.module.ts — P1-3 评价模块
 *
 * 依赖:
 *   - PrismaModule(全局,不用 import)
 *   - AuditModule(全局,不用 import)
 *   - 不依赖其他业务模块
 *
 * 不导 service 给其他模块用(评分分布由 CoursesService 调 service 方法):
 *   - 避免循环依赖
 *   - 调用方在 controllers.module 里把 ReviewsService 注册到 CoursesService 的 constructor
 *
 * 实际做法:CoursesModule 通过 forwardRef + 显式 import ReviewsModule 来解决
 *         否则 PrismaModule 是全局的,直接拿 ReviewsService 用也可以(更轻量)
 *         这里我们 export service 让 CoursesModule 通过 token import
 */
import { Module } from '@nestjs/common';
import { CoursesReviewsController, ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [CourseAccessPolicyModule],
  controllers: [CoursesReviewsController, ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
