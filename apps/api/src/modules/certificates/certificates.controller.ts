import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ListCertificatesQuery } from './certificates.dto';

/**
 * CertificatesController — P1-8 我的证书 + 证书页
 *
 * 路由:
 *   GET    /certificates                     (登录)  我的证书列表
 *   GET    /certificates/:id                 (公开)  证书详情
 *   GET    /certificates/verify/:serial      (公开)  公开验证, 匿名可访问
 *   POST   /certificates/revoke/:id          (admin) 撤销
 *
 * 注: 签发(issue)走 service 内部, 不对前端暴露 endpoint。
 *     路径顺序: /verify/:serial 必须放在 :id 之前, 否则会先 match /:id。
 */
@ApiTags('certificates')
@Controller({ path: 'certificates', version: '1' })
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的证书列表(按 issuedAt DESC)' })
  async list(
    @Request() req: { user: { userId: string } },
    @Query() q: ListCertificatesQuery,
  ) {
    return this.certificatesService.findMyCertificates(req.user.userId, q.type);
  }

  // verify 必须放 :id 之前, 路由匹配顺序: 静态段 > 动态段
  @Get('verify/:serial')
  @ApiOperation({ summary: '公开验证(匿名可访问,按 serial number)' })
  async verify(@Param('serial') serial: string) {
    return this.certificatesService.verifyCertificate(serial);
  }

  @Get(':id')
  @ApiOperation({ summary: '证书详情(公开可访问)' })
  async findOne(@Param('id') id: string) {
    return this.certificatesService.findCertificateById(id);
  }

  @Post('revoke/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: '管理员撤销证书' })
  async revoke(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.certificatesService.revokeCertificate(id, req.user.userId);
  }
}
