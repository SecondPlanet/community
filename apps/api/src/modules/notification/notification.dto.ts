import { IsOptional, IsInt, Min, Max, IsBoolean, IsString, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NOTIFICATION_TYPES } from './notification.service';

/**
 * 通知列表查询 DTO。
 *
 * query string 全部走 class-validator + class-transformer:
 *   - page / limit: 转 int,夹紧
 *   - unreadOnly: 'true' / 'false' 转 boolean
 *   - type: 限定 4 类之一,或 'all'
 */
export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @IsString()
  @IsIn([...NOTIFICATION_TYPES, 'all'])
  type?: string;
}
