---
name: exchange-email-intake
description: Capture bounded exchange email evidence from the current user's explicitly authorized mailbox scope and pass privacy-safe facts to Exchange Concierge.
---

# Exchange Email Intake

Use this skill only for mailbox evidence. Work for any host country, school, provider, and current-user mailbox; do not inherit the template author's journey, accounts, tokens, sender list, or archive paths.

## Compact handoff context

When available, use the latest `work/exchange-concierge-context.json` for the narrow journey context needed to choose a query. Keep complete state and handoffs on disk. If only an authorized full export is supplied, extract just the relevant journey/profile fields locally; do not print the full `state` or `setupSnapshot.profile`. Use Concierge's narrow inspection when an exact website entity is needed. An exact-message request with sufficient context can proceed without a website handoff; refresh website state before generating proposals, not as a prerequisite to reading that authorized message.

## Authorization boundary

Before the first mailbox read, resolve and show the current user's exact account, message or query, date, body, attachment, and archive scope as defined in the reference below. Authorization for one account, message, folder, or attachment never covers another; never widen it or request passwords, app passwords, OAuth clients, refresh tokens, or access tokens.

## Intake and handoff

Read [the detailed intake and counting rules](../exchange-concierge/references/email-intake.md) before the first mailbox read. That reference is authoritative for access order, incremental search, query limits, deduplication, privacy filtering, and completion counts; do not widen or restate those rules here.

Extract concise facts, dates, deadlines, amounts, currencies, status, blockers, itinerary facts, and source labels. Distinguish submitted, received, paid, approved, booked, and completed. Keep raw bodies, headers, account addresses, provider IDs, attachments, booking references, payment references, and exact addresses in private working files only; default email-derived proposals to `private`.

Return the bounded evidence report to `$exchange-concierge`, never directly to browser state. Validate any final import against the exact current handoff kept on disk by Concierge.

For a single-message inspection without an archive request, answer from that message without exporting mail or rebuilding an index. Honor explicit no-write/no-push limits; otherwise genuinely new journey evidence follows the normal pending-proposal workflow. Reuse resolved authorization rather than asking for the same permission again.

For batch search or archiving, report each account/query scope with the reference-defined counts, files, attachment access, and validation status (`pass`, `partial`, or `blocked`). For a single-message inspection, give the bounded answer and any access gap; do not require archive counts or a full archive checklist. Never claim mailbox coverage when a connector, query, or message read failed.
