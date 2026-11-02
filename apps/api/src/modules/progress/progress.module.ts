import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PointsModule } from '../points/points.module';
import { BadgesModule } from '../badges/badges.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { NotificationModule } from '../notification/notification.module';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [
    PrismaModule,
    PointsModule,
    BadgesModule,
    CertificatesModule,
    NotificationModule,
    CourseAccessPolicyModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
