import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { config } from '../server/config.mjs';
import { OllamaExtractor } from '../server/extraction.mjs';
const cfg = config();
console.log(JSON.stringify({ node: process.version, cpu: os.cpus()[0]?.model, ramGiB: Math.round(os.totalmem() / 2 ** 30), inference: 'CPU', model: cfg.model }, null, 2));
try { console.log(execFileSync(cfg.tesseract, ['--version'], { windowsHide: true, encoding: 'utf8' }).split('\n')[0]); }
catch { console.log('Tesseract unavailable. Set KB_TESSERACT to the executable path.'); process.exitCode = 1; }
try { console.log('Installed local model:', JSON.stringify(await new OllamaExtractor(cfg).available())); }
catch { console.log('Local AI unavailable. Install Ollama, disable cloud routing and pull the configured model.'); process.exitCode = 1; }
