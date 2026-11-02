import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface ProjectPrincipal {
  userId?: string;
  role?: UserRole;
}

export interface ProjectAccessSubject {
  id: string;
  userId: string;
}

@Injectable()
export class ProjectAccessPolicyService {
  assertCanAccess(
    project: ProjectAccessSubject,
    principal?: ProjectPrincipal,
  ): void {
    if (
      principal?.role !== UserRole.admin &&
      (!principal?.userId || principal.userId !== project.userId)
    ) {
      // Private resources deliberately collapse forbidden and missing into 404.
      throw new NotFoundException('Learning project not found');
    }
  }
}
