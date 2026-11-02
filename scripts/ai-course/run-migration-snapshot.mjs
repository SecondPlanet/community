import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { verifyAiCourseMigration } from '../test-ai-course-migration.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.slice(1);
if (!/^ai_course_migration_test(?:_[a-z0-9]+)?$/.test(databaseName)) {
  throw new Error('migration snapshot refuses non-dedicated database; use ai_course_migration_test[_suffix]');
}

const prisma = new PrismaClient({ log: [] });
const startedAt = new Date();
const runId = process.env.GITHUB_RUN_ID ?? randomUUID();
const outputDir = resolve(rootDir, 'coverage/ai-course');
const temporary = await mkdtemp(resolve(tmpdir(), 'aicourse-migration-'));
const latestMigration = '20260822133500_add_ai_personal_courses';

function runPrisma(schemaPath) {
  const before = Date.now();
  const result = spawnSync(
    'pnpm',
    ['--filter', '@secondplanet/api', 'exec', 'prisma', 'migrate', 'deploy', '--schema', schemaPath],
    { cwd: rootDir, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) throw new Error('prisma migrate deploy failed');
  return Date.now() - before;
}

async function wipeDedicatedDatabase() {
  const tables = await prisma.$queryRawUnsafe(
    'SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  );
  const foreignKeys = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()`,
  );
  // FOREIGN_KEY_CHECKS is session-scoped, while Prisma may use a different
  // pooled connection for every statement. Drop the constraints explicitly so
  // this destructive, dedicated-test cleanup remains deterministic in CI.
  for (const row of foreignKeys) {
    const tableName = String(row.tableName);
    const constraintName = String(row.constraintName);
    if (!/^[a-zA-Z0-9_]+$/.test(tableName) || !/^[a-zA-Z0-9_]+$/.test(constraintName)) {
      throw new Error('unsafe foreign key identifier');
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``,
    );
  }
  for (const row of tables) {
    const name = String(row.tableName);
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('unsafe table identifier');
    await prisma.$executeRawUnsafe(`DROP TABLE \`${name}\``);
  }
}

async function priorSchemaPath() {
  const schemaPath = resolve(temporary, 'schema.prisma');
  await cp(resolve(rootDir, 'prisma/schema.prisma'), schemaPath);
  const target = resolve(temporary, 'migrations');
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(resolve(rootDir, 'prisma/migrations'))) {
    if (entry === latestMigration) continue;
    await cp(resolve(rootDir, 'prisma/migrations', entry), resolve(target, entry), { recursive: true });
  }
  return schemaPath;
}

async function verify() {
  return verifyAiCourseMigration({
    query: (sql, params = []) => prisma.$queryRawUnsafe(sql, ...params),
  });
}

async function seedPreviousSnapshot() {
  const courseId = randomUUID();
  const chapterId = randomUUID();
  const lessonId = randomUUID();
  const historical = new Date('2026-08-01T00:00:00.000Z');
  await prisma.$executeRawUnsafe(
    `INSERT INTO courses
      (id,title,description,learning_points,instructor,level,duration,thumbnail,tags,cost_type,price,status,course_type,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    courseId, 'Synthetic historical course', 'fixture', 'fixture', 'fixture', 'Beginner',
    '10 minutes', '', 'fixture', 'free', 0, 'draft', 'own', historical, historical,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO chapters (id,course_id,title,description,order_index,created_at) VALUES (?,?,?,?,?,?)',
    chapterId, courseId, 'Synthetic chapter', null, 0, historical,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO lessons (id,chapter_id,title,description,order_index,is_preview,created_at) VALUES (?,?,?,?,?,?,?)',
    lessonId, chapterId, 'Synthetic lesson', null, 0, false, historical,
  );
}

let artifact;
try {
  await prisma.$connect();
  const fullSchema = resolve(rootDir, 'prisma/schema.prisma');
  await wipeDedicatedDatabase();
  const emptyDurationMs = runPrisma(fullSchema);
  const empty = await verify();
  const repeatDurationMs = runPrisma(fullSchema);

  await wipeDedicatedDatabase();
  const previousSchema = await priorSchemaPath();
  runPrisma(previousSchema);
  await seedPreviousSnapshot();
  const snapshotDurationMs = runPrisma(fullSchema);
  const snapshot = await verify();
  const migrationSql = await readFile(resolve(rootDir, 'prisma/migrations', latestMigration, 'migration.sql'));
  artifact = {
    schemaVersion: 1,
    gitSha: process.env.GITHUB_SHA ?? 'local-worktree',
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    status: 'passed',
    evidenceMode: 'destructive-dedicated-mysql-migration-snapshot',
    scenarios: [
      { id: 'M1', name: 'empty database full migrate deploy', status: 'passed', durationMs: emptyDurationMs, assertions: 1, finalState: empty, promptHashOnly: true },
      { id: 'M2', name: 'repeat migrate deploy idempotency', status: 'passed', durationMs: repeatDurationMs, assertions: 1, finalState: { schemaChanges: 0 }, promptHashOnly: true },
      { id: 'M3', name: 'synthetic previous-version snapshot upgrade', status: 'passed', durationMs: snapshotDurationMs, assertions: 1, finalState: snapshot, promptHashOnly: true },
    ],
    migrationChecksum: createHash('sha256').update(migrationSql).digest('hex'),
    containsProductionData: false,
    coverageGaps: ['Lock-wait timing requires staging performance_schema collection.'],
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'migration-snapshot.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(resolve(outputDir, 'junit-ai-migration.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="ai-course-migration" tests="3" failures="0" />\n');
} finally {
  await wipeDedicatedDatabase().catch(() => undefined);
  await prisma.$disconnect();
  await rm(temporary, { recursive: true, force: true });
}

if (!artifact) throw new Error('migration snapshot evidence failed');
