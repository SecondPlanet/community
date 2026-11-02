import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PlatformLearningPage } from './PlatformLearningPage';

const containerSpy = vi.hoisted(() => vi.fn(({ courseId, lessonId }: { courseId: string; lessonId: string }) => <div>{courseId}:{lessonId}</div>));
vi.mock('./PlatformLearningContainer', () => ({ PlatformLearningContainer: containerSpy }));

describe('PlatformLearningPage', () => {
  it('only reads required route params and passes them to the network container', () => {
    render(<MemoryRouter initialEntries={['/dashboard/learning/course-1/lessons/lesson-2']}><Routes><Route path="/dashboard/learning/:courseId/lessons/:lessonId" element={<PlatformLearningPage />} /></Routes></MemoryRouter>);
    expect(screen.getByText('course-1:lesson-2')).toBeInTheDocument();
    expect(containerSpy).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'course-1', lessonId: 'lesson-2' }), undefined);
  });
});
