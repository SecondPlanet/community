import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { ProgressModule } from '../progress/progress.module';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    ProgressModule,
    CourseAccessPolicyModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
