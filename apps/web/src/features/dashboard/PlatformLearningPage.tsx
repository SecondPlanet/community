import { PlatformLearningContainer } from './PlatformLearningContainer';
import { Navigate, useParams } from 'react-router-dom';

/** Canonical route wrapper for the learning workspace. */
export function PlatformLearningPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  if (!courseId || !lessonId) return <Navigate to="/dashboard/learning" replace />;
  return <PlatformLearningContainer courseId={courseId} lessonId={lessonId} />;
}
