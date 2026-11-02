import { Global, Module } from '@nestjs/common';
import { AiModelGatewayModule } from '../../modules/ai-model-gateway/ai-model-gateway.module';
import { AiProviderService } from './ai-provider.service';

@Global()
@Module({
  imports: [AiModelGatewayModule],
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiProviderModule {}
