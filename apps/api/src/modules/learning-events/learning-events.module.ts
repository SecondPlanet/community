import { Module } from '@nestjs/common';
import { LearningEventsController } from './learning-events.controller';
import { LearningEventsService } from './learning-events.service';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [CourseAccessPolicyModule],
  controllers: [LearningEventsController],
  providers: [LearningEventsService],
  exports: [LearningEventsService],
})
export class LearningEventsModule {}
