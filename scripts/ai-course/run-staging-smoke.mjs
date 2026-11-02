import { randomUUID } from 'node:crypto';

const required = ['AI_STAGING_API_V1_URL', 'AI_STAGING_ACCESS_TOKEN', 'AI_STAGING_REAL_PROVIDER_ACK'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
if (process.env.AI_STAGING_REAL_PROVIDER_ACK !== 'I_ACCEPT_PROVIDER_COST') throw new Error('AI_STAGING_REAL_PROVIDER_ACK must explicitly accept provider cost');
const base = process.env.AI_STAGING_API_V1_URL.replace(/\/$/, '');
const parsed = new URL(base);
if (parsed.protocol !== 'https:' && process.env.AI_STAGING_ALLOW_HTTP !== '1') throw new Error('staging smoke requires HTTPS (or explicit AI_STAGING_ALLOW_HTTP=1 for an isolated local target)');
if (!parsed.pathname.endsWith('/api/v1')) throw new Error('AI_STAGING_API_V1_URL must end with /api/v1');
const auth = { Authorization: `Bearer ${process.env.AI_STAGING_ACCESS_TOKEN}` };
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });

const ready = await get('/health/ready');
if (!ready.ok) throw new Error(`staging readiness failed with HTTP ${ready.status}`);
const anonymous = await get('/learning-projects/me?limit=1');
if (anonymous.status !== 401) throw new Error(`anonymous private Hub expected 401, received ${anonymous.status}`);
const privateHub = await get('/learning-projects/me?limit=1', auth);
if (!privateHub.ok) throw new Error(`authenticated private Hub failed with HTTP ${privateHub.status}`);

let projectId;
try {
  const created = await fetch(`${base}/learning-projects`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ question: 'Staging synthetic smoke: explain binary search invariants', goalType: 'quick_understanding', targetLevel: 'Beginner', availableMinutes: 30, preferences: { language: 'en', includeMath: false, includeCode: true } }),
  });
  if (created.status !== 202) throw new Error(`real-provider smoke creation expected 202, received ${created.status}`);
  const accepted = await created.json(); projectId = accepted.projectId;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await get(`/learning-projects/${encodeURIComponent(projectId)}`, auth);
    if (!response.ok) throw new Error(`project poll failed with HTTP ${response.status}`);
    const detail = await response.json();
    if (detail.status === 'plan_ready') { process.stdout.write('Staging AI course smoke passed: private Hub, real provider plan, and authenticated isolation.\n'); process.exitCode = 0; break; }
    if (detail.status === 'failed') throw new Error(`real-provider smoke failed with ${detail.lastErrorCode ?? 'UNKNOWN'}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  if (Date.now() >= deadline) throw new Error('real-provider staging smoke exceeded 180 seconds');
} finally {
  if (projectId) await fetch(`${base}/learning-projects/${encodeURIComponent(projectId)}/archive`, { method: 'POST', headers: auth }).catch(() => undefined);
}
