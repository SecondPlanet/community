import api from './api';

export interface LessonNote {
  id: string;
  userId: string;
  lessonId: string;
  content: string;
  positionSec: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveNoteInput {
  content: string;
  positionSec?: number;
}

export const notesApi = {
  async list(lessonId: string): Promise<LessonNote[]> {
    const { data } = await api.get<LessonNote[]>(`/api/v1/lessons/${lessonId}/notes`);
    return data;
  },

  async create(lessonId: string, input: SaveNoteInput): Promise<LessonNote> {
    const { data } = await api.post<LessonNote>(`/api/v1/lessons/${lessonId}/notes`, input);
    return data;
  },

  async update(noteId: string, input: Partial<SaveNoteInput>): Promise<LessonNote> {
    const { data } = await api.patch<LessonNote>(`/api/v1/notes/${noteId}`, input);
    return data;
  },

  async remove(noteId: string): Promise<void> {
    await api.delete(`/api/v1/notes/${noteId}`);
  },
};
