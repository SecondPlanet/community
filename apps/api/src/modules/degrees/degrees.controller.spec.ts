import { CourseStatus, UserRole } from '@prisma/client';
import { DegreesController } from './degrees.controller';
import { DegreesService } from './degrees.service';

describe('DegreesController visibility', () => {
  const service = {
    findAll: jest.fn(),
  } as unknown as DegreesService;
  const controller = new DegreesController(service);

  beforeEach(() => jest.clearAllMocks());

  it('forces anonymous listings to published degrees', async () => {
    await controller.findAll(undefined, undefined, {});
    expect(service.findAll).toHaveBeenCalledWith({
      status: CourseStatus.published,
      search: undefined,
      includePrivateCourses: false,
    });
  });

  it('does not let anonymous callers request draft degrees', async () => {
    await controller.findAll(CourseStatus.draft, 'AI', {});
    expect(service.findAll).toHaveBeenCalledWith({
      status: CourseStatus.published,
      search: 'AI',
      includePrivateCourses: false,
    });
  });

  it('allows administrators to choose the listing status', async () => {
    await controller.findAll(CourseStatus.draft, undefined, {
      user: { role: UserRole.admin },
    });
    expect(service.findAll).toHaveBeenCalledWith({
      status: CourseStatus.draft,
      search: undefined,
      includePrivateCourses: true,
    });
  });
});
