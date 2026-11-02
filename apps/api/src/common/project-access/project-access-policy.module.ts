import { Module } from '@nestjs/common';
import { ProjectAccessPolicyService } from './project-access-policy.service';

@Module({
  providers: [ProjectAccessPolicyService],
  exports: [ProjectAccessPolicyService],
})
export class ProjectAccessPolicyModule {}
