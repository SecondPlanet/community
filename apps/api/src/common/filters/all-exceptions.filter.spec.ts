import {
  ArgumentsHost,
  ConflictException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

@Controller('budget-contract')
class BudgetContractController {
  @Get()
  fail() {
    throw new HttpException({
      code: 'AI_BUDGET_EXCEEDED',
      message: 'AI_BUDGET_EXCEEDED',
      reason: 'USER_DAILY_TOKENS',
      retryAfter: 321,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

describe('AllExceptionsFilter', () => {
  const status = jest.fn();
  const json = jest.fn();
  const response = { status, json };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
    status.mockReturnValue(response);
  });

  it.each([
    ['P2002', HttpStatus.CONFLICT, 'Resource already exists'],
    ['P2025', HttpStatus.NOT_FOUND, 'Resource not found'],
    ['P2003', HttpStatus.CONFLICT, 'Resource is still referenced'],
    ['P2023', HttpStatus.BAD_REQUEST, 'Invalid identifier'],
  ])('maps Prisma %s without leaking database details', (code, expectedStatus, message) => {
    const error = new Prisma.PrismaClientKnownRequestError('sensitive database detail', {
      code,
      clientVersion: 'test',
    });

    new AllExceptionsFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expectedStatus, message }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('sensitive database detail');
  });

  it('preserves an allowlisted stable public error code from an HttpException', () => {
    new AllExceptionsFilter().catch(new ConflictException({
      code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was reused',
    }), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was reused',
    }));
  });

  it('preserves only the typed budget reason and retryAfter contract', () => {
    new AllExceptionsFilter().catch(
      new HttpException({
        code: 'AI_BUDGET_EXCEEDED',
        message: 'AI_BUDGET_EXCEEDED',
        reason: 'USER_DAILY_TOKENS',
        retryAfter: 321,
      }, HttpStatus.TOO_MANY_REQUESTS), host,
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 429,
      code: 'AI_BUDGET_EXCEEDED',
      reason: 'USER_DAILY_TOKENS',
      retryAfter: 321,
    }));
  });

  it('serves the typed budget contract through the real HTTP adapter', async () => {
    const module = await Test.createTestingModule({ controllers: [BudgetContractController] }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    try {
      const result = await fetch(`${await app.getUrl()}/budget-contract`);
      expect(result.status).toBe(429);
      await expect(result.json()).resolves.toMatchObject({
        statusCode: 429,
        code: 'AI_BUDGET_EXCEEDED',
        reason: 'USER_DAILY_TOKENS',
        retryAfter: 321,
      });
    } finally {
      await app.close();
    }
  });
});
