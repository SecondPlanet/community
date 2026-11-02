import { Module } from '@nestjs/common';
import { LearningHomeController } from './learning-home.controller';
import { LearningHomeService } from './learning-home.service';

@Module({
  controllers: [LearningHomeController],
  providers: [LearningHomeService],
})
export class LearningHomeModule {}
