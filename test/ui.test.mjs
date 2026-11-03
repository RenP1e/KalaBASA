import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applicationView } from '../server/engine.mjs';
import { document, example, applicant } from './helpers.mjs';
import { validateCompliance } from '../server/rules.mjs';

test('preserved React screens render with server evidence, null values, and correct roles', async () => {
  const docs = ['application_form', 'business_registration', 'barangay_clearance'].map(t => document(t));
  const result = validateCompliance(docs, example, 'new', '2026-11-03');
  const job = { id: 'synthetic-job', ref: 'BP-TEST-1', ownerId: applicant.id, applicant, createdAt: '2026-11-03T00:00:00Z', completedAt: '2026-11-03T00:01:00Z', policy: { ...example, hash: 'synthetic-hash' }, applicationType: 'new', documents: docs, ...result, state: 'manual_review_required', transmissionState: 'local_only', revision: 1 };
  const application = applicationView(job);
  let user = { ...applicant, access: 'reviewer', role: 'admin', initials: 'ST' };
  const context = { React, FormData, AbortController, Blob, console, setTimeout: () => 0, clearTimeout() {}, setInterval() {}, document: { documentElement: { classList: { contains: () => false } } }, location: { hash: '' }, localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: async url => new Response(JSON.stringify(url === '/api/assessments' ? [application] : { user, csrf: 'synthetic-csrf' }), { headers: { 'Content-Type': 'application/json' } }),
  };
  context.window = context;
  vm.createContext(context);
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of index.matchAll(/<script src="(js\/[^\"]+)"><\/script>/g)) {
    if (match[1] === 'js/app.js') continue;
    vm.runInContext(readFileSync(new URL('../' + match[1], import.meta.url), 'utf8'), context, { filename: match[1] });
  }
  await context.KB.store.init();
  const P = context.KB.pages;
  for (const [page, props] of [['Login', {}], ['Home', {}], ['Applications', {}], ['Scan', {}], ['ApplicationDetail', { appRef: job.ref }], ['Check', { appRef: job.ref }], ['Fields', { appRef: job.ref }], ['Review', { appRef: job.ref, n: 1 }], ['Reports', {}], ['Profile', {}]]) {
    const markup = renderToStaticMarkup(React.createElement(P[page], props));
    assert.ok(markup.length > 100, `${page} renders`); assert.equal(markup.includes('p.null'), false, page); assert.equal(markup.includes('undefined'), false, page);
    if (page === 'Fields') { assert.ok(markup.includes('Not extracted')); assert.ok(markup.includes('Evidence:')); assert.ok(markup.includes('Open page 1')); assert.ok(markup.includes('Inspect document')); assert.equal(markup.includes('Source unavailable'), false); }
    if (page === 'Check') { assert.ok(markup.includes('0 compliance issues')); assert.ok(markup.includes('verification checks')); }
    if (page === 'ApplicationDetail') { assert.ok(markup.includes('not sent to an LGU')); assert.ok(markup.includes('Requirements example-1')); }
  }
  const manualIndex = application.findings.findIndex(f => f.category === 'manual_verification');
  const manualMarkup = renderToStaticMarkup(React.createElement(P.Review, { appRef: job.ref, n: manualIndex + 1 }));
  assert.ok(manualMarkup.includes('Checklist verification'));
  assert.equal(manualMarkup.includes('Source unavailable'), false);
  assert.equal(manualMarkup.includes('Open source page'), false);
  user = { ...applicant, access: 'consumer', role: 'applicant' }; await context.KB.store.login(user.email, 'synthetic');
  for (const page of ['MyReports', 'MyReport']) {
    const markup = renderToStaticMarkup(React.createElement(P[page], { appRef: job.ref }));
    assert.ok(markup.includes('Local assessment') || markup.includes('Manual review required')); assert.equal(markup.includes('Submission complete'), false);
  }
  assert.equal(/https?:\/\//.test(index), false, 'Offline entry point has no CDN dependencies');
});
