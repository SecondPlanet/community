import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderType, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({ enum: OrderType, description: '订单类型（course / degree）' })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiPropertyOptional({ description: '课程 UUID（type=course 时必填）' })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ description: '学位 UUID（type=degree 时必填）' })
  @IsOptional()
  @IsString()
  degreeId?: string;

  @ApiPropertyOptional({ description: '支付方式（wechat / alipay / stripe）' })
  @IsOptional()
  @IsEnum(PrismaPaymentMethod, { message: 'paymentMethod 必须是 wechat / alipay / stripe' })
  paymentMethod?: PrismaPaymentMethod;
}

export class MockPayDto {
  @ApiPropertyOptional({ description: '支付方式（wechat / alipay / stripe）' })
  @IsOptional()
  @IsEnum(PrismaPaymentMethod, { message: 'paymentMethod 必须是 wechat / alipay / stripe' })
  paymentMethod?: PrismaPaymentMethod;
}

export class RefundOrderDto {
  // mock: 当前无字段, 占位方便后续扩展 reason
  @ApiPropertyOptional({ description: '退款原因（mock 模式不持久化）' })
  @IsOptional()
  @IsString()
  reason?: string;
}
