import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { ChaptersController } from './chapters.controller';
import { LessonsController } from './lessons.controller';
import { ResourcesController, ResourceItemController } from './resources.controller';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [CourseAccessPolicyModule],
  controllers: [
    CoursesController,
    ChaptersController,
    LessonsController,
    ResourcesController,
    ResourceItemController,
  ],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
