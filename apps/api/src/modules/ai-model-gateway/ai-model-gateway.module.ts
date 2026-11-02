import { Global, Module } from '@nestjs/common';
import { UserAiProviderModule } from '../ai/user-ai-provider.module';
import { AiByokQuotaService } from './ai-byok-quota.service';
import { AiModelGatewayService } from './ai-model-gateway.service';
import { AiProviderDeadlineService } from './ai-provider-deadline.service';
import {
  AI_MODEL_TRANSPORT,
  HttpAiModelTransport,
} from './ai-model-transport';

@Global()
@Module({
  imports: [UserAiProviderModule],
  providers: [
    HttpAiModelTransport,
    { provide: AI_MODEL_TRANSPORT, useExisting: HttpAiModelTransport },
    AiModelGatewayService,
    AiProviderDeadlineService,
    AiByokQuotaService,
  ],
  exports: [
    AiModelGatewayService,
    AiProviderDeadlineService,
    AiByokQuotaService,
    AI_MODEL_TRANSPORT,
  ],
})
export class AiModelGatewayModule {}
