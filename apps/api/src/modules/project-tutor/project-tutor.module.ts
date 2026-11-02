import { Module } from '@nestjs/common';
import { AiPersonalCoursesEnabledGuard } from '../../common/guards/ai-personal-courses-enabled.guard';
import { ProjectAccessPolicyModule } from '../../common/project-access/project-access-policy.module';
import { ContentSafetyModule } from '../../common/content-safety/content-safety.module';
import { ProjectTutorController } from './project-tutor.controller';
import { ProjectTutorService } from './project-tutor.service';

@Module({
  imports: [ProjectAccessPolicyModule, ContentSafetyModule],
  controllers: [ProjectTutorController],
  providers: [ProjectTutorService, AiPersonalCoursesEnabledGuard],
})
export class ProjectTutorModule {}
