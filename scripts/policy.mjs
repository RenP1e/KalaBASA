import { readFile } from 'node:fs/promises';
import { config } from '../server/config.mjs';
import { Storage } from '../server/storage.mjs';
import { savePolicy } from '../server/policy.mjs';
const file = process.argv[2];
if (!file) throw new Error('Usage: npm run policy -- path/to/requirements.json');
const cfg = config(), store = new Storage(cfg.dataDir, cfg.key);
try {
  const record = savePolicy(store, JSON.parse(await readFile(file, 'utf8')), 'administrator-cli');
  console.log(`Published ${record.lguId} requirements ${record.version}; hash ${record.hash}.`);
} finally { store.close(); }
