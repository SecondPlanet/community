import { Global, Module } from '@nestjs/common';
import { UserAiProviderConfigService } from './user-ai-provider-config.service';
import { AiKeyCrypto } from './ai-crypto.util';

/**
 * 独立 UserAiProviderModule，不依赖具体上游实现，避免配置存储与调用客户端循环依赖。
 */
@Global()
@Module({
  providers: [UserAiProviderConfigService, AiKeyCrypto],
  exports: [UserAiProviderConfigService, AiKeyCrypto],
})
export class UserAiProviderModule {}
