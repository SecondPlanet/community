import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

// RolesGuard 是安全边界：fail-closed 语义（缺 @Roles 一律 403）必须被
// 测试钉住——v1.8.0 的 /users/me 403 事故就是注解缺失没有任何测试暴露。
// 新增受保护端点漏写 @Roles 时，端到端测试会先在这里之前挂 CI。
describe('RolesGuard (fail-closed)', () => {
  const makeGuard = (roles: UserRole[] | undefined) => {
    const reflector = { getAllAndOverride: () => roles } as never;
    return new RolesGuard(reflector);
  };
  const ctx = (user?: { role: string }) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('handler 缺 @Roles 元数据时 403，而不是放行', () => {
    expect(() => makeGuard(undefined).canActivate(ctx({ role: 'admin' }))).toThrow(ForbiddenException);
  });

  it('用户角色在 @Roles 列表中时放行', () => {
    expect(makeGuard([UserRole.admin]).canActivate(ctx({ role: 'admin' }))).toBe(true);
  });

  it('用户角色不在列表中时拒绝', () => {
    expect(makeGuard([UserRole.admin]).canActivate(ctx({ role: 'student' }))).toBe(false);
  });
});
