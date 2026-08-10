# Exchange Companion import bundle

The root object must contain:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2027-01-15T12:00:00+08:00",
  "journeyScope": "exchange:my-exchange-journey:Example University:Tokyo:Japan:2027-03-01:2027-07-31",
  "sources": [],
  "proposals": []
}
```

`journeyScope` must exactly match the current backup using this order:

```text
exchange:<journey.id>:<hostSchool>:<hostCity>:<comma-joined destinations>:<startDate>:<endDate>
```

The website rejects a structurally valid bundle for a different journey. When a current backup exists, the Python validator verifies this scope automatically.

Each source requires `id`, `label`, `kind`, and `capturedAt`. Allowed `kind` values are `official`, `school`, `city`, `email`, `file`, `video`, and `research`. `evidenceType` is optional and is normally `general`; use `ticket` only for an exact e-ticket file or email attachment that the current user authorized. `url` and `note` are optional. Never use a private local path as a public URL.

Use `source-...` IDs. Government and national agencies are `official`, universities are `school`, municipalities are `city`, and commercial providers are `research` with a clear provider label. `capturedAt` is the day the page or record was actually checked; an evergreen official page may be current even when it has no published or updated date.

Each proposal requires:

- `id`, `title`, and a concise `summary`;
- `entity`: `task`, `resource`, `resource-intake`, `packing-item`, `bag`, `flight-allowance`, `study-event`, or `travel-plan`;
- `action`: `add` or `update`;
- `targetId` for updates;
- `value`, an object containing the complete new entity or changed fields;
- `confidence`: `high`, `medium`, or `low`;
- `privacy`: `private` or `shareable`;
- one or more `evidenceIds` referring to sources;
- `status`: always `pending` in newly generated bundles.

Use `YYYY-MM-DD` for dates and ISO 8601 with an offset for timestamps. Website entity fields must match `app/lib/types.ts`.

Do not add undocumented root, source, proposal, or nested entity fields. Unknown fields are rejected because they could hide private message or account data outside the visible review diff. Date ranges must be chronological, nested IDs must be unique, travel days must stay within the trip, and task predecessor IDs must resolve to current or proposed tasks.

Use unique run-versioned proposal IDs beginning with `proposal-`. An `add` must contain a complete entity and no `targetId`; an `update` must contain an existing `targetId`, only changed fields, and no replacement `id`. New entity IDs should be namespaced by entity, for example `resource-jp-immigration-2027` or `packing-winter-base-layer`.

The import bundle is private working data. A proposal marked `shareable` means only that its de-identified result may later be selected for a scoped share; it does not make the JSON bundle public.

For ticket-based packing, use `flight-allowance` for the visible rule and separate `bag` proposals for the physical packing containers it supports. A complete `flight-allowance` contains `id`, `label`, `airline`, sanitized `segment`, `checkedMode` (`piece`, `weight`, `none`, or `unknown`), checked piece count/per-piece kilograms/total kilograms, explicit `carryOnMode` and `personalItemMode` (`piece`, `none`, or `unknown`) with their piece counts and per-piece kilograms, `provenance`, `confirmed`, `sourceLabel`, `verifiedAt`, and `notes`. A ticket-derived AI proposal uses `provenance: ticket` and cites at least one `file` or `email` source with `evidenceType: ticket`. Use zero for every non-applicable or unknown number. Piece counts are positive integers; a piece rule has positive per-piece kilograms; a weight rule has only positive total kilograms. If any applicable category is unknown, `confirmed` must be false and the website does not calculate a confirmed remaining allowance. Never include passenger or booking identifiers.

A resource add contains `origin` (`user-upload`, `ai-research`, or manual records created in the UI), `privacy`, and `sourceLabel`. AI-generated adds cannot claim `manual`. User-upload resources cite file/email evidence and remain private; web-researched resources cite the current checked web source. `resource-intake` records contain only `id`, a safe HTTP(S) `url`, a short `note`, `status`, and an offset timestamp. They remain private until a separate resource proposal is reviewed.
