import { Module } from '@nestjs/common';
import { InstructorsService } from './instructors.service';
import {
  InstructorsPublicController,
  InstructorsAdminController,
  CourseInstructorsAdminController,
} from './instructors.controller';
import {
  ExpertisesPublicController,
  ExpertisesAdminController,
} from './expertises.controller';

@Module({
  controllers: [
    // 前台 — ExpertisesPublicController 必须先于 InstructorsPublicController 注册,
    // 否则 GET /instructors/expertises 会被 :slug 截胡, 走到 findBySlug('expertises')
    // 返 404 "Instructor not found" (前端 chip 筛选场景踩过)
    ExpertisesPublicController,
    InstructorsPublicController,
    // Admin
    ExpertisesAdminController,
    InstructorsAdminController,
    CourseInstructorsAdminController,
  ],
  providers: [InstructorsService],
  exports: [InstructorsService],
})
export class InstructorsModule {}
