import { Module } from '@nestjs/common';
import { AiPersonalCoursesEnabledGuard } from '../../common/guards/ai-personal-courses-enabled.guard';
import { ProjectAccessPolicyModule } from '../../common/project-access/project-access-policy.module';
import { PersonalLearningController } from './personal-learning.controller';
import { PersonalLearningService } from './personal-learning.service';

@Module({
  imports: [ProjectAccessPolicyModule],
  controllers: [PersonalLearningController],
  providers: [PersonalLearningService, AiPersonalCoursesEnabledGuard],
  exports: [PersonalLearningService],
})
export class PersonalLearningModule {}
