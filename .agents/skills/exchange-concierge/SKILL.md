---
name: exchange-concierge
description: Automatically collect, reconcile, research, or update an exchange journey from explicitly authorized files, emails, calendars, official school, city, government, airline, and provider sources plus experience videos. Use for AI-assisted progress detection, current resource research, seasonal packing recommendations, schedule-aware travel suggestions, or creating a reviewable Exchange Companion import bundle without exposing private records.
---

# Exchange Concierge

Turn authorized exchange evidence into proposed changes for Exchange Companion. The website handoff JSON is the source of truth for current progress; Codex performs collection, research, classification, and drafting, then returns one reviewable import JSON to the same website. Never silently mark an inference as confirmed or overwrite a manual record.

## Workflow

1. Read `app/lib/types.ts` and the exact latest `exchange-concierge-input-*.json` downloaded from the website. New handoffs are self-describing envelopes: use `state` as the authoritative current progress, `editableSurfaces` as the website coverage map, and `setupSnapshot` only as first-use context. Legacy raw `AppState` backups remain supported. If the handoff still contains placeholder journey fields or authorized evidence proves a different school, city, country, or date, create a private `journey` update proposal instead of carrying demonstration content forward.
2. Confirm the exact folders, files, mailboxes, Drive files, calendars, queries, URLs, and date ranges the user authorized. Do not broaden scope. For email, invoke `$exchange-email-intake`; it must discover and use the current user's connected accounts instead of assuming the repository author's accounts.
3. Treat user-confirmed facts, manual website edits, and previously accepted proposals as durable evidence.
4. Inventory new school, government, city, provider, booking, ticket, and user evidence without copying original attachments or full email bodies into the website bundle.
   Treat every `resourceIntake` item in the authorized backup as an exact user-authorized URL. Process pending items only; do not follow it as permission to scan the user's account or unrelated links.
5. Research current official sources for the actual school, city, nationality, host country, exchange term, visa or residence, insurance, financial proof, housing, transport, customs, academics, and return process. Prefer material at or after the profile's research cutoff. A current evergreen official page with no publication date is allowed when its `capturedAt` records today's check and its summary notes that no source-updated date was available.
6. Search YouTube and personal reports for seasonal packing, daily-life context, and common omissions. Never treat experience content as legal, customs, medicine, airline, visa, fee, or deadline authority.
   The template may begin with the two experience-only sources in `config/packing-inspiration.json`. Use them only as private item-discovery prompts, then adapt every recommendation to the current destination, season, housing, and user. Put useful results into ordinary `packing-item` proposals; never surface the video, creator, channel, title, or promotional link in the website. They never establish kilograms, piece counts, customs, or carrier rules.
7. Compare each finding with every website surface: journey identity and dates, tasks, base budget, resources, packing, ticket allowances and physical bags, study events, and travel conflicts. Produce small `add` or `update` proposals with evidence, captured date, confidence, and privacy. Never report the run as complete merely because one surface changed.
8. Run a pre-write privacy pass over source labels, notes, summaries, URLs, and values. Remove account addresses, full excerpts, addresses, booking or payment references, and other identifiers unless a private task field strictly requires the minimal value. Treat the whole bundle as private working data even when an individual generic proposal is marked `shareable`.
9. Before drafting, run `python3 .agents/skills/exchange-concierge/scripts/initialize_import_bundle.py path/to/exchange-concierge-input.json outputs/exchange-companion-import.json`. This deliberately replaces any stale output shell with the handoff's exact `outputTemplate`; never copy root metadata from `outputs/`, `tests/fixtures/`, examples, or an earlier run. Add evidence and proposals to that fresh shell, then run `python3 .agents/skills/exchange-concierge/scripts/validate_import_bundle.py outputs/exchange-companion-import.json path/to/exchange-concierge-input.json`. When a website handoff exists, omitting the second validator argument is not allowed.
10. Inspect the validator result and the raw field-level diff. Report high, medium, and low confidence counts plus private and shareable counts. Also report each website surface as `updated`, `no new evidence`, or `needs confirmation`, so the user can distinguish a full reconciliation from a partial one. Leave every new proposal in `pending` state for website review; the user may apply individually or use the website's reviewed batch action.

## Website handoff loop

1. In the signed-in website, open **AI 幫我整理** and choose **準備給 Codex 的整理包**.
2. Require the downloaded `exchange-concierge-input-YYYY-MM-DD.json` in the same Codex task. Read its `agentContract`, `editableSurfaces`, and `state`; do not substitute an older backup when the user says the website is newer.
3. Resolve only the additional sources the user explicitly authorizes. The handoff itself authorizes its pending `resourceIntake` URLs, but not unrelated pages or accounts.
4. Initialize, produce, and validate `outputs/exchange-companion-import.json` against that exact handoff. Preserve `outputTemplate.journeyScope` byte-for-byte; a structurally valid bundle with copied example metadata is still a failed run.
5. Tell the user to import the result on the same AI page. Importing is a review step; applying is a separate, reversible step. A successful Codex run that never returns an import file has not updated the website.

## Portable email rule

- Invoke `$exchange-email-intake` for mailbox work, then reconcile its bounded evidence report here. The detailed fallback rules remain in [email-intake.md](references/email-intake.md).
- Prefer the environment's Gmail connector or connected mail app. It must authenticate as the current user; never reuse repository-author account names, token filenames, OAuth clients, or credentials.
- On first use, ask the user to authorize named mailbox accounts plus sender, domain, keyword, label, and date-range boundaries. Authorization for one mailbox never covers another.
- Support an exact-message scope. If the user authorizes two messages, read only those two messages and do not widen the request into a mailbox search. Separately ask whether each message body, attachment filenames, or attachment contents may be inspected.
- If no mail connector is available, accept an explicitly authorized Gmail Takeout `.mbox`, `.eml` folder, or user-provided export. Do not ask for a Gmail password or paste access tokens into chat.
- Keep raw message bodies, message IDs, attachment names, and account addresses in a private working area such as `work/email-capture/`. Only concise facts and source labels may enter the import bundle.
- Use [email-sources.example.json](assets/email-sources.example.json) as an optional per-user intake template. Copy it to a gitignored private path before filling it; never edit the distributed example with real account data.

## Evidence rules

- `high`: explicit current official document, school or provider message, booking confirmation, or direct user confirmation.
- `medium`: a strong inference supported by consistent evidence but still requiring review.
- `low`: incomplete, old, conflicting, or experience-only information.
- Use the date the source was actually checked as `capturedAt`.
- Give every proposal at least one `evidenceId`.
- State uncertainty in the summary. If the evidence only proves submission, do not mark approval or completion.
- Keep manual or accepted values until newer contradictory evidence supports a visible correction proposal.

## Personal ticket and baggage rule

- Never assume the repository owner's airlines, number of flights, baggage pieces, kilograms, fare family, through-check arrangement, or carry-on policy.
- Read an e-ticket, itinerary receipt, or booking attachment only when the current user explicitly authorizes that exact file or attachment content. Extract the user's actual segments and the allowance printed for that booking, then cross-check current carrier guidance when the ticket is ambiguous.
- Create one or more `flight-allowance` proposals for the applicable ticket or segment group. When the confirmed allowance changes the packing workspace, create separate visible `bag` add/update proposals; do not mutate bag limits as a hidden side effect.
- Do not place passenger names, ticket numbers, booking references, loyalty numbers, payment data, barcodes, or full ticket text in the bundle. Airline, sanitized segment, allowance, verification date, and a generic source label are sufficient.
- If no personal ticket has been authorized, leave flight allowances empty and label every limit unconfirmed. Airline websites or YouTube videos cannot prove which fare and allowance the user purchased.

## Personal resource and URL intake rule

- Start from an empty destination resource library. Do not carry Germany, Stuttgart, HdM, or any previous user's bookmarks into a new person's state.
- Resources derived from an authorized upload or message use `origin: user-upload`, stay `private`, and cite a concise file/email source label. Never expose the original file, message, or private download URL.
- Resources found through current web research use `origin: ai-research`. They must match the profile's actual country, city, school, nationality, dates, or an explicit user need; cite the checked page and date.
- Every resource proposal contains a concise `description` summary plus a substantive `details` explanation covering who it applies to, what to prepare, the practical steps, relevant deadlines, and what must be rechecked. Do not pad missing facts; explicitly label uncertainty and keep every factual claim traceable to evidence.
- A URL pasted into the website is a private `resource-intake` record, not a verified resource. Validate that it is ordinary HTTP(S), contains no embedded credentials or token-like query parameters, and then propose a separate `resource` add/update for review. Mark the intake `processed` only in a visible proposal after the resource proposal exists.
- Use `shareable` only for de-identified public information. Personal portals, uploads, signed links, account pages, and email-derived administration remain private even when their summary is useful.

## Base budget rule

- Use `budget-item` proposals for the website's exchange-wide Money map. Do not place these amounts inside `travel-plan.budget`, which belongs to a specific leisure trip.
- Preserve each item's `category`, `currency`, and `cadence`. Use `basis: confirmed` only for an explicit contract, school/provider notice, ticket, receipt, or direct user confirmation. Use `basis: estimate` for a clearly labeled planning amount, and keep `basis: unset` with amount `0` when evidence is insufficient.
- Record a concise `sourceLabel`, `verifiedAt`, and non-sensitive `notes`. Do not copy account, payment, booking, or address identifiers. All `budget-item` proposals stay `private`.
- First-use country, time zones, primary currencies, fixed interface copy, and artwork belong to `$create-exchange-companion`. Treat `setupSnapshot.lockedForRoutineReconciliation` as authoritative unless the user explicitly asks to redesign or reconfigure the cloned website.

## Privacy and sharing

Default administrative progress, email-derived details, addresses, references, finances, health, housing, study commitments, and account information to `private`.

Only these may be `shareable` after removing identifiers:

- public school, city, government, or provider resources;
- generic packing suggestions and restrictions;
- sanitized flight facts explicitly selected by the user;
- selected travel plans, maps, notes, and trip packing lists.

Never include scans, credentials, document contents, full message bodies, access tokens, medical files, private photos, exact housing identifiers, or family contacts. `privacy: private` is classification metadata, not encryption or redaction. A share must be explicit, scoped, previewable, reversible, and off by default.

## Output contract

Read [import-bundle-schema.md](references/import-bundle-schema.md) before producing JSON. Use run-versioned, namespaced proposal IDs so a later import cannot replace accepted or dismissed history. Use entity-prefixed add IDs. For `add`, provide the complete website entity; for `update`, provide `targetId` and only changed fields. Map responsible providers to the existing evidence kinds: government and national agencies as `official`, universities as `school`, municipalities as `city`, and commercial providers as `research` with an explicit provider label. Personal ticket facts may support private or explicitly sanitized shareable `flight-allowance` proposals, but the ticket document itself stays private.

When evidence is insufficient, create a low-confidence proposal asking for confirmation instead of inventing a value. A successful bundle is a review inbox, not an irreversible mutation.
