# Onboarding and evidence intake

## Complete first-setup delivery

Use this sequence only for a new clone or an explicitly requested full reconfiguration. For a small existing-site change, read only the affected source and reference from the parent skill.

1. Read `AGENTS.md`, `README.md`, the current profile and `config/exchange-profile.schema.json`, and `docs/PRIVACY.md`. Work from the repository root; treat checked-in country data and artwork as demonstration content.
2. Collect the minimum profile fields below, then run `npm install`, `npm run setup`, and `npm run doctor`. For an automated or tested setup, pass a complete JSON profile to `npm run setup -- --profile path/to/profile.json --output config/exchange-profile.json`.
3. Build the evidence map below. Use only explicitly authorized sources, preserve the originals in place, and pass concise, de-identified facts to `$exchange-concierge` for reviewable proposals.
4. When destination research is in scope, read [research-coverage.md](research-coverage.md). For original artwork or visual changes, read [visuals-and-web.md](visuals-and-web.md). Keep the destination library user-specific and mark dynamic facts for re-checking.
5. For progress discovered during setup, use `$exchange-concierge` to prepare and validate an import bundle; do not overwrite browser storage. Preserve manual records and accepted proposals.
6. When the setup or site change actually changes files or behavior, run one appropriate validation, including `npm run check` when the project surface requires it. For visual work, inspect the real site at `390x844`, `768x1024`, and `1440x900`; fix failures before cloud provisioning or release. If there is no change, do not run a check or repeat the same test/build only to restate a pass.
7. When the user explicitly requests cloud, sharing, or deployment, read [cloud-deployment.md](cloud-deployment.md) and follow the deployment route in `AGENTS.md`; use its release gate as the one appropriate validation for that release. Keep local-only mode working, validate the configured release, and deploy once after validation.
8. Report the configured route, school, dates, research cutoff, authorized and excluded sources, pending proposal counts, visual checks, local/cloud/sharing/deployment status, and remaining user review or fresh-check items. Never claim an unconfigured or untested capability.

## Minimum first-run questions

Collect:

- display name and preferred language;
- home country and city;
- host country, city, school, and programme;
- exchange start, end, and orientation dates;
- IANA time zones and ISO 4217 currencies;
- whether the user already has an acceptance email or official record;
- whether the site should remain local-only or later use free cloud sync.

Do not demand all documents before the local site can open. A user may start with an empty profile and add evidence incrementally.

## Authorization boundary

Before reading a source, state its exact scope. Examples:

- one named folder containing exchange records;
- specified Gmail accounts and a query limited to the exchange school or programme;
- selected Drive files;
- a calendar range covering the exchange period;
- URLs explicitly provided by the user.

Authorization for one source does not authorize its parent folder, other mailboxes, or unrelated accounts. Prefer connected app tools for Gmail, Drive, and Calendar. Do not copy OAuth credentials or tokens into the repository.

## Evidence inventory

Build a private working inventory with:

- source label and kind;
- captured or received date;
- applicable country, city, school, and term;
- facts supported;
- confidence;
- whether the source may be represented as a public link;
- proposed website entities.

Original files remain in their authorized source location. The website import contains concise facts and source labels, not attachments or full email bodies.

## Evidence map

Separate evidence into four levels:

1. user-confirmed facts and accepted website edits;
2. school, government, city, airline, insurance, or booking records;
3. current official web sources;
4. experience sources such as YouTube and blogs.

Never use level 4 as authority for law, visa, customs, medicines, airline restrictions, fees, or deadlines. Record source, captured date, confidence, and privacy for every proposed change. Keep the destination resource library user-specific: website-pasted URLs remain private pending intake until `$exchange-concierge` produces a sourced, reviewable proposal.

## After first setup

Treat country, school, time zones, primary currencies, fixed interface copy, and artwork as locked repository configuration after first setup is accepted. Routine Concierge handoffs may include this setup snapshot for context but must not rewrite it unless the user explicitly requests reconfiguration or redesign.

## Existing users

Ask for the latest JSON backup from the website. Treat applied proposals, manual task records, manually entered travel plans, and explicit user corrections as durable evidence. Never reset them merely because a template or older email disagrees.
