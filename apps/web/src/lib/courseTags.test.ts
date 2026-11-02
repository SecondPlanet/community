import { describe, expect, it } from 'vitest';
import { firstCourseTag, parseCourseTags } from './courseTags';

describe('course tags compatibility', () => {
  it('parses JSON-array storage used by seed data', () => {
    expect(parseCourseTags('["AI","概念","未来"]')).toEqual(['AI', '概念', '未来']);
  });

  it('parses legacy comma-separated storage', () => {
    expect(parseCourseTags('RAG, Agent，MLOps')).toEqual(['RAG', 'Agent', 'MLOps']);
  });

  it('does not crash on malformed JSON', () => {
    expect(parseCourseTags('[broken')).toEqual(['[broken']);
  });

  it('does not invent a tag when the database field is empty', () => {
    expect(firstCourseTag('')).toBe('');
  });
});
