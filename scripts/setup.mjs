import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../server/config.mjs';
import { Storage } from '../server/storage.mjs';
import { createUser } from '../server/auth.mjs';
import { savePolicy } from '../server/policy.mjs';
try { await access('.env'); console.log('Existing .env preserved.'); }
catch {
  const tesseract = process.platform === 'win32' && existsSync('C:/Program Files/Tesseract-OCR/tesseract.exe') ? 'C:/Program Files/Tesseract-OCR/tesseract.exe' : 'tesseract';
  const env = (await readFile('.env.example', 'utf8')).replace('KB_MASTER_KEY=', `KB_MASTER_KEY=${randomBytes(32).toString('base64')}`).replace('KB_TESSERACT=tesseract', `KB_TESSERACT="${tesseract}"`);
  await writeFile('.env', `${env}\n# Initial administrator credentials; remove the password line after first use.\nKB_SETUP_ADMIN_EMAIL=admin@kalabasa.local\nKB_SETUP_ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Generated .env with encryption key and initial administrator credentials. Keep this file private.');
}
process.loadEnvFile('.env');
const cfg = config(), store = new Storage(cfg.dataDir, cfg.key);
const policy = JSON.parse(await readFile('config/requirements.example.json', 'utf8'));
if (!store.list('policies').length) savePolicy(store, policy, 'setup');
if (!store.list('users').length) {
  if (!process.env.KB_SETUP_ADMIN_PASSWORD) throw new Error('Set KB_SETUP_ADMIN_EMAIL and KB_SETUP_ADMIN_PASSWORD for the first administrator.');
  createUser(store, { email: process.env.KB_SETUP_ADMIN_EMAIL, password: process.env.KB_SETUP_ADMIN_PASSWORD, name: 'Local LGU Administrator', role: 'admin', lguId: policy.lguId });
  console.log('Initial administrator created. Find credentials in .env.');
}
store.close();
console.log('Setup complete. Run npm run build, npm run doctor, then npm start.');
