import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RagService } from './rag.service';
import { ChatCapabilityService } from './chat-capability.service';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';
// UserAiProviderModule 是 @Global, UserAiProviderConfigService 在此模块内可直接注入,无需 import。

@Module({
  imports: [CourseAccessPolicyModule],
  controllers: [ChatController],
  providers: [ChatService, RagService, ChatCapabilityService],
})
export class ChatModule {}
