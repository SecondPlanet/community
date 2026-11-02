import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LessonNotesController, NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { CourseAccessPolicyModule } from '../../common/course-access/course-access-policy.module';

@Module({
  imports: [PrismaModule, CourseAccessPolicyModule],
  controllers: [LessonNotesController, NotesController],
  providers: [NotesService],
})
export class NotesModule {}
