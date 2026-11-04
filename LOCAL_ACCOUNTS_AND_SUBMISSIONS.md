# Applicant and LGU reviewer workflow

KalaBASA supports administrator, reviewer and applicant accounts. Administrators create accounts assigned to their LGU. Applicants see their own applications; reviewers and administrators see applications explicitly submitted to their LGU, including the original PDF files, extracted fields, page evidence and findings. Other applicants and reviewers from another LGU cannot access them.

The installation creates an initial administrator account, not shared reviewer/applicant passwords. Sign in as that administrator, open **Profile → LGU administration → Configure requirements and accounts**, then use **Create local account**. Choose `applicant` for a business permit applicant or `reviewer` for LGU personnel. Set a separate email/name and a password of at least 12 characters for each person.

The administration panel lists the accounts assigned to this LGU and their roles, without exposing passwords or password hashes. Applicants can change their own password under **My account → Security & password**.

The local workflow is:

1. The applicant signs in and uploads PDF requirements under **Scan document**.
2. Local processing generates the assessment. This is a private draft until submission.
3. In **My reports**, the applicant opens the assessment and selects **Submit to LGU**.
4. The local service atomically records a submission receipt and makes the same documents available to authorized reviewers in that LGU. It does not send them to another server or approve the application.
5. The LGU reviewer signs in, opens **Home → Received LGU submissions** or **Applications**, and can open each original PDF and its page evidence. The queue refreshes about every 15 seconds while visible; reloading also refreshes it.
6. Only authorized reviewers can record finding reviews or official decisions. The applicant can see the recorded outcome in their own report.

Repeated clicks or lost responses return the same local submission receipt. Original files are shared through authenticated access rather than copied into a public folder. Submitted assessments cannot be reprocessed under the applicant's draft workflow, preserving what the LGU received. Access, submission and review actions are audited.

`KB_SUBMISSION_MODE=local` selects the shared local LGU workspace. This is the default when no external synchronization URL is configured. `KB_SUBMISSION_MODE=remote` keeps the existing encrypted outbox/acknowledgement flow to a separate LGU receiver, using `KB_SYNC_URL` and `KB_SYNC_TOKEN`. For backward compatibility, configuring a sync URL selects remote mode when no explicit mode is provided. A record already queued for remote delivery cannot also be submitted locally.

All users of this shared workflow must reach the **same server and database**. On one machine, use separate browser profiles or a normal/incognito window to test applicant and reviewer sessions; ordinary tabs share the login cookie. This installation listens at `http://127.0.0.1:3210`, which is accessible only on this computer. Applicants on other computers require an administrator-managed LGU server deployment with HTTPS and appropriate access controls. Their own `localhost` would refer to their machine, not the LGU server.

Validation: all 30 automated tests passed, including a dedicated two-role PDF submission test. It verifies private drafts, submission receipt idempotency, reviewer access to the original PDF bytes and findings, applicant visibility of the review outcome, and denial of access to other applicants/unrelated LGUs. The local handoff creates no remote outbox entry; explicit remote mode retains the previous queued-delivery behavior.
