import { Module } from '@nestjs/common';
import { UrlImportController } from './url-import.controller';
import { UrlImportService } from './url-import.service';
import { AiModule } from '../ai/ai.module';
import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [AiModule, CoursesModule],
  controllers: [UrlImportController],
  providers: [UrlImportService],
  exports: [UrlImportService],
})
export class UrlImportModule {}