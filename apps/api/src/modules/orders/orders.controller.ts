import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateOrderDto, MockPayDto, RefundOrderDto } from './orders.dto';
import { UserRole } from '@prisma/client';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '我的订单' })
  async myOrders(@Request() req: { user: { userId: string } }) {
    return this.ordersService.findMyOrders(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '单订单详情' })
  async findOne(
    @Request() req: { user: { userId: string; role?: UserRole } },
    @Param('id') id: string,
  ) {
    return this.ordersService.findOrderById(req.user.userId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建订单（免费商品会直接注册）' })
  async create(
    @Request() req: { user: { userId: string; role?: UserRole } },
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(req.user.userId, dto, req.user.role);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: '开发环境模拟支付（生产环境关闭）' })
  async pay(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: MockPayDto,
  ) {
    this.assertDevelopmentPaymentOperation();
    return this.ordersService.mockPay(req.user.userId, id, dto.paymentMethod);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消未支付订单' })
  async cancel(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.ordersService.cancel(req.user.userId, id);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: '开发环境模拟退款（生产环境关闭）' })
  async refund(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() _dto: RefundOrderDto,
  ) {
    this.assertDevelopmentPaymentOperation();
    return this.ordersService.refundOrder(req.user.userId, id);
  }

  private assertDevelopmentPaymentOperation() {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const explicitlyEnabled =
      this.config.get<string>('ENABLE_MOCK_PAYMENTS') === 'true';
    if (isProduction || !explicitlyEnabled) {
      throw new ServiceUnavailableException('支付通道尚未开放，请联系平台管理员');
    }
  }
}
