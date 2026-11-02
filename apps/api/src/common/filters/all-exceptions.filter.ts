import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;
    let budgetDetails: { reason: string; retryAfter: number } | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message ?? exception.message;
      const candidate = typeof body === 'object' && body !== null
        ? (body as { code?: unknown }).code
        : undefined;
      // Preserve only deliberately stable public codes, never arbitrary
      // exception fields or provider/database details.
      if (typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(candidate)) {
        code = candidate;
      }
      if (code === 'AI_BUDGET_EXCEEDED' && status === HttpStatus.TOO_MANY_REQUESTS &&
        typeof body === 'object' && body !== null) {
        const details = body as { reason?: unknown; retryAfter?: unknown };
        const allowedReasons = new Set(['USER_DAILY_TOKENS']);
        if (typeof details.reason === 'string' && allowedReasons.has(details.reason) &&
          typeof details.retryAfter === 'number' && Number.isInteger(details.retryAfter) &&
          details.retryAfter >= 0 && details.retryAfter <= 86_400) {
          budgetDetails = { reason: details.reason, retryAfter: details.retryAfter };
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Translate common persistence errors into stable HTTP semantics without
      // exposing table names, constraints, queries, or database internals.
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Resource already exists';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Resource not found';
          break;
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message = 'Resource is still referenced';
          break;
        case 'P2023':
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid identifier';
          break;
        default:
          this.logger.error(exception);
      }
    } else {
      // Security: log the real error server-side but never echo it back.
      // Otherwise stack traces can leak framework versions / file paths.
      this.logger.error(exception);
    }

    res.status(status).json({
      statusCode: status,
      ...(code ? { code } : {}),
      ...(budgetDetails ?? {}),
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
