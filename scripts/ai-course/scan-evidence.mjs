import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const forbiddenText = [
  { name: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: 'database connection string', pattern: /\b(?:mysql|postgres(?:ql)?):\/\/[^\s"']+/i },
  { name: 'bearer token', pattern: /\bbearer\s+[A-Z0-9._~+/-]+=*/i },
  { name: 'provider-style secret', pattern: /\bsk-[A-Z0-9_-]{12,}\b/i },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const forbiddenJsonKeys = /^(?:prompt|rawPrompt|content|email|secret|apiKey|accessToken|refreshToken)$/i;

function inspectJson(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectJson(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenJsonKeys.test(key)) {
      throw new Error(`forbidden evidence field ${path}.${key}`);
    }
    inspectJson(child, `${path}.${key}`);
  }
}

export async function scanEvidence(files) {
  for (const file of files) {
    const absolutePath = resolve(file);
    const text = await readFile(absolutePath, 'utf8');
    for (const check of forbiddenText) {
      if (check.pattern.test(text)) throw new Error(`${check.name} found in ${file}`);
    }
    if (file.endsWith('.json')) inspectJson(JSON.parse(text));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('at least one evidence file is required');
  await scanEvidence(files);
  process.stdout.write(`Evidence privacy scan passed for ${files.length} file(s).\n`);
}
