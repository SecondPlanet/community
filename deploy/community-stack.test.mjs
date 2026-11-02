import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

const compose = await readFile(new URL('docker-compose.yml', root), 'utf8');
const nginx = await readFile(new URL('deploy/nginx.conf', root), 'utf8');
const apiEntrypoint = await readFile(new URL('deploy/api-entrypoint.sh', root), 'utf8');
const migrationEntrypoint = await readFile(
  new URL('deploy/migration-entrypoint.sh', root),
  'utf8',
);

test('the Compose stack is a single node community stack', () => {
  // The exact set of services. A new service has to be added here on purpose.
  const services = [...compose.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map((match) => match[1]);
  assert.deepEqual(services.sort(), [
    'api',
    'migration',
    'minio',
    'minio-init',
    'mysql',
    'redis',
    'web',
  ]);

  // No multi node or commercial deployment machinery.
  assert.doesNotMatch(compose, /haproxy|keepalived|consul|etcd|kafka|zookeeper/);
  assert.doesNotMatch(compose, /ai-worker|worker-cluster|replicas:/);
  assert.doesNotMatch(compose, /tencentyun|myqcloud|enterprise-runtime|enterprise-api|enterprise-web/);
  assert.doesNotMatch(compose, /TCR_|TCR_NAMESPACE/);
});

test('every stateful service has a volume and a health check', () => {
  const serviceBlock = (name) =>
    compose.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z])`))?.[1] ?? '';

  for (const service of ['mysql', 'redis', 'minio']) {
    const block = serviceBlock(service);
    assert.match(block, /healthcheck:/, `${service} needs a health check`);
    assert.match(block, /volumes:/, `${service} needs a volume`);
  }
  assert.match(compose, /^volumes:\n(?:  [a-z_]+:\n)+/m);
});

test('the API starts after the migrations have been applied', () => {
  assert.match(
    compose,
    /\n  api:\n[\s\S]*?migration:\n\s+condition: service_completed_successfully/,
  );
  assert.match(compose, /entrypoint: \["migration-entrypoint"\]/);
  assert.match(migrationEntrypoint, /migrate deploy/);
  assert.match(migrationEntrypoint, /bootstrap-production/);
  assert.doesNotMatch(apiEntrypoint, /migrate deploy|bootstrap-production/);
  assert.match(apiEntrypoint, /dist\/src\/main\.js/);
});

test('the web server proxies the API and the object storage', () => {
  assert.match(nginx, /proxy_pass http:\/\/api:8080;/);
  assert.match(nginx, /proxy_pass http:\/\/minio:9000;/);
  assert.match(nginx, /location = \/healthz \{/);
});

test('no secret is baked into the Compose file', () => {
  // Every credential comes from the environment.
  assert.doesNotMatch(compose, /PASSWORD:\s+[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(compose, /JWT_SECRET:\s+[A-Za-z0-9]{8,}/);
});
