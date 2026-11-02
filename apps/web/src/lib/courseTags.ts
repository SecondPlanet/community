/** Normalize legacy string-list columns, which may contain a JSON array or a
 * comma-separated string depending on when the row was created. */
export function parseStringList(value?: string | null): string[] {
  const raw = value?.trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Fall through to the tolerant legacy parser below.
    }
  }

  return raw
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const parseCourseTags = parseStringList;

export function firstCourseTag(value?: string | null): string {
  return parseCourseTags(value)[0] ?? '';
}
