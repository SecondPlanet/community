import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCourseDto } from './courses.dto';

describe('CreateCourseDto URL validation', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd'])(
    'rejects an unsafe external URL: %s',
    async (externalUrl) => {
      const dto = plainToInstance(CreateCourseDto, { externalUrl });
      const errors = await validate(dto, { skipMissingProperties: true });

      expect(errors.map((error) => error.property)).toContain('externalUrl');
    },
  );

  it('accepts HTTPS external and source-video URLs', async () => {
    const dto = plainToInstance(CreateCourseDto, {
      externalUrl: 'https://example.com/course',
      sourceVideoUrl: 'https://video.example.com/watch?id=1',
    });

    await expect(validate(dto, { skipMissingProperties: true })).resolves.toHaveLength(0);
  });
});
