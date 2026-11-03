# Local intelligence integration

The running application uses the **local** provider and a Node backend. See [README.md](README.md) for installation, model configuration, LGU policies, security, synchronization and validation results.

The original `KB.ai` seam is retained:

```text
Scan screen → KB.ai.analyze({ files, applicationType, onProgress })
  → local provider → authenticated POST /api/assessments
  → durable local job
  → Tesseract OCR → Ollama extraction → grounding/schema validation
  → versioned deterministic rules → findings → human review
```

The POST returns HTTP 202 and an assessment ID. The provider polls `GET /api/assessments/:id` and reports actual processing states. Files and results are stored encrypted on the server. Refreshing or closing the tab does not erase accepted jobs.

The normalized result retains `findings`, `documents`, `missingDocuments`, `model` and the server `application` view. `KB.store.addScanned()` adds that server record to the existing screens. Applicant/reviewer queues reload through the authenticated API; they are not stored in localStorage. No filename-based mock fallback is used.

Findings carry `category`, `verificationStatus`, `ruleId`, document/page references, quotes, and the legacy `a`/`b` display sources. Sources can have `page: null` for missing documents or checklist rules. Actual source pages have authenticated `sourceUrl` links. Extracted fields retain normalized/raw values, quotes, confidence and verification status; unavailable values remain null.

The Ollama adapter is in `server/extraction.mjs`. Replace its `available()` and `extract(page, policy)` implementations to support another local runtime without rewriting compliance rules. The engine constructor also accepts an injected `extractor` for tests. Production extraction must retain schema and evidence checks; a model response must never be treated as an official application decision.

Configure models using `.env`; configure rules using separately versioned LGU JSON. Changing a policy does not alter an assessment already in progress. Human findings and application decisions are authenticated backend writes and audited. Forwarding records a forwarding event and leaves `decision: null`.

The old HTTP/mock adapters and fixtures are not loaded by `index.html`. Client-side demo accounts, seeded queues, fabricated field fallbacks and automatic approvals have been removed from the active application path.
