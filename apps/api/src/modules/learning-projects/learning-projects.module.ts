import { Module } from '@nestjs/common';
import { AiPersonalCoursesEnabledGuard } from '../../common/guards/ai-personal-courses-enabled.guard';
import { ProjectAccessPolicyModule } from '../../common/project-access/project-access-policy.module';
import { ContentSafetyModule } from '../../common/content-safety/content-safety.module';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { LearningProjectsController } from './learning-projects.controller';
import { LearningProjectsService } from './learning-projects.service';

@Module({
  imports: [ProjectAccessPolicyModule, ContentSafetyModule, AiJobsModule],
  controllers: [LearningProjectsController],
  providers: [LearningProjectsService, AiPersonalCoursesEnabledGuard],
  exports: [LearningProjectsService],
})
export class LearningProjectsModule {}
