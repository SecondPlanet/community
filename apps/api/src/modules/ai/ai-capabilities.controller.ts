import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('ai-capabilities')
@Controller({ path: 'ai-personal-courses', version: '1' })
export class AiCapabilitiesController {
  constructor(private readonly config: ConfigService) {}

  @Get('capabilities')
  @ApiOperation({ summary: '读取 AI 自建课程公共能力开关（不含敏感配置）' })
  @ApiResponse({ status: 200, schema: {
    type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } },
  } })
  getCapabilities() {
    return { enabled: this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') === true };
  }
}
