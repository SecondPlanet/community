import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateNoteDto, UpdateNoteDto } from './notes.dto';
import { NotesService } from './notes.service';
import { UserRole } from '@prisma/client';

type AuthedRequest = { user: { userId: string; role?: UserRole } };

@ApiTags('notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'lessons/:lessonId/notes', version: '1' })
export class LessonNotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @Request() req: AuthedRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.notes.list(req.user.userId, lessonId, req.user.role);
  }

  @Post()
  create(
    @Request() req: AuthedRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notes.create(req.user.userId, lessonId, dto, req.user.role);
  }
}

@ApiTags('notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notes', version: '1' })
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Patch(':id')
  update(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(
    @Request() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.remove(req.user.userId, id);
  }
}
