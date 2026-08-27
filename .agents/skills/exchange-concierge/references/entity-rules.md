# Entity-specific reconciliation rules

Read only the sections relevant to the surfaces affected by the current run.

## Journey and routine setup

If the handoff contains placeholder journey fields, or authorized evidence proves a different school, city, country, or date range, create a private `journey` update proposal. Country, time zones, primary currencies, fixed interface copy, and artwork are setup concerns; leave `setupSnapshot.lockedForRoutineReconciliation` unchanged unless the user explicitly asks for reconfiguration.

## Resources and pasted URLs

- A new person's resource library begins empty. Never inherit another person's destination, school, city, or travel bookmarks.
- Authorized upload/message resources use `origin: user-upload`, remain `private`, and cite a concise label without revealing a private link or source contents.
- Web research uses `origin: ai-research` and must match the actual nationality, destination, school, dates, or explicit user need.
- Give each resource a self-contained `description` and substantive `details`: who it applies to, preparation, steps, deadlines, and what must be rechecked. Add 4–12 de-identified `searchTags` using likely queries and synonyms.
- A pasted URL is a private `resource-intake`, not a verified resource. Accept ordinary HTTP(S) only; reject embedded credentials or token-like parameters. Propose the resource separately, then visibly update the intake to `status: processed` only after every cross-surface effect is covered.
- Do not author processing timestamps or delete intake records; the website owns retention.

## Personal ticket, baggage, and packing

- Never assume airlines, fares, segments, piece counts, weights, through-checking, or carry-on policy.
- Read a personal ticket or attachment only when that exact content is authorized. Extract the printed allowance and use current carrier guidance only to clarify ambiguity.
- Create `flight-allowance` proposals for the actual ticket or segment group. If this changes the packing workspace, make separate visible `bag` proposals.
- Do not include passenger names, ticket/booking/loyalty numbers, payment data, barcodes, or ticket text. A sanitized segment, allowance, check date, and generic source label are sufficient.
- Without authorized personal ticket evidence, keep limits unconfirmed. General airline pages and videos cannot prove the purchased allowance.
- Adapt packing suggestions to destination, season, housing, and user. Experience sources may discover items but cannot establish restrictions or allowances.

## Base budget

- Exchange-wide money uses `budget-item`; a leisure trip's money stays in `travel-plan.budget`.
- Preserve category, currency, and cadence. Use `basis: confirmed` only for an explicit contract, notice, ticket, receipt, or direct confirmation. Use `estimate` only when clearly labeled; otherwise keep `unset` with amount `0`.
- Record concise `sourceLabel`, `verifiedAt`, and redacted notes. Every budget proposal is `private`.

## Study events and travel plans

- School deadlines, orientation, enrolment, exams, and mandatory dates belong in `study-event` and must be checked against travel conflicts.
- Within a selected leisure trip, use `travel-plan.stays` for hotel bases and `travel-plan.references` for Maps lists, Sheets, guides, or booking reference pages.
- Preserve the user's daily itinerary unless they explicitly ask the Agent to schedule or rearrange it.

## Tasks and status claims

- Match evidence to the narrowest truthful state. `submitted` does not mean `approved`; `booked` does not mean `completed`; a reminder is not proof of payment.
- Keep the current manual status when evidence is ambiguous and use a low-confidence confirmation proposal or `needs-confirmation` coverage gap.
- Health-related reminders may be stored as private tasks, but never include diagnoses, medical documents, or treatment details.
