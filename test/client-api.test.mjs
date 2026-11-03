import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('sign-in explains static-server and interrupted responses without leaking JSON parser errors', async () => {
  let response;
  const context = { KB: {}, React: {}, FormData, setInterval() {}, fetch: async () => { if (response instanceof Error) throw response; return response; } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../js/data.js', import.meta.url), 'utf8'), context);
  for (const value of [new Response('', { status: 405 }), new Response('<html>Static preview</html>', { headers: { 'Content-Type': 'text/html' } })]) {
    response = value;
    await assert.rejects(context.KB.api('/api/auth/login'), /Open http:\/\/127\.0\.0\.1:3210/);
  }
  response = new Response('{', { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(context.KB.api('/api/auth/login'), /incomplete response/);
  response = new TypeError('Failed to fetch');
  await assert.rejects(context.KB.api('/api/auth/login'), /Cannot reach the local KalaBASA service/);
  response = new Response(JSON.stringify({ error: 'Incorrect email or password.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(context.KB.api('/api/auth/login'), /Incorrect email or password/);
  response = new Response(JSON.stringify({ user: { email: 'synthetic@example.test' } }), { headers: { 'Content-Type': 'application/json' } });
  assert.equal((await context.KB.api('/api/auth/login')).user.email, 'synthetic@example.test');
});
