import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserAiProviderConfigService, UpdateUserAiProviderDto } from './user-ai-provider-config.service';
import { AiModelGatewayService } from '../ai-model-gateway/ai-model-gateway.service';

@ApiTags('ai-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'ai/config', version: '1' })
export class AiUserConfigController {
  constructor(
    private readonly userProviders: UserAiProviderConfigService,
    private readonly gateway: AiModelGatewayService,
  ) {}

  @Get('providers')
  list(@Request() req: { user: { userId: string } }) {
    return this.userProviders.listForUser(req.user.userId);
  }

  @Put('providers')
  upsert(@Request() req: { user: { userId: string } }, @Body() dto: UpdateUserAiProviderDto) {
    return this.userProviders.upsertForUser(req.user.userId, dto);
  }

  @Delete('providers/:provider')
  async remove(@Request() req: { user: { userId: string } }, @Param('provider') provider: string) {
    await this.userProviders.removeForUser(req.user.userId, provider);
    return { ok: true };
  }

  @Post('providers/:provider/verify')
  verify(
    @Request() req: { user: { userId: string } },
    @Param('provider') provider: string,
  ) {
    return this.gateway.verifyUserProvider(req.user.userId, provider);
  }
}
