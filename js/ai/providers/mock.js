// "mock" provider: the original prototype behaviour. No OCR, no network. Findings are simulated
// deterministically from the file names so demos are repeatable. Remove together with ai/fixtures.js
// when the real provider is live.
(function () {
  const T = KB.fixtures.TEMPLATES, mk = KB.fixtures.finding;
  const delay = (ms, signal) => new Promise((res, rej) => {
    const id = setTimeout(res, ms);
    signal && signal.addEventListener('abort', () => { clearTimeout(id); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });

  KB.ai.register('mock', async ({ names, previous, signal, config }) => {
    await delay(config.mockDelayMs, signal);
    const keys = Object.keys(T);
    const sig = KB.ai.signature(names);
    const attempt = previous ? (previous.attempts || 1) + 1 : 1;
    let findings;
    if (previous && previous.sig === sig) {
      // Same files as the held attempt: nothing was corrected, so the same inconsistencies come back.
      findings = previous.findings.map((f) => mk(f.key));
    } else {
      const seed = (sig + (previous ? '#' + attempt : '')).split('').reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
      const first = seed % keys.length;
      if (previous) findings = seed % 4 === 0 ? [mk(keys[first])] : []; // corrected files: usually clean
      else if (seed % 5 === 0) findings = [];
      else findings = [keys[first]].concat(seed % 2 === 0 ? [keys[(first + 2) % keys.length]] : []).map((k) => mk(k));
    }
    return { findings, documents: [], missingDocuments: [], model: 'mock' };
  });
})();
