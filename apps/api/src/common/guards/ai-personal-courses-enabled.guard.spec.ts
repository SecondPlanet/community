import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPersonalCoursesEnabledGuard } from './ai-personal-courses-enabled.guard';

describe('AiPersonalCoursesEnabledGuard', () => {
  it('allows requests only when the rollout flag is explicitly enabled', () => {
    const enabled = new AiPersonalCoursesEnabledGuard({ get: jest.fn().mockReturnValue(true) } as unknown as ConfigService);
    expect(enabled.canActivate({} as never)).toBe(true);

    const disabled = new AiPersonalCoursesEnabledGuard({ get: jest.fn().mockReturnValue(false) } as unknown as ConfigService);
    expect(() => disabled.canActivate({} as never)).toThrow(ServiceUnavailableException);
  });
});
