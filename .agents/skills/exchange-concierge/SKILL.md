---
name: exchange-concierge
description: Automatically collect, reconcile, research, or update an exchange journey from explicitly authorized files, emails, calendars, official school, city, government, airline, and provider sources plus experience videos. Use for AI-assisted progress detection, current resource research, seasonal packing recommendations, schedule-aware travel suggestions, or creating a reviewable Exchange Companion import bundle without exposing private records.
---

# Exchange Concierge

Turn authorized exchange evidence into proposed changes for Exchange Companion. In the preferred cloud flow, a revocable one-time connection lets Codex pull the latest versioned website state and submit a review-only proposal run back to the same account. The JSON download/upload flow remains an offline fallback. Never silently mark an inference as confirmed or overwrite a manual record.

## Workflow

1. Read `app/lib/types.ts`. If `work/exchange-concierge-connection.json` exists, first run `python3 .agents/skills/exchange-concierge/scripts/concierge_cloud_sync.py pull`; use the resulting `work/latest-exchange-companion-handoff.json`. Otherwise require the exact latest `exchange-concierge-input-*.json` downloaded from the website. Handoffs are self-describing envelopes: use `state` as the authoritative current progress, `baseRevision` as the concurrency precondition, `editableSurfaces` as the website coverage map, and `setupSnapshot` only as first-use context. Legacy raw `AppState` backups remain supported only in offline mode. If the handoff still contains placeholder journey fields or authorized evidence proves a different school, city, country, or date, create a private `journey` update proposal instead of carrying demonstration content forward.
2. Confirm the exact folders, files, mailboxes, Drive files, calendars, queries, URLs, and date ranges the user authorized. Do not broaden scope. For email, invoke `$exchange-email-intake`; it must discover and use the current user's connected accounts instead of assuming the repository author's accounts.
3. Treat user-confirmed facts, manual website edits, and previously accepted proposals as durable evidence.
4. Create a deterministic evidence inventory before deciding what is new. Read [evidence-coverage.md](references/evidence-coverage.md), search the authorized project files and existing private email archives by category, then search connected mail for gaps. A handoff is current website state, not a complete evidence index; `0 new emails` never means `0 usable evidence`.
   Treat every `resourceIntake` item in the authorized backup as an exact user-authorized URL. Process pending items only; do not follow it as permission to scan the user's account or unrelated links. A URL intake is not a bookmarks-only workflow: for every page, build a cross-surface impact check against tasks, resources, packing items, physical bags, personal flight allowances, base budget, study events, and travel plans. Create proposals for every actionable fact that fits those surfaces, and record a concrete `no-new-evidence` comparison when the current state already covers it.
5. Research current official sources for the actual school, city, nationality, host country, exchange term, visa or residence, insurance, financial proof, housing, transport, customs, academics, and return process. Prefer material at or after the profile's research cutoff. A current evergreen official page with no publication date is allowed when its `capturedAt` records today's check and its summary notes that no source-updated date was available.
6. Search YouTube and personal reports for seasonal packing, daily-life context, and common omissions. Never treat experience content as legal, customs, medicine, airline, visa, fee, or deadline authority.
   The template may begin with the two experience-only sources in `config/packing-inspiration.json`. Use them only as private item-discovery prompts, then adapt every recommendation to the current destination, season, housing, and user. Put useful results into ordinary `packing-item` proposals; never surface the video, creator, channel, title, or promotional link in the website. They never establish kilograms, piece counts, customs, or carrier rules.
7. Initialize a coverage manifest with `python3 .agents/skills/exchange-concierge/scripts/audit_import_coverage.py --init HANDOFF outputs/exchange-companion-coverage.json`. Compare each finding with every surface from `editableSurfaces`; record `updated`, `no-new-evidence`, or `needs-confirmation`, plus the files, archive groups, exact queries, or URLs actually checked. Produce small `add` or `update` proposals with evidence, captured date, confidence, and privacy. Never report the run as complete merely because one surface changed.
8. Run a pre-write privacy pass over source labels, notes, summaries, URLs, and values. Remove account addresses, full excerpts, addresses, booking or payment references, and other identifiers unless a private task field strictly requires the minimal value. Treat the whole bundle as private working data even when an individual generic proposal is marked `shareable`.
9. Before drafting, run `python3 .agents/skills/exchange-concierge/scripts/initialize_import_bundle.py path/to/exchange-concierge-input.json outputs/exchange-companion-import.json`. This deliberately replaces any stale output shell with the handoff's exact `outputTemplate`; never copy root metadata from `outputs/`, `tests/fixtures/`, examples, or an earlier run. Give every source and proposal a shared run-version suffix such as `run-20260811-143000-r1`; never reuse an ID merely because the underlying evidence is the same.
10. Validate both structure and coverage. Run `python3 .agents/skills/exchange-concierge/scripts/validate_import_bundle.py outputs/exchange-companion-import.json HANDOFF`, then `python3 .agents/skills/exchange-concierge/scripts/audit_import_coverage.py HANDOFF outputs/exchange-companion-import.json outputs/exchange-companion-coverage.json`. A format-valid bundle still fails when a surface is unchecked, IDs are not run-versioned, or confirmed housing, payment, flight, baggage, study, or travel evidence lacks its corresponding proposal or explicit confirmation gap.
11. Inspect both validator results and the raw field-level diff. Report high, medium, and low confidence counts plus private and shareable counts. Report every website surface from the coverage manifest. Leave every new proposal in `pending` state for website review. In cloud mode, submit the validated result with `python3 .agents/skills/exchange-concierge/scripts/concierge_cloud_sync.py push outputs/exchange-companion-import.json`; the website user still applies each proposal. If submission reports a revision conflict, pull again, reconcile against the newer state, regenerate, and revalidate. Never force-push an old result.

## Deterministic evidence gate

- Search existing authorized project archives before searching only for new mail. Use filename inventory plus separate keyword groups for housing, payments, flights, baggage, school, visa, insurance, courses, arrival, and return. Do not use one broad grouped query as proof of coverage.
- Run mailbox queries separately by provider or domain. Record matched, read, relevant, duplicate, new, and failed counts; grouped `OR` results may be used for discovery but never replace exact category queries.
- Reconcile facts across surfaces. A signed housing agreement or receipt must trigger a housing task/resource and base-budget check. A purchased ticket must trigger flight task/resource, ticket price, `flight-allowance`, and `bag` checks. A paid school/provider fee must trigger task and base-budget checks. Study dates must trigger study-event and travel-conflict checks.
- Do the same reconciliation for pasted URLs. Do not mark a URL processed merely because a resource card exists. If the page contains an actionable restriction, deadline, amount, preparation step, schedule, address, packing rule, or conflict risk, update every applicable surface or explicitly document why the existing value already covers it. A resource proposal plus a processed-intake proposal alone is incomplete when another surface has a real delta.
- If evidence says `paid`, `booked`, `confirmed`, or contains an explicit amount but the corresponding surface remains unset, either create the proposal or mark that surface `needs-confirmation` with the exact missing evidence. Do not silently leave the gap.
- Treat entity IDs as durable website records. Update an existing entity when it represents the same fact; use a new stable entity ID only for a genuinely new record. Run-version only source IDs, proposal IDs, and new nested history-record IDs.

## Preferred one-time cloud connection

1. In the signed-in website, open **AI 幫我整理** and choose **首次連結 Codex**. The downloaded `exchange-concierge-connection.json` is a private, revocable credential; place it at the gitignored `work/exchange-concierge-connection.json`. Never commit, print, paste into chat, or copy it into an output bundle.
2. At the start of every weekly or one-off update, run `python3 .agents/skills/exchange-concierge/scripts/concierge_cloud_sync.py pull`. This retrieves the latest manual and accepted website state plus its `baseRevision`; do not reuse an older handoff.
3. Initialize, research, draft, and validate exactly as described above. Preserve `journeyScope` and `baseRevision` from the pulled handoff.
4. Submit only the validated pending bundle with `python3 .agents/skills/exchange-concierge/scripts/concierge_cloud_sync.py push outputs/exchange-companion-import.json`.
5. Tell the user to open or refresh **AI 提案收件匣**. Submission never applies a proposal. The user can review, apply, ignore, undo, or revoke the Agent connection from the website.

The connection has only `read_latest_private_state` and `submit_pending_proposals` capability for one stable journey ID. It cannot mutate website state, apply proposals, share data, or bypass a changed revision. A website manual edit increases the revision, so a stale Agent run is rejected and must reconcile again.

## Offline website handoff fallback

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
- Every resource proposal contains a self-contained `description` summary plus a substantive `details` explanation covering who it applies to, what to prepare, the practical steps, relevant deadlines, and what must be rechecked. Prefer enough concrete nouns and synonyms for ordinary text search instead of a vague one-line abstract. Add 4–12 de-identified `searchTags` with likely user queries and synonyms (for example flight/airplane/ticket/carry-on/baggage); tags are searchable but hidden in the website. Do not pad missing facts; explicitly label uncertainty and keep every factual claim traceable to evidence.
- A URL pasted into the website is a private `resource-intake` record, not a verified resource. Validate that it is ordinary HTTP(S), contains no embedded credentials or token-like query parameters, and then propose a separate `resource` add/update for review. Mark the intake `processed` only in a visible proposal after the resource proposal exists.
- Before marking an intake processed, compare the page against the current tasks, budget, packing, bags, personal flight rules, study calendar, and travel plans. Reuse existing entity IDs for updates; do not create duplicate reminders or copy general airline limits over ticket-confirmed allowances.
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

Read [import-bundle-schema.md](references/import-bundle-schema.md) before producing JSON. Use run-versioned, namespaced source and proposal IDs so a later import cannot replace accepted or dismissed history. All sources and proposals in one bundle must share the same run suffix. Use entity-prefixed stable add IDs. For `add`, provide the complete website entity; for `update`, provide `targetId` and only changed fields. Map responsible providers to the existing evidence kinds: government and national agencies as `official`, universities as `school`, municipalities as `city`, and commercial providers as `research` with an explicit provider label. Personal ticket facts may support private or explicitly sanitized shareable `flight-allowance` proposals, but the ticket document itself stays private.

When evidence is insufficient, create a low-confidence proposal asking for confirmation instead of inventing a value. A successful bundle is a review inbox, not an irreversible mutation.
