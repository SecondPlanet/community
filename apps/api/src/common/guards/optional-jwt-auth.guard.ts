import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { lastValueFrom, Observable } from 'rxjs';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader) {
      return true;
    }

    try {
      const result = super.canActivate(context);
      if (result instanceof Observable) {
        await lastValueFrom(result);
      } else {
        await result;
      }
    } catch {
      // Invalid token should not block public endpoints.
    }

    return true;
  }

  handleRequest(_err: any, user: any) {
    return user || undefined;
  }
}
