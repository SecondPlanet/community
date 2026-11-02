import {
  CoursesReviewsController,
  ReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('reviews controllers', () => {
  const service = {
    create: jest.fn(),
    markHelpful: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the JWT strategy userId to review creation', async () => {
    const controller = new CoursesReviewsController(
      service as unknown as ReviewsService,
    );
    const dto = { rating: 5, content: '非常有帮助的一门课程' };

    await controller.create(
      'course-1',
      { user: { userId: 'user-1' } },
      dto,
    );

    expect(service.create).toHaveBeenCalledWith('user-1', 'course-1', dto, undefined);
  });

  it('passes the JWT strategy userId to helpful voting', async () => {
    const controller = new ReviewsController(
      service as unknown as ReviewsService,
    );

    await controller.helpful('review-1', {
      user: { userId: 'user-1' },
    });

    expect(service.markHelpful).toHaveBeenCalledWith('user-1', 'review-1', undefined);
  });

  it('forwards a validated admin query without reparsing strings', async () => {
    const controller = new ReviewsController(
      service as unknown as ReviewsService,
    );

    await controller.findAll({
      page: 2,
      limit: 25,
      rating: 4,
      onlyDeleted: false,
    });

    expect(service.findAll).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      courseId: undefined,
      rating: 4,
      onlyDeleted: false,
    });
  });
});
