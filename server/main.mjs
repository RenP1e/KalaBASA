import { config } from './config.mjs';
import { Storage } from './storage.mjs';
import { createApp } from './app.mjs';
const cfg = config(), store = new Storage(cfg.dataDir, cfg.key);
const { app, engine, sync } = createApp(store, cfg);
const server = app.listen(cfg.port, '127.0.0.1', () => {
  console.log(`KalaBASA local engine: http://127.0.0.1:${cfg.port}`);
  console.log(`CPU inference: ${cfg.model}. No external AI provider configured.`);
  engine.recover();
});
const timer = setInterval(() => sync.flush().catch(() => {}), 15000);
async function stop() { clearInterval(timer); server.close(); await engine.stop(); store.close(); }
process.on('SIGINT', () => stop().then(() => process.exit(0)));
process.on('SIGTERM', () => stop().then(() => process.exit(0)));
