import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('public sitemap route proxies to the versioned Nest endpoint', async () => {
  const nginx = await readFile(new URL('deploy/nginx.conf', root), 'utf8');

  assert.match(
    nginx,
    /location = \/sitemap\.xml \{[\s\S]*?proxy_pass http:\/\/api:8080\/api\/v1\/sitemap\.xml;/,
  );
});
