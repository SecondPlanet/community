import { validate } from 'class-validator';
import { SafeUrl } from './safe-url.decorator';

class OptionalSample {
  @SafeUrl({ optional: true })
  url?: string;
}

describe('SafeUrl', () => {
  it('可选字段空值(未提供/空串)不报错', async () => {
    expect(await validate(new OptionalSample())).toHaveLength(0);

    const empty = new OptionalSample();
    empty.url = '';
    expect(await validate(empty)).toHaveLength(0);
  });

  it('可选字段传非法 URL 仍报错', async () => {
    const sample = new OptionalSample();
    sample.url = 'javascript:alert(1)';
    const errors = await validate(sample);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('错误信息插值字段名, 不泄漏 {property} 占位符', async () => {
    const sample = new OptionalSample();
    sample.url = 'not-a-url';
    const errors = await validate(sample);
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join(' ')).toContain('url 必须是合法的');
    expect(messages.join(' ')).not.toContain('{property}');
  });

  it('必填字段缺省仍报错(只放开空串语义, 不误伤必填)', async () => {
    class RequiredSample {
      @SafeUrl()
      url: string = '';
    }
    const errors = await validate(new RequiredSample());
    expect(errors.length).toBeGreaterThan(0);
  });
});
