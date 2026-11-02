import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAuthProviderDto, CreateQuickPromptDto, UpdateAuthProviderDto } from './cms-admin.dto';

describe('CreateQuickPromptDto', () => {
  it('accepts the QuickPrompt database fields used by the admin UI', async () => {
    const dto = plainToInstance(CreateQuickPromptDto, {
      emoji: '💡',
      label: '解释课程',
      promptText: '请解释本节课的核心概念',
      scope: 'lesson',
      isActive: true,
      orderIndex: 2,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects the obsolete prompt/key payload shape', async () => {
    const dto = plainToInstance(CreateQuickPromptDto, {
      key: 'explain',
      label: '解释课程',
      prompt: '旧字段',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'promptText')).toBe(true);
  });
});

describe('AuthProvider DTO', () => {
  it('accepts the database fields submitted by the admin editor', async () => {
    const create = plainToInstance(CreateAuthProviderDto, {
      id: 'oauth.google',
      label: 'Google',
      icon: 'Chrome',
      config: { scopes: ['openid'] },
      isActive: true,
      orderIndex: 1,
    });
    const update = plainToInstance(UpdateAuthProviderDto, {
      label: 'Google Workspace',
      icon: 'Chrome',
      isActive: false,
      orderIndex: 2,
    });

    await expect(validate(create)).resolves.toHaveLength(0);
    await expect(validate(update)).resolves.toHaveLength(0);
  });
});
