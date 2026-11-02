import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProjectAccessPolicyService } from './project-access-policy.service';

describe('ProjectAccessPolicyService', () => {
  const service = new ProjectAccessPolicyService();
  const project = { id: 'project-1', userId: 'owner-1' };

  it('allows the owner and an admin', () => {
    expect(() => service.assertCanAccess(project, { userId: 'owner-1' })).not.toThrow();
    expect(() => service.assertCanAccess(project, {
      userId: 'admin-1',
      role: UserRole.admin,
    })).not.toThrow();
  });

  it('collapses unrelated and anonymous access into not found', () => {
    expect(() => service.assertCanAccess(project, { userId: 'other-1' }))
      .toThrow(NotFoundException);
    expect(() => service.assertCanAccess(project)).toThrow(NotFoundException);
  });
});
