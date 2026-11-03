import Ajv from 'ajv';
import { createHash } from 'node:crypto';
const ajv = new Ajv({ allErrors: true, strict: true });
const names = { type: 'array', uniqueItems: true, minItems: 1, maxItems: 50, items: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' } };
const validator = ajv.compile({
  type: 'object', additionalProperties: false,
  required: ['lguId', 'version', 'label', 'productionReady', 'documentTypes', 'fields', 'rules'],
  properties: {
    lguId: { type: 'string', pattern: '^[a-z0-9-]{1,64}$' }, version: { type: 'string', minLength: 1, maxLength: 64 },
    label: { type: 'string', minLength: 1, maxLength: 200 }, productionReady: { type: 'boolean' },
    documentTypes: { type: 'object', minProperties: 1, maxProperties: 30, propertyNames: { pattern: '^[a-z][a-z0-9_]*$' }, additionalProperties: {
      type: 'object', additionalProperties: false, required: ['label', 'markers'], properties: {
        label: { type: 'string', minLength: 1, maxLength: 100 }, markers: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 5, maxLength: 150 } },
        extractFields: names,
        fieldScopes: { type: 'object', maxProperties: 40, additionalProperties: {
          type: 'object', additionalProperties: false, required: ['after', 'before'], properties: {
            after: { type: 'string', minLength: 1, maxLength: 150 }, before: { type: 'string', minLength: 1, maxLength: 150 },
          },
        } },
      },
    } },
    fields: { type: 'object', minProperties: 1, maxProperties: 40, propertyNames: { pattern: '^[a-z][a-z0-9_]*$' }, additionalProperties: {
      type: 'object', required: ['label', 'normalization'], additionalProperties: false,
      properties: { label: { type: 'string', minLength: 1, maxLength: 100 }, normalization: { enum: ['text', 'identifier', 'date'] } },
    } },
    rules: { type: 'array', minItems: 1, maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: ['id', 'kind', 'enabled'],
      properties: {
        id: { type: 'string', pattern: '^[a-z0-9-]{1,64}$' }, kind: { enum: ['documents', 'required_fields', 'compare', 'format', 'date', 'manual'] },
        enabled: { type: 'boolean' }, applicationTypes: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['new', 'renewal'] } },
        documentTypes: names, fields: names, pattern: { type: 'string', maxLength: 160 }, description: { type: 'string', maxLength: 500 },
        maxAgeDays: { type: 'integer', minimum: 0, maximum: 36500 }, allowFutureDays: { type: 'integer', minimum: 0, maximum: 365 }, notExpired: { type: 'boolean' },
      },
    } },
  },
});
export function validatePolicy(policy) {
  if (!validator(policy)) throw new Error(`Invalid requirements: ${ajv.errorsText(validator.errors)}`);
  const ids = new Set();
  for (const spec of Object.values(policy.documentTypes)) for (const field of spec.extractFields || []) {
    if (!Object.hasOwn(policy.fields, field)) throw new Error(`Unknown extraction field: ${field}`);
  }
  for (const spec of Object.values(policy.documentTypes)) for (const field of Object.keys(spec.fieldScopes || {})) {
    if (!Object.hasOwn(policy.fields, field)) throw new Error(`Unknown scoped field: ${field}`);
  }
  for (const r of policy.rules) {
    if (ids.has(r.id)) throw new Error('Rule IDs must be unique.');
    ids.add(r.id);
    for (const d of r.documentTypes || []) if (!Object.hasOwn(policy.documentTypes, d)) throw new Error(`Unknown document type: ${d}`);
    for (const f of r.fields || []) if (!Object.hasOwn(policy.fields, f)) throw new Error(`Unknown field: ${f}`);
    if (!['documents', 'manual'].includes(r.kind) && !r.fields?.length) throw new Error(`${r.id} requires fields.`);
    if (r.kind === 'documents' && !r.documentTypes?.length) throw new Error(`${r.id} requires documentTypes.`);
    // Deliberately bounded regex grammar: anchored character class plus a bounded count. No executable policy code or backtracking expressions.
    if (r.kind === 'format' && !/^\^\[[A-Za-z0-9\\-]+\]\{\d{1,3},\d{1,3}\}\$$/.test(r.pattern || '')) throw new Error('Format rules require an anchored character class and bounded count, e.g. ^[A-Z0-9-]{4,40}$.');
    if (r.kind === 'format') { try { new RegExp(r.pattern); } catch { throw new Error('Invalid bounded format pattern.'); } }
    if (r.kind === 'date' && r.maxAgeDays === undefined && !r.notExpired) throw new Error('Date rules need maxAgeDays or notExpired.');
  }
  return policy;
}
export const policyHash = p => createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function savePolicy(store, policy, actor) {
  validatePolicy(policy);
  const id = `${policy.lguId}:${policy.version}`;
  if (store.get('policies', id)) throw new Error('Requirement versions are immutable. Choose a new version.');
  return store.transaction(() => {
    const record = { ...policy, hash: policyHash(policy), savedAt: new Date().toISOString(), savedBy: actor };
    store.put('policies', id, record);
    store.put('activePolicies', policy.lguId, { version: policy.version });
    store.audit(actor, 'requirements_published', id, { hash: record.hash });
    return record;
  });
}
export function activePolicy(store, lguId) {
  const active = store.get('activePolicies', lguId);
  return active && store.get('policies', `${lguId}:${active.version}`);
}
