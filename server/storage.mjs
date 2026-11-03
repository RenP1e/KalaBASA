import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';

// Personal data, documents and audit payloads are AES-256-GCM encrypted before SQLite sees them.
// AAD binds each ciphertext to its table and opaque key. No plaintext document temp files.
export class Storage {
  constructor(dir, key) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.key = key;
    this.db = new DatabaseSync(path.join(dir, 'kalabasa.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, payload BLOB NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, payload BLOB NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL);`);
    const check = this.get('system', 'key-check');
    if (!check) this.put('system', 'key-check', { marker: 'kalabasa' });
    this.verifyAudit();
  }
  seal(buffer, aad) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }
  open(value, aad) {
    const b = Buffer.from(value), decipher = createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]);
  }
  put(kind, id, value) {
    const encrypted = this.seal(Buffer.from(JSON.stringify(value)), `${kind}:${id}`);
    this.db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload').run(kind, id, encrypted);
    return value;
  }
  get(kind, id) {
    const row = this.db.prepare('SELECT payload FROM records WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(this.open(row.payload, `${kind}:${id}`).toString()) : null;
  }
  list(kind) {
    return this.db.prepare('SELECT id,payload FROM records WHERE kind=?').all(kind)
      .map(row => JSON.parse(this.open(row.payload, `${kind}:${row.id}`).toString()));
  }
  delete(kind, id) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  audit(actor, action, target, detail = {}) {
    const previous = this.db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get()?.hash || 'genesis';
    const value = { id: randomUUID(), at: new Date().toISOString(), actor, action, target, detail };
    const payload = this.seal(Buffer.from(JSON.stringify(value)), `audit:${previous}`);
    const hash = createHmac('sha256', this.key).update(previous).update(payload).digest('hex');
    this.db.prepare('INSERT INTO audit(payload,previous,hash) VALUES (?,?,?)').run(payload, previous, hash);
  }
  verifyAudit() {
    let previous = 'genesis';
    for (const row of this.db.prepare('SELECT * FROM audit ORDER BY seq').all()) {
      const hash = createHmac('sha256', this.key).update(previous).update(row.payload).digest('hex');
      if (row.previous !== previous || hash !== row.hash) throw new Error('Audit integrity check failed. Restore a trusted backup.');
      previous = hash;
    }
  }
  auditRecords() {
    this.verifyAudit();
    return this.db.prepare('SELECT * FROM audit ORDER BY seq').all().map(r => ({ seq: r.seq, hash: r.hash, ...JSON.parse(this.open(r.payload, `audit:${r.previous}`).toString()) }));
  }
  close() { this.db.close(); }
}
