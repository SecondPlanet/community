import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { UserAiProviderModule } from './user-ai-provider.module';
import { AiUserConfigController } from './ai-user-config.controller';
import { AiCapabilitiesController } from './ai-capabilities.controller';
import { AiModelGatewayModule } from '../ai-model-gateway/ai-model-gateway.module';

/**
 * 社区版只保留用户自带 key (BYOK) 的配置入口;
 * UserAiProviderConfigService 已由 UserAiProviderModule 导出(Global), 此处无需重 import.
 */
@Module({
  imports: [UserAiProviderModule, AiModelGatewayModule],
  controllers: [AiController, AiUserConfigController, AiCapabilitiesController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
