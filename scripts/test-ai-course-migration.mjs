import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const MIGRATION_NAME = '20260822133500_add_ai_personal_courses';

export const REQUIRED_TABLES = Object.freeze([
  'learning_projects',
  'lesson_contents',
  'lesson_variants',
  'course_concepts',
  'lesson_concepts',
  'learner_concept_states',
  'assessments',
  'assessment_attempts',
  'ai_generation_jobs',
  'ai_budget_reservations',
  'ai_runtime_controls',
]);

export const REQUIRED_INDEXES = Object.freeze([
  ['learning_projects', 'learning_projects_course_id_key'],
  ['learning_projects', 'learning_projects_user_id_status_updated_at_idx'],
  ['learning_projects', 'learning_projects_hub_cursor_idx'],
  ['learning_projects', 'learning_projects_user_id_create_request_key_key'],
  ['lesson_contents', 'lesson_contents_lesson_id_key'],
  ['lesson_contents', 'lesson_contents_status_updated_at_idx'],
  ['lesson_variants', 'lesson_variants_job_id_key'],
  ['lesson_variants', 'lesson_variants_project_id_lesson_id_lesson_content_version__idx'],
  ['course_concepts', 'course_concepts_course_id_order_index_idx'],
  ['course_concepts', 'course_concepts_course_id_key_key'],
  ['lesson_concepts', 'lesson_concepts_concept_id_idx'],
  ['learner_concept_states', 'learner_concept_states_user_id_stage_updated_at_idx'],
  ['learner_concept_states', 'learner_concept_states_user_id_concept_id_key'],
  ['assessments', 'assessments_project_id_status_created_at_idx'],
  ['assessments', 'assessments_project_id_lesson_id_kind_lesson_content_version_key'],
  ['assessment_attempts', 'assessment_attempts_user_id_submitted_at_idx'],
  ['assessment_attempts', 'assessment_attempts_assessment_id_status_submitted_at_idx'],
  ['assessment_attempts', 'assessment_attempts_assessment_id_user_id_client_submission__key'],
  ['ai_generation_jobs', 'ai_generation_jobs_project_id_status_created_at_idx'],
  ['ai_generation_jobs', 'ai_generation_jobs_enqueue_status_next_enqueue_at_idx'],
  ['ai_generation_jobs', 'ai_jobs_enqueue_lease_idx'],
  ['ai_generation_jobs', 'ai_jobs_execution_lease_idx'],
  ['ai_generation_jobs', 'ai_jobs_provider_deadline_idx'],
  ['ai_generation_jobs', 'ai_generation_jobs_status_created_at_idx'],
  ['ai_generation_jobs', 'ai_generation_jobs_request_key_execution_no_key'],
  ['ai_budget_reservations', 'ai_budget_reservations_job_id_key'],
  ['ai_budget_reservations', 'ai_budget_reservations_user_id_period_key_status_idx'],
  ['ai_budget_reservations', 'ai_budget_reservations_status_expires_at_idx'],
  ['ai_budget_reservations', 'ai_budget_provider_period_idx'],
  ['ai_budget_reservations', 'ai_budget_feature_period_idx'],
  ['ai_budget_reservations', 'ai_budget_reservations_request_key_execution_no_key'],
  ['ai_usage', 'ai_usage_project_id_created_at_idx'],
  ['ai_usage', 'ai_usage_job_id_created_at_idx'],
  ['ai_usage', 'ai_usage_provider_model_created_at_idx'],
  ['chat_sessions', 'chat_sessions_project_id_updated_at_idx'],
  ['chat_sessions', 'chat_sessions_course_id_updated_at_idx'],
  ['courses', 'courses_owner_user_id_origin_created_at_idx'],
  ['courses', 'courses_visibility_status_created_at_idx'],
]);

const REQUIRED_DEFAULTS = Object.freeze([
  ['courses', 'origin', 'platform'],
  ['courses', 'visibility', 'public'],
  ['lessons', 'is_hidden', '0'],
  ['lessons', 'estimated_minutes', '10'],
]);

export class MigrationVerificationError extends Error {
  constructor(failures) {
    super(`AI course migration verification failed (${failures.length} assertion${failures.length === 1 ? '' : 's'}).`);
    this.name = 'MigrationVerificationError';
    this.failures = Object.freeze([...failures]);
  }
}

function asCount(value, label) {
  if (typeof value === 'bigint') return Number(value);
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError(`Database returned an invalid aggregate for ${label}.`);
  }
  return count;
}

function normalizedDefault(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/^'(.*)'$/, '$1').toLowerCase();
}

function indexKey(tableName, indexName) {
  return `${tableName}.${indexName}`;
}

async function query(adapter, sql, params = []) {
  if (!adapter || typeof adapter.query !== 'function') {
    throw new TypeError('A query adapter with a query(sql, params) method is required.');
  }
  const rows = await adapter.query(sql, params);
  if (!Array.isArray(rows)) throw new TypeError('The query adapter must return an array of rows.');
  return rows;
}

export async function verifyAiCourseMigration(adapter) {
  const failures = [];

  const migrationRows = await query(
    adapter,
    `SELECT finished_at AS finishedAt
       FROM _prisma_migrations
      WHERE migration_name = ?
        AND rolled_back_at IS NULL
        AND finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1`,
    [MIGRATION_NAME],
  );
  const migrationFinishedAt = migrationRows[0]?.finishedAt;
  if (!migrationFinishedAt) {
    failures.push(`Applied migration record is missing: ${MIGRATION_NAME}`);
  }

  const tablePlaceholders = REQUIRED_TABLES.map(() => '?').join(', ');
  const tableRows = await query(
    adapter,
    `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${tablePlaceholders})`,
    REQUIRED_TABLES,
  );
  const foundTables = new Set(tableRows.map((row) => String(row.tableName)));
  const missingTables = REQUIRED_TABLES.filter((table) => !foundTables.has(table));
  if (missingTables.length) failures.push(`Missing tables: ${missingTables.join(', ')}`);

  const indexRows = await query(
    adapter,
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND INDEX_NAME <> 'PRIMARY'`,
  );
  const foundIndexes = new Set(
    indexRows.map((row) => indexKey(String(row.tableName), String(row.indexName))),
  );
  const missingIndexes = REQUIRED_INDEXES.filter(
    ([tableName, indexName]) => !foundIndexes.has(indexKey(tableName, indexName)),
  );
  if (missingIndexes.length) {
    failures.push(`Missing indexes: ${missingIndexes.map(([tableName, name]) => indexKey(tableName, name)).join(', ')}`);
  }

  const defaultRows = await query(
    adapter,
    `SELECT TABLE_NAME AS tableName,
            COLUMN_NAME AS columnName,
            COLUMN_DEFAULT AS columnDefault
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND ((TABLE_NAME = 'courses' AND COLUMN_NAME IN ('origin', 'visibility'))
          OR (TABLE_NAME = 'lessons' AND COLUMN_NAME IN ('is_hidden', 'estimated_minutes')))`,
  );
  const foundDefaults = new Map(
    defaultRows.map((row) => [
      `${row.tableName}.${row.columnName}`,
      normalizedDefault(row.columnDefault),
    ]),
  );
  const validDefaults = new Set();
  for (const [tableName, columnName, expected] of REQUIRED_DEFAULTS) {
    const key = `${tableName}.${columnName}`;
    if (foundDefaults.get(key) !== expected) {
      failures.push(`Unexpected or missing default for ${key}; expected ${expected}`);
    } else {
      validDefaults.add(key);
    }
  }

  let historicalCourseCount = 0;
  let historicalLessonCount = 0;
  if (
    migrationFinishedAt &&
    validDefaults.has('courses.origin') &&
    validDefaults.has('courses.visibility')
  ) {
    const courseRows = await query(
      adapter,
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE
                WHEN origin = 'platform' AND visibility = 'public' THEN 0
                ELSE 1
              END), 0) AS invalid
         FROM courses
        WHERE created_at < ?`,
      [migrationFinishedAt],
    );
    historicalCourseCount = asCount(courseRows[0]?.total ?? 0, 'historical courses');
    const invalidCourses = asCount(courseRows[0]?.invalid ?? 0, 'invalid historical courses');
    if (invalidCourses !== 0) {
      failures.push(`${invalidCourses} historical course row(s) are not platform/public`);
    }

  }

  if (
    migrationFinishedAt &&
    validDefaults.has('lessons.is_hidden') &&
    validDefaults.has('lessons.estimated_minutes')
  ) {
    const lessonRows = await query(
      adapter,
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE
                WHEN is_hidden = false AND estimated_minutes = 10 THEN 0
                ELSE 1
              END), 0) AS invalid
         FROM lessons
        WHERE created_at < ?`,
      [migrationFinishedAt],
    );
    historicalLessonCount = asCount(lessonRows[0]?.total ?? 0, 'historical lessons');
    const invalidLessons = asCount(lessonRows[0]?.invalid ?? 0, 'invalid historical lessons');
    if (invalidLessons !== 0) {
      failures.push(`${invalidLessons} historical lesson row(s) do not have is_hidden=false and estimated_minutes=10`);
    }
  }

  if (foundTables.has('ai_runtime_controls')) {
    const runtimeRows = await query(
      adapter,
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN id = 1 THEN 1 ELSE 0 END), 0) AS singletonRows,
              COALESCE(SUM(CASE WHEN id <> 1 THEN 1 ELSE 0 END), 0) AS unexpectedRows
         FROM ai_runtime_controls`,
    );
    const runtimeTotal = asCount(runtimeRows[0]?.total ?? 0, 'runtime controls');
    const singletonRows = asCount(runtimeRows[0]?.singletonRows ?? 0, 'runtime control singleton');
    const unexpectedRows = asCount(runtimeRows[0]?.unexpectedRows ?? 0, 'unexpected runtime controls');
    if (runtimeTotal !== 1 || singletonRows !== 1 || unexpectedRows !== 0) {
      failures.push('AiRuntimeControl must contain exactly one row with id=1');
    }
  }

  if (failures.length) throw new MigrationVerificationError(failures);

  return Object.freeze({
    migration: MIGRATION_NAME,
    tablesVerified: REQUIRED_TABLES.length,
    indexesVerified: REQUIRED_INDEXES.length,
    defaultsVerified: REQUIRED_DEFAULTS.length,
    historicalCourseCount,
    historicalLessonCount,
    runtimeControlSingleton: true,
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('AI course migration verification could not start: DATABASE_URL is not set.');
    process.exitCode = 1;
    return;
  }

  let prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient({ log: [] });
    const report = await verifyAiCourseMigration({
      query: (sql, params) => prisma.$queryRawUnsafe(sql, ...params),
    });
    console.log(
      `AI course migration verified: ${report.tablesVerified} tables, ${report.indexesVerified} indexes, ` +
        `${report.defaultsVerified} defaults, ${report.historicalCourseCount} historical courses, ` +
        `${report.historicalLessonCount} historical lessons.`,
    );
  } catch (error) {
    if (error instanceof MigrationVerificationError) {
      console.error(error.message);
      for (const failure of error.failures) console.error(`- ${failure}`);
    } else {
      console.error('AI course migration verification could not be completed.');
    }
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
