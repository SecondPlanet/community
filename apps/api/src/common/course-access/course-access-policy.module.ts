import { Module } from '@nestjs/common';
import { CourseAccessPolicyService } from './course-access-policy.service';

@Module({
  providers: [CourseAccessPolicyService],
  exports: [CourseAccessPolicyService],
})
export class CourseAccessPolicyModule {}
