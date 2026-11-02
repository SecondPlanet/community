import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotesService } from './notes.service';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';

describe('NotesService', () => {
  const prisma = {
    lesson: { findFirst: jest.fn() },
    note: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const courseAccess = { assertCanLearn: jest.fn() };
  const service = new NotesService(
    prisma as unknown as PrismaService,
    courseAccess as unknown as CourseAccessPolicyService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a trimmed note for an existing lesson', async () => {
    prisma.lesson.findFirst.mockResolvedValue({
      chapter: {
        deletedAt: null,
        course: { id: 'course-1' },
      },
    });
    prisma.note.create.mockResolvedValue({ id: 'note-1' });

    await service.create('user-1', 'lesson-1', {
      content: '  important  ',
      positionSec: 42,
    });

    expect(prisma.note.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        lessonId: 'lesson-1',
        content: 'important',
        positionSec: 42,
      },
    });
  });

  it('returns 404 for another users note without revealing it exists', async () => {
    prisma.note.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user-1', 'note-owned-by-other', { content: 'x' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.note.update).not.toHaveBeenCalled();
  });

  it('deletes only after ownership validation', async () => {
    prisma.note.findFirst.mockResolvedValue({ id: 'note-1' });
    prisma.note.delete.mockResolvedValue({ id: 'note-1' });

    await expect(service.remove('user-1', 'note-1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.note.findFirst).toHaveBeenCalledWith({
      where: { id: 'note-1', userId: 'user-1' },
      select: { id: true },
    });
  });
});
