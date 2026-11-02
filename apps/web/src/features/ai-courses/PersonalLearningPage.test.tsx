import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalVisibleLessonId, PersonalLearningPage } from './PersonalLearningPage';
import { aiCoursesApi } from './aiCoursesApi';
import type { LearningProjectDetail, LessonContentView } from './aiCourses.types';
import { progressApi } from '../../lib/progressApi';

const { createLearningEvent } = vi.hoisted(() => ({ createLearningEvent: vi.fn().mockResolvedValue({}) }));
vi.mock('../../lib/learningEventsApi', () => ({ learningEventsApi: { createOne: createLearningEvent } }));

vi.mock('./ProjectTutorPanel', () => ({
  ProjectTutorPanel: () => <button type="button">导师面板操作</button>,
}));

vi.mock('./AssessmentPanel', () => ({
  AssessmentPanel: () => <div>测评面板</div>,
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/ai-courses/project-1/learn/lesson-1']}>
        <Routes>
          <Route path="/ai-courses/:projectId/learn/:lessonId" element={<PersonalLearningPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PersonalLearningPage Tutor Drawer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('traps focus, closes with Escape and restores the mobile trigger', async () => {
    createLearningEvent.mockResolvedValue({});
    vi.spyOn(aiCoursesApi, 'getProject').mockResolvedValue({
      id: 'project-1',
      courseId: 'course-1',
      course: { id: 'course-1', title: 'AI 安全课', description: '', level: 'Beginner' },
      chapters: [{
        id: 'chapter-1',
        courseId: 'course-1',
        title: '第一章',
        description: '',
        orderIndex: 0,
        deletedAt: null,
        lessons: [{
          id: 'lesson-1',
          chapterId: 'chapter-1',
          title: '提示词边界',
          description: '',
          orderIndex: 0,
          isHidden: false,
          deletedAt: null,
        }, {
          id: 'lesson-2', chapterId: 'chapter-1', title: '下一节', description: '', orderIndex: 1, isHidden: false, deletedAt: null,
        }],
      }],
      activeLesson: { id: 'lesson-1', title: '提示词边界' },
    } as unknown as LearningProjectDetail);
    vi.spyOn(aiCoursesApi, 'getLessonContent').mockImplementation(async (_projectId, requestedLessonId) => ({
      lessonId: requestedLessonId,
      status: requestedLessonId === 'lesson-2' ? 'empty' : 'ready',
      schemaVersion: 1,
      version: 1,
      blocks: requestedLessonId === 'lesson-2' ? null : [],
      summary: null,
      glossary: null,
      generatedAt: '2026-08-23T00:00:00.000Z',
      generation: null,
    } satisfies LessonContentView));
    vi.spyOn(progressApi, 'completeLesson').mockResolvedValue({
      record: {},
      courseProgress: { isCompleted: false } as never,
      pointsAwarded: 0,
      newlyUnlockedBadges: [],
      courseJustCompleted: false,
      certificate: null,
      degreeCertificates: [],
    });
    const generate = vi.spyOn(aiCoursesApi, 'generateLessonContent').mockResolvedValue({ id: 'job-2', type: 'lesson_content', status: 'queued', progress: 0, currentStep: null, retryable: false, errorCode: null });
    renderPage();

    await screen.findByRole('heading', { name: '提示词边界' });
    expect(createLearningEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'personal_lesson_opened', lessonId: 'lesson-1' }));
    fireEvent.click(screen.getByRole('tab', { name: '导师' }));
    expect(screen.getByRole('tabpanel', { name: '导师' })).not.toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('tab', { name: '学习' }));
    const trigger = screen.getByRole('button', { name: '在抽屉中打开课程导师' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '课程导师' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getAllByRole('button', { name: '关闭' })[1]).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '完成并进入下一节' }));
    await waitFor(() => expect(generate).toHaveBeenCalledWith('project-1', 'lesson-2', 'generate', expect.any(String)));
  });
});

describe('personal lesson canonicalization', () => {
  it('moves a hidden or deleted deep link to the nearest visible lesson but rejects foreign ids', () => {
    const chapters = [{
      id: 'chapter-1', courseId: 'course-1', title: '第一章', description: '', orderIndex: 0, deletedAt: null,
      lessons: [
        { id: 'visible-before', chapterId: 'chapter-1', title: '前一节', description: '', orderIndex: 0, isHidden: false, deletedAt: null },
        { id: 'hidden', chapterId: 'chapter-1', title: '隐藏节', description: '', orderIndex: 1, isHidden: true, deletedAt: null },
        { id: 'deleted', chapterId: 'chapter-1', title: '删除节', description: '', orderIndex: 2, isHidden: false, deletedAt: '2026-08-23T00:00:00Z' },
        { id: 'visible-after', chapterId: 'chapter-1', title: '后一节', description: '', orderIndex: 3, isHidden: false, deletedAt: null },
      ],
    }] as unknown as LearningProjectDetail['chapters'];
    expect(canonicalVisibleLessonId(chapters, 'hidden')).toBe('visible-before');
    expect(canonicalVisibleLessonId(chapters, 'deleted')).toBe('visible-after');
    expect(canonicalVisibleLessonId(chapters, 'foreign')).toBeNull();
  });
});
