import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const digest = s => createHash('sha256').update(s).digest('hex');
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, lguId: u.lguId, access: u.role === 'applicant' ? 'consumer' : 'reviewer', role: u.role, initials: u.name.split(/\s+/).map(s => s[0]).join('').slice(0, 2) });
export function createUser(store, { email, password, name, role, lguId }, actor = 'administrator-cli') {
  email = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 12 || !name || !lguId || !['applicant', 'reviewer', 'admin'].includes(role)) throw new Error('Supply email, password (12+ characters), name, role and LGU ID.');
  if (store.list('users').some(u => u.email === email)) throw new Error('Account already exists.');
  const salt = randomBytes(16).toString('hex');
  const user = { id: randomUUID(), email, name, role, lguId, salt, hash: scryptSync(password, salt, 64).toString('hex') };
  store.transaction(() => { store.put('users', user.id, user); store.audit(actor, 'user_created', user.id, { role, lguId }); });
  return publicUser(user);
}
export function login(store, email, password) {
  const u = store.list('users').find(u => u.email === String(email || '').trim().toLowerCase());
  const candidate = scryptSync(String(password || ''), u?.salt || 'invalid-account-salt', 64);
  if (!u || !timingSafeEqual(candidate, Buffer.from(u.hash, 'hex'))) return null;
  const token = randomBytes(32).toString('base64url'), csrf = randomBytes(24).toString('base64url');
  store.transaction(() => {
    store.put('sessions', digest(token), { userId: u.id, csrf, expires: Date.now() + 8 * 60 * 60 * 1000 });
    store.audit(u.id, 'login', u.id);
  });
  return { token, csrf, user: publicUser(u) };
}
export function session(store, req) {
  const token = /(?:^|;\s*)kb_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
  const s = token && store.get('sessions', digest(token));
  if (!s || s.expires < Date.now()) return null;
  const u = store.get('users', s.userId);
  return u ? { ...s, tokenHash: digest(token), user: publicUser(u) } : null;
}
export function changePassword(store, auth, currentPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 200) throw new Error('Use a new password with 12 to 200 characters.');
  const user = store.get('users', auth.user.id);
  if (!timingSafeEqual(scryptSync(String(currentPassword || ''), user.salt, 64), Buffer.from(user.hash, 'hex'))) throw new Error('Current password is incorrect.');
  const salt = randomBytes(16).toString('hex');
  store.transaction(() => {
    store.put('users', user.id, { ...user, salt, hash: scryptSync(newPassword, salt, 64).toString('hex') });
    for (const row of store.db.prepare("SELECT id FROM records WHERE kind='sessions'").all()) {
      const s = store.get('sessions', row.id);
      if (s.userId === user.id && row.id !== auth.tokenHash) store.delete('sessions', row.id);
    }
    store.audit(user.id, 'password_changed', user.id);
  });
}
