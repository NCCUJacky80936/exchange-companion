---
name: exchange-concierge
description: Collect, reconcile, research, or update an exchange journey from explicitly authorized files, email, calendars, official sources, and experience content. Use for progress detection, current resource research, packing or travel suggestions, and reviewable Exchange Companion proposals without exposing private records.
---

# Exchange Concierge

Convert authorized evidence into small `pending` proposals for the Exchange Companion review inbox. Never silently apply a proposal, mark an inference confirmed, or overwrite a manual or previously accepted value.

## Choose the smallest run

- **Targeted**: use for a direct user update, one new file/message/URL, or a focused question. Reconcile only that event and its cross-surface dependencies in the same turn.
- **Full**: use for the weekly automation, a first import, or an explicit comprehensive audit. Check every authorized evidence category and all website surfaces.
- A direct event must not wait for the weekly run. A weekly run with no new evidence should finish quietly with no proposal.

## Compact workflow

Run from the Exchange Companion repository.

1. Prepare a fresh, compact context. Cloud pull is the default:

   ```bash
   python3 .agents/skills/exchange-concierge/scripts/concierge_run.py prepare \
     --mode targeted \
     --intent "USER REQUEST" \
     --keyword "KEY TERM" \
     --affected-surface tasks
   ```

   For the weekly audit:

   ```bash
   python3 .agents/skills/exchange-concierge/scripts/concierge_run.py prepare \
     --mode full \
     --intent "weekly exchange evidence audit" \
     --scan-root ..
   ```

   If no private cloud connection is available, place the exact latest website handoff at `work/latest-exchange-companion-handoff.json` and add `--no-pull`. Never substitute an old backup when the user says the website is newer.

2. Read only `work/exchange-concierge-context.json` for triage. The complete private handoff stays on disk for validation. Do not print or load it wholesale into model context.

3. When exact current values are needed, inspect the narrowest entity set:

   ```bash
   python3 .agents/skills/exchange-concierge/scripts/concierge_run.py inspect \
     --surface tasks --keyword "driving"
   ```

4. Research or read only sources within the user's explicit scope. Treat `pendingResourceIntake` entries in the compact context as permission for those exact URLs only. For email, use the project email-intake skill and [email-intake.md](references/email-intake.md); it must use the current user's authorized accounts, not repository-author credentials.

5. Edit the freshly initialized files:

   - `outputs/exchange-companion-import.json`
   - `outputs/exchange-companion-coverage.json`

   Read [import-bundle-schema.md](references/import-bundle-schema.md) before authoring proposal JSON. Read only the applicable section of [entity-rules.md](references/entity-rules.md). For a full run, also read [evidence-coverage.md](references/evidence-coverage.md).

6. Finalize. With a valid private connection, submit to the review inbox:

   ```bash
   python3 .agents/skills/exchange-concierge/scripts/concierge_run.py finalize --push
   ```

   `finalize` validates the bundle against the complete handoff, audits all surfaces, writes a field-level run summary, and updates the local checkpoint only after a successful push or a valid no-change run. If a revision conflict occurs, prepare again, reconcile against the new revision, and finalize again. Never force-push stale state.

## Reconciliation contract

- `state` is the current website truth; `baseRevision` is the concurrency guard; `editableSurfaces` is the coverage list. `setupSnapshot` is first-use context only.
- Manual edits, direct confirmations, and accepted proposals are durable evidence. Change them only through a visible correction proposal supported by newer evidence.
- Update an existing entity when it represents the same fact. Create a new stable entity ID only for a genuinely new record.
- Every source and proposal needs a unique shared run suffix such as `run-20260814-143000-r1`. Every proposal needs at least one `evidenceId` and must start as `pending`.
- `add` contains the full website entity. `update` contains `targetId` plus changed fields only.
- Classify confidence as: `high` for explicit current official, provider, booking, or user-confirmed evidence; `medium` for a strong inference; `low` for incomplete, old, conflicting, or experience-only evidence.
- Use the actual check date as `capturedAt`. If evidence proves only submission, do not infer approval or completion.

## Dependency closure

For a targeted run, include the affected surface plus these dependencies:

- housing evidence → task, resource, and base budget;
- ticket or flight evidence → task, resource, ticket price/base budget, flight allowance, and physical bags;
- paid school/provider fee → task and base budget;
- study date → study event and travel conflict check;
- packing rule → packing item, physical bags, and personal flight allowance comparison;
- pasted URL → resource intake, resource, and every surface affected by its actionable facts.

Do not mark a URL processed merely because a resource card exists. If evidence says `paid`, `booked`, or `confirmed`, or provides an amount, either propose the corresponding field change or mark the relevant coverage row `needs-confirmation` with the precise missing evidence.

Every coverage row must be `updated`, `no-new-evidence`, or `needs-confirmation`, with concrete checks. In a zero-proposal run, all rows must be `no-new-evidence`, and the bundle must contain no unused sources.

## Evidence boundaries

- Prefer current official school, city, government, airline, and provider sources. Current evergreen official pages are acceptable when today's check date is recorded and the lack of a page update date is noted.
- Experience reports and the configured YouTube inspiration sources may suggest ordinary packing or daily-life ideas only. They never establish law, medicine, fees, deadlines, customs, ticket allowances, or carrier rules, and their promotional metadata must not appear on the website.
- Mailbox authorization is account-, sender/domain-, query-, and date-bounded. Exact-message permission does not authorize a wider mailbox search or attachment reading.
- Keep raw emails, message IDs, attachment names, documents, and credentials in gitignored private work areas. The proposal bundle receives concise, de-identified facts only.
- The cloud connection is a private revocable credential. Never commit, print, quote, or include it in a bundle. It can read the latest state and submit pending proposals only; it cannot apply them.

## Privacy gate

Default administration, health, housing, finance, email-derived facts, study commitments, addresses, references, and account information to `private`.

Only de-identified public resources, generic packing guidance, explicitly selected sanitized flight facts, and selected travel plans may be `shareable`. Never include credentials, scans, full messages, medical files, payment or booking identifiers, private photos, exact housing identifiers, or family contacts. `privacy: private` is classification, not redaction.

Before finalizing, inspect source labels, notes, summaries, URLs, and proposal values for identifiers. Sharing must remain explicit, scoped, previewable, reversible, and off by default.

## Delivery and fallback

- Cloud mode: a successful run ends with a validated push to the website's proposal inbox. The user still reviews, applies, ignores, or undoes each proposal.
- Offline mode: validate against the exact downloaded handoff, then return `outputs/exchange-companion-import.json` for manual import. Import and apply remain separate steps.
- Missing/revoked connection, repeated revision conflict, source access failure, or incomplete evidence requires a concise user notification. Do not claim the inbox is current.
- When a run succeeds with no new evidence, do not send a noisy success message.
