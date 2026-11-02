import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

/** Load the development env used by commands documented for local execution. */
export function loadAiCourseLocalEnv(rootDir) {
  try {
    // Explicit shell/CI variables keep precedence; loadEnvFile never overwrites them.
    loadEnvFile(resolve(rootDir, '.env'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  process.env.REDIS_HOST ??= '127.0.0.1';
}
