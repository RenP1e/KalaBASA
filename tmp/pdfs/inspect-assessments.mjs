import { config } from '../../server/config.mjs';
import { Storage } from '../../server/storage.mjs';
const c = config(), s = new Storage(c.dataDir, c.key);
for (const j of s.list('jobs')) console.log(JSON.stringify({ id: j.id, ref: j.ref, version: j.policy.version, state: j.state,
  documents: j.documents.map(d => ({ file: d.file, type: d.documentType, pages: (d.pages || []).map(p => ({ page: p.page, rejected: p.rejected, error: p.extractionError })), fields: Object.fromEntries(Object.entries(d.fields || {}).map(([key, values]) => [key, values.map(f => ({ value: f.value, page: f.page }))])) })),
  findings: j.findings?.map(f => ({ key: f.key, category: f.category, rule: f.ruleId, status: f.verificationStatus, file: f.a?.file, why: f.why })) }));
s.close();
