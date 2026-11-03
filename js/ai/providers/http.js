// "http" provider: sends the uploaded files to YOUR backend and expects an AnalysisResult back as JSON
// (shape documented at the top of ai/index.js, example in ai/sample-response.json).
//
// The backend is where the real model call lives (OpenAI / Anthropic / OCR + rules / anything), so API keys
// stay on the server. Browser code must never hold a model API key.
//
// Request  : multipart/form-data
//              files   (repeated)  the uploaded PDF/JPG/PNG files
//              context (JSON)      { applicant: {name,email,role}, resubmission: boolean, previousFindingKeys: string[] }
// Response : 200 application/json -> AnalysisResult
(function () {
  KB.ai.register('http', async ({ files, previous, applicant, signal, config }) => {
    const isGet = String(config.method).toUpperCase() === 'GET';
    let body;
    if (!isGet) {
      body = new FormData();
      files.forEach((f) => body.append('files', f, f.name));
      body.append('context', JSON.stringify({
        applicant, resubmission: !!previous, previousFindingKeys: previous ? previous.findings.map((f) => f.key) : [],
      }));
    }
    const res = await fetch(config.endpoint, { method: config.method, body, signal, credentials: config.credentials, headers: config.headers() });
    if (!res.ok) throw new KB.ai.AIError(`The AI service returned an error (${res.status}). Please try again.`);
    return res.json();
  });
})();
