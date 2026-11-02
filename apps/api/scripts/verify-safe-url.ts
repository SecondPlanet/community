/**
 * verify-safe-url.ts — 端到端验证 P0 scheme 校验
 *
 * 模拟 runtime ValidationPipe: instantiate DTO + class-validator validate
 * 攻击载荷 (javascript:/data:/file:) 应被拒
 */
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCourseDto } from '../src/modules/courses/courses.dto';

const attackPayloads = {
  videoUrl: 'javascript:alert(1)',
  resourceUrl: 'data:text/html,<script>alert(1)</script>',
};

const legalPayload: any = {
  title: 'Test',
  description: 'desc',
  learningPoints: 'lp',
  instructor: 'inst',
  level: 'Beginner',
  duration: '1h',
  thumbnail: 'https://example.com/x.png',
  tags: '[]',
  costType: 'free',
  price: 0,
  status: 'draft',
  courseType: 'own',
  industryId: '123e4567-e89b-12d3-a456-426614174000',
  categoryId: '123e4567-e89b-12d3-a456-426614174001',
  chapters: [
    {
      title: 'ch1',
      orderIndex: 0,
      lessons: [
        {
          title: 'l1',
          orderIndex: 0,
          videoUrl: attackPayloads.videoUrl,
          resources: [
            { title: 'r1', url: attackPayloads.resourceUrl, type: 'pdf' as any },
          ],
        },
      ],
    },
  ],
};

function findErrorsByValue(errors: any[], badValue: string): any[] {
  const found: any[] = [];
  function walk(errs: any[]) {
    for (const e of errs) {
      if (e.value === badValue) found.push(e);
      if (e.children?.length) walk(e.children);
    }
  }
  walk(errors);
  return found;
}

const dto = plainToInstance(CreateCourseDto, legalPayload);
const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });

const videoUrlErrors = findErrorsByValue(errors, attackPayloads.videoUrl);
const resourceUrlErrors = findErrorsByValue(errors, attackPayloads.resourceUrl);

console.log('=== P0 scheme 校验端到端验证 ===');
console.log('Total errors:', errors.length);
console.log('videoUrl attack rejected:', videoUrlErrors.length > 0, '(matched', videoUrlErrors.length, 'errors)');
console.log('resourceUrl attack rejected:', resourceUrlErrors.length > 0, '(matched', resourceUrlErrors.length, 'errors)');

if (errors.length > 0) {
  console.log('\n--- All errors ---');
  console.log(JSON.stringify(errors.map((e) => ({
    property: e.property,
    value: typeof e.value === 'string' ? e.value.slice(0, 40) : '...',
    constraints: e.constraints,
  })), null, 2));
}

if (!videoUrlErrors.length || !resourceUrlErrors.length) {
  console.error('\n❌ FAILED — attack payloads were not rejected');
  process.exit(1);
}

console.log('\n✅ PASSED — both videoUrl and resourceUrl attacks rejected');
