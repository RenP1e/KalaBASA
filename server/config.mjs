import path from 'node:path';
export function config(env = process.env) {
  const ollama = new URL(env.KB_OLLAMA_URL || 'http://127.0.0.1:11434');
  if (ollama.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(ollama.hostname) || ollama.username || ollama.password || ollama.pathname !== '/') {
    throw new Error('Ollama must use a numeric loopback HTTP address, without credentials or a path.');
  }
  const model = env.KB_MODEL || 'qwen2.5:3b';
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(model) || /cloud/i.test(model)) throw new Error('Only installed local model names are allowed.');
  const key = Buffer.from(env.KB_MASTER_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('KB_MASTER_KEY must be 32 bytes in base64. Run npm run setup.');
  return {
    port: Number(env.PORT || 3210), dataDir: path.resolve(env.KB_DATA_DIR || './var'), key,
    ollama: ollama.origin, model, modelTimeout: Number(env.KB_MODEL_TIMEOUT_MS || 120000),
    tesseract: env.KB_TESSERACT || 'tesseract', ocrLang: env.KB_OCR_LANG || 'eng',
    secureCookie: env.KB_SECURE_COOKIE === 'true', syncUrl: env.KB_SYNC_URL || '', syncToken: env.KB_SYNC_TOKEN || '',
    inboundToken: env.KB_INBOUND_SYNC_TOKEN || '', inboundLgu: env.KB_INBOUND_LGU || '',
    maxPages: 20, maxFiles: 12, maxFileBytes: 20 * 1024 * 1024, minConfidence: 0.65,
  };
}
