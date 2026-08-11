---
name: exchange-email-intake
description: Search, read, deduplicate, and summarize exchange-related email evidence from the current user's explicitly authorized mailbox accounts, exact messages, sender domains, queries, labels, and date ranges. Use when an exchange student asks to find application, admission, visa, housing, insurance, finance, flight, course, arrival, or return progress in Gmail, Outlook, MBOX, or EML and pass privacy-safe evidence to Exchange Concierge without inheriting the template author's country, accounts, tokens, or sender list.
---

# Exchange Email Intake

Collect only the current user's authorized exchange email evidence and return a bounded, auditable result for `$exchange-concierge`. Work for any host country, school, provider, and mailbox account.

## Workflow

1. Read the latest `exchange-concierge-input-*.json` when provided. Use `state.journey` and `setupSnapshot.profile` only to understand the user's actual school, country, city, dates, and likely providers.
2. Resolve the authorization boundary before reading:
   - named current-user mailbox account or connected-account label;
   - exact messages, or sender/domain/query/label plus inclusive date range;
   - permission for message bodies, attachment filenames, and attachment contents separately;
   - whether a private local archive is requested.
3. Show the resolved boundary before the first mailbox read. Authorization for one account, message, folder, or attachment never covers another.
4. Use access methods in this order: current-user mail connector; explicitly authorized `.mbox`; explicitly authorized `.eml` folder; user-pasted messages. Never request passwords, app passwords, OAuth clients, refresh tokens, or access tokens.
5. Inventory relevant existing authorized archives before searching for new mail. Search metadata first, newest first, and incrementally. Use separate bounded query packs for housing, each airline, school fees, courses/calendar, visa/residence, insurance/finance, arrival, and return; broad grouped `OR` queries are discovery only. Read at most 20–50 matches per query unless the user authorizes a wider backfill. Deduplicate provider IDs only in the private working inventory.
6. Extract concise facts, dates, deadlines, amounts, currencies, status, blockers, itinerary facts, and source labels. Distinguish submitted, received, paid, approved, booked, and completed; do not promote one status into another.
7. Keep raw bodies, headers, account addresses, provider IDs, attachments, booking references, payment references, and exact addresses outside the website bundle. Default every email-derived proposal to `private`.
8. Return the evidence inventory to `$exchange-concierge`; do not directly edit browser state. If a current handoff is available, the final import must be validated against that exact handoff.

Read [the detailed intake and counting rules](../exchange-concierge/references/email-intake.md) before the first mailbox read.

## Completion report

Report each authorized account or exact-message scope separately:

- query or exact-message boundary;
- matched, read, relevant, duplicate, new, and failed counts for each query pack;
- attachment filenames or contents inspected;
- private working files created or updated;
- material facts passed to Exchange Concierge;
- validation status: `pass`, `partial`, or `blocked`, with every gap explained.

Use `pass` only when the complete authorized scope was read and all count differences are explained. Never claim mailbox coverage when a connector, query, or message read failed.
