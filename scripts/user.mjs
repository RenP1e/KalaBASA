import { config } from '../server/config.mjs';
import { Storage } from '../server/storage.mjs';
import { createUser } from '../server/auth.mjs';
import { activePolicy } from '../server/policy.mjs';
// Password comes from an environment variable, never a command-line argument visible in process listings.
const [email, name, role, lguId] = process.argv.slice(2);
const cfg = config(), store = new Storage(cfg.dataDir, cfg.key);
try {
  if (!activePolicy(store, lguId)) throw new Error('Publish a policy for this LGU before creating its accounts.');
  const user = createUser(store, { email, name, role, lguId, password: process.env.KB_NEW_USER_PASSWORD });
  console.log(`Created ${user.role} account for ${user.email}.`);
} finally { store.close(); }
