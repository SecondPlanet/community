import { MODULE_METADATA } from '@nestjs/common/constants';
import { AiModelGatewayModule } from '../ai-model-gateway/ai-model-gateway.module';
import { AiJobsWorkerAppModule } from './ai-jobs-worker-app.module';

describe('AiJobsWorkerAppModule', () => {
  it('imports the AI model gateway (BYOK provider transport)', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AiJobsWorkerAppModule,
    ) as unknown[];

    expect(imports).toContain(AiModelGatewayModule);
  });
});
