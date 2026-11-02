import { Module } from '@nestjs/common';
import { HackathonsController } from './hackathons.controller';
import { HackathonsService } from './hackathons.service';
import { NotificationModule } from '../notification/notification.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [NotificationModule, UploadsModule],
  controllers: [HackathonsController],
  providers: [HackathonsService],
  exports: [HackathonsService],
})
export class HackathonsModule {}
