import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIGRATION_NAME,
  MigrationVerificationError,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  verifyAiCourseMigration,
} from './test-ai-course-migration.mjs';

const FINISHED_AT = new Date('2026-08-22T05:35:00.000Z');

function validFixture(overrides = {}) {
  return {
    migrationRows: [{ finishedAt: FINISHED_AT }],
    tableRows: REQUIRED_TABLES.map((tableName) => ({ tableName })),
    indexRows: REQUIRED_INDEXES.map(([tableName, indexName]) => ({ tableName, indexName })),
    defaultRows: [
      { tableName: 'courses', columnName: 'origin', columnDefault: 'platform' },
      { tableName: 'courses', columnName: 'visibility', columnDefault: 'public' },
      { tableName: 'lessons', columnName: 'is_hidden', columnDefault: '0' },
      { tableName: 'lessons', columnName: 'estimated_minutes', columnDefault: '10' },
    ],
    courseRows: [{ total: 12n, invalid: 0n }],
    lessonRows: [{ total: 48n, invalid: 0n }],
    runtimeRows: [{ total: 1n, singletonRows: 1n, unexpectedRows: 0n }],
    ...overrides,
  };
}

function fakeQueryAdapter(fixture) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('FROM _prisma_migrations')) return fixture.migrationRows;
      if (sql.includes('information_schema.TABLES')) return fixture.tableRows;
      if (sql.includes('information_schema.STATISTICS')) return fixture.indexRows;
      if (sql.includes('information_schema.COLUMNS')) return fixture.defaultRows;
      if (sql.includes('FROM courses')) return fixture.courseRows;
      if (sql.includes('FROM lessons')) return fixture.lessonRows;
      if (sql.includes('FROM ai_runtime_controls')) return fixture.runtimeRows;
      throw new Error('Unexpected query in test adapter');
    },
  };
}

async function captureFailure(fixture) {
  const adapter = fakeQueryAdapter(fixture);
  await assert.rejects(
    () => verifyAiCourseMigration(adapter),
    (error) => {
      assert.ok(error instanceof MigrationVerificationError);
      return true;
    },
  );
  try {
    await verifyAiCourseMigration(fakeQueryAdapter(fixture));
  } catch (error) {
    return error;
  }
  throw new Error('Expected migration verification to fail');
}

test('verifies the complete migration using only aggregate and metadata reads', async () => {
  const adapter = fakeQueryAdapter(validFixture());

  const report = await verifyAiCourseMigration(adapter);

  assert.deepEqual(report, {
    migration: MIGRATION_NAME,
    tablesVerified: REQUIRED_TABLES.length,
    indexesVerified: REQUIRED_INDEXES.length,
    defaultsVerified: 4,
    historicalCourseCount: 12,
    historicalLessonCount: 48,
    runtimeControlSingleton: true,
  });
  assert.ok(adapter.calls.length >= 7);
  for (const { sql } of adapter.calls) {
    assert.match(sql.trim(), /^SELECT\b/i, `query must remain read-only: ${sql}`);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|REPLACE)\b/i);
  }
  assert.deepEqual(adapter.calls[0].params, [MIGRATION_NAME]);
  const historyCalls = adapter.calls.filter(({ sql }) =>
    sql.includes('FROM courses') || sql.includes('FROM lessons'),
  );
  assert.equal(historyCalls.length, 2);
  assert.deepEqual(historyCalls.map(({ params }) => params), [[FINISHED_AT], [FINISHED_AT]]);
});

test('accepts a migrated database with no historical courses or lessons', async () => {
  const adapter = fakeQueryAdapter(
    validFixture({
      courseRows: [{ total: 0, invalid: 0 }],
      lessonRows: [{ total: 0, invalid: 0 }],
    }),
  );

  const report = await verifyAiCourseMigration(adapter);

  assert.equal(report.historicalCourseCount, 0);
  assert.equal(report.historicalLessonCount, 0);
});

test('reports missing tables and indexes by schema identifier only', async () => {
  const fixture = validFixture({
    tableRows: validFixture().tableRows.slice(1),
    indexRows: validFixture().indexRows.slice(1),
  });

  const error = await captureFailure(fixture);

  assert.match(error.failures.join('\n'), /Missing tables: learning_projects/);
  assert.match(
    error.failures.join('\n'),
    /learning_projects\.learning_projects_course_id_key/,
  );
});

test('reports a missing runtime-control table without querying the missing object', async () => {
  const fixture = validFixture({
    tableRows: validFixture().tableRows.filter(
      ({ tableName }) => tableName !== 'ai_runtime_controls',
    ),
  });
  const adapter = fakeQueryAdapter(fixture);

  let caught;
  try {
    await verifyAiCourseMigration(adapter);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof MigrationVerificationError);
  assert.match(caught.failures.join('\n'), /Missing tables: ai_runtime_controls/);
  assert.equal(adapter.calls.some(({ sql }) => sql.includes('FROM ai_runtime_controls')), false);
});

test('fails when the migration record is absent and does not run historical row checks', async () => {
  const adapter = fakeQueryAdapter(validFixture({ migrationRows: [] }));

  const error = await captureFailure(validFixture({ migrationRows: [] }));

  assert.match(error.failures.join('\n'), new RegExp(MIGRATION_NAME));
  await assert.rejects(() => verifyAiCourseMigration(adapter), MigrationVerificationError);
  assert.equal(adapter.calls.some(({ sql }) => sql.includes('FROM courses')), false);
  assert.equal(adapter.calls.some(({ sql }) => sql.includes('FROM lessons')), false);
});

test('fails historical course and lesson backfill evidence without selecting business rows', async () => {
  const adapter = fakeQueryAdapter(
    validFixture({
      courseRows: [{ total: 7, invalid: 2 }],
      lessonRows: [{ total: 16, invalid: 3 }],
    }),
  );

  let caught;
  try {
    await verifyAiCourseMigration(adapter);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof MigrationVerificationError);
  assert.match(caught.failures.join('\n'), /2 historical course row\(s\)/);
  assert.match(caught.failures.join('\n'), /3 historical lesson row\(s\)/);
  const historySql = adapter.calls
    .filter(({ sql }) => sql.includes('FROM courses') || sql.includes('FROM lessons'))
    .map(({ sql }) => sql)
    .join('\n');
  assert.match(historySql, /COUNT\(\*\)/);
  assert.doesNotMatch(historySql, /SELECT\s+\*/i);
});

test('fails missing or changed schema defaults', async () => {
  const fixture = validFixture({
    defaultRows: [
      { tableName: 'courses', columnName: 'origin', columnDefault: 'platform' },
      { tableName: 'courses', columnName: 'visibility', columnDefault: 'public' },
      { tableName: 'lessons', columnName: 'is_hidden', columnDefault: '1' },
    ],
  });

  const error = await captureFailure(fixture);

  assert.match(error.failures.join('\n'), /lessons\.is_hidden/);
  assert.match(error.failures.join('\n'), /lessons\.estimated_minutes/);
});

test('requires exactly one AiRuntimeControl row and it must have id=1', async () => {
  for (const runtimeRows of [
    [{ total: 0, singletonRows: 0, unexpectedRows: 0 }],
    [{ total: 2, singletonRows: 1, unexpectedRows: 1 }],
    [{ total: 1, singletonRows: 0, unexpectedRows: 1 }],
  ]) {
    const error = await captureFailure(validFixture({ runtimeRows }));
    assert.match(error.failures.join('\n'), /exactly one row with id=1/);
  }
});

test('rejects malformed aggregate values from the adapter', async () => {
  const adapter = fakeQueryAdapter(
    validFixture({ courseRows: [{ total: 'not-a-count', invalid: 0 }] }),
  );

  await assert.rejects(
    () => verifyAiCourseMigration(adapter),
    /invalid aggregate for historical courses/,
  );
});
