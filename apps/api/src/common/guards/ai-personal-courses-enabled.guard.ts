import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiPersonalCoursesEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') !== true) {
      throw new ServiceUnavailableException('AI_PERSONAL_COURSES_DISABLED');
    }
    return true;
  }
}
