import { SiteService } from './site.service';
import { PUBLIC_COURSE_WHERE } from '../../common/course-access/course-access-policy.service';

describe('SiteService public statistics', () => {
  it('counts only completed, non-deleted practice work from public courses', async () => {
    const prisma = {
      user: { count: jest.fn().mockResolvedValue(0) },
      course: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      practiceCompletion: { count: jest.fn().mockResolvedValue(7) },
      nanoDegree: { count: jest.fn().mockResolvedValue(0) },
      hackathon: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new SiteService(prisma as never);

    await expect(service.getStats()).resolves.toMatchObject({ totalProjects: 7 });
    expect(prisma.practiceCompletion.count).toHaveBeenCalledWith({
      where: {
        status: 'completed',
        deletedAt: null,
        project: { course: PUBLIC_COURSE_WHERE },
      },
    });
  });
});
