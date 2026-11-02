import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminListReviewsQueryDto } from './reviews.dto';

describe('AdminListReviewsQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('transforms only true values (%p)', async (input, expected) => {
    const dto = plainToInstance(AdminListReviewsQueryDto, {
      onlyDeleted: input,
    });

    expect(dto.onlyDeleted).toBe(expected);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid pagination and rating instead of forwarding NaN', async () => {
    const dto = plainToInstance(AdminListReviewsQueryDto, {
      page: 'oops',
      limit: '1000',
      rating: '9',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'limit',
      'page',
      'rating',
    ]);
  });
});
