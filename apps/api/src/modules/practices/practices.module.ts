import { Module } from '@nestjs/common';
import { PracticesController } from './practices.controller';
import { PracticesService } from './practices.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BadgesModule } from '../badges/badges.module';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [PrismaModule, BadgesModule, CourseAccessPolicyModule],
  controllers: [PracticesController],
  providers: [PracticesService],
  exports: [PracticesService],
})
export class PracticesModule {}
