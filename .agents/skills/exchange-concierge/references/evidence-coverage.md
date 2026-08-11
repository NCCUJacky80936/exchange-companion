# Evidence coverage and reconciliation

Use this reference before generating every import bundle. The website handoff describes current state and review history; it does not prove that older archived mail, local attachments, or receipts were searched.

## 1. Build the authorized inventory

Start with a bounded file inventory. Search filenames and text separately so PDFs, receipts, tickets, and sender archives are not missed merely because they are not new.

| Category | File and archive cues | Required surface checks |
| --- | --- | --- |
| Housing | rent, lease, contract, dorm, receipt, deposit, Mietvertrag, Miete, Kaution, Wohnheim | task, resource, base-budget |
| Flight | airline names, e-ticket, itinerary, booking, receipt, fare, flight number | task, resource, base-budget, flight-allowance, bags |
| Baggage | baggage, luggage, checked, carry-on, cabin, personal item, kg, piece, allowance | flight-allowance, bags, packing |
| School fees | semester fee, tuition, registration, enrollment, paid, receipt, invoice | task, base-budget, resource |
| Visa and residence | visa, consulate, appointment, passport, residence permit, Auslandsportal | task, resource, study-event when scheduled |
| Insurance and finance | insurance, policy, blocked account, transfer, confirmation, activation | task, resource, base-budget when an amount exists |
| Courses and calendar | course list, Learning Agreement, orientation, calendar, lecture, exam, deadline | task, resource, study-event, travel conflicts |
| Arrival and return | arrival, pickup, registration, check-in, move-in, deregistration, departure | task, resource, study-event or travel conflict when dated |

Use `rg --files` for inventory and `rg -i` for searchable text. For PDFs or office files, extract text with the appropriate document tool or existing project workflow. Do not infer absence from a text search that cannot read the file format.

## 2. Search mail without grouped-query luck

Use `$exchange-email-intake`. Search each authorized account separately and run separate queries for each actual provider or domain. Begin with exact senders/domains found in the handoff, project archives, and file inventory; then use bounded subject/keyword queries for gaps.

Examples of query shapes, not reusable identities:

```text
from:(@housing-provider.example) after:YYYY/MM/DD before:YYYY/MM/DD
from:(@airline.example) (ticket OR itinerary OR baggage OR receipt) after:YYYY/MM/DD before:YYYY/MM/DD
from:(@school.example) (fee OR course OR orientation OR enrollment) after:YYYY/MM/DD before:YYYY/MM/DD
```

Do not combine unrelated providers into one large `OR` query and call the result complete. Record per query: account label, exact query, matched, read, relevant, duplicate, new, and failed. Read relevant existing archived messages even when `new = 0`.

## 3. Complete the coverage manifest

Initialize `outputs/exchange-companion-coverage.json` with the audit script. For every `editableSurfaces[].id`, set exactly one status:

- `updated`: the import bundle contains a matching proposal.
- `no-new-evidence`: the listed checks were completed and the current state requires no proposal.
- `needs-confirmation`: the checks were completed but the exact missing or conflicting evidence is named.

Each surface must have non-empty `checks`. Use concise source groups such as `handoff state`, `authorized housing contracts`, `archived airline confirmation emails`, or the exact bounded mailbox query. Use `evidenceIds` only for evidence included in the import bundle. A `needs-confirmation` entry must have non-empty `missingEvidence`.

## 4. Apply cross-surface gates

- Housing confirmed or paid → housing task/resource + confirmed housing budget or an explicit confirmation gap.
- Ticket booked or paid → flight task/resource + fare budget + ticket allowance or an explicit confirmation gap.
- Ticket allowance found → physical bag plan check; distinguish ticket entitlement from a manual cross-segment packing plan.
- Fee paid → task status/evidence + confirmed base-budget item.
- Dated mandatory school or consular event → study-event check.
- Travel plan dates → compare against orientation, teaching, exam, deadline, and other mandatory study events.
- Packing changes → use the strictest applicable allowance across separately ticketed segments; never add weights from incompatible piece and weight systems.

The audit script catches visible mapping omissions. It cannot prove that an unlisted private source was searched, so the coverage manifest must truthfully record the actual checks.

## 5. Deliver only after both validators pass

Run the schema validator first and the coverage audit second. Do not hand off the import JSON when either reports `INVALID`. Explain a `needs-confirmation` gap instead of guessing a value.
