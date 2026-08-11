---
name: create-exchange-companion
description: Build or personalize a complete Exchange Companion from this repository. Use when someone has cloned or forked the template and wants to choose an exchange country, city, school, and dates; collect authorized evidence; research current official requirements; generate original travel-scrapbook artwork; customize and validate the website; configure optional free cloud collaboration; or deploy one reviewed release.
---

# Create Exchange Companion

Turn this template into one person's exchange website while keeping every manual edit reviewable and every private record out of the public repository. Treat the website as the progress and planning surface; use Codex to perform evidence collection, current research, illustration work, reconciliation, and deployment preparation.

## Start safely

1. Work from the repository root containing `config/exchange-profile.json` and `package.json`.
2. Read `AGENTS.md`, `README.md`, the current profile, and `docs/PRIVACY.md` before changing files.
3. Never scan a parent directory, mail account, drive, or calendar without explicit user authorization for the exact source and scope.
4. Never commit `.env*`, tokens, credentials, source emails, uploaded documents, passport or visa scans, financial records, exact housing identifiers, or personal photos.
5. Treat the checked-in Germany profile and artwork as demonstration content only. Replace them for another journey; do not infer that the new user is going to Germany.

## Choose the operating mode

- **First setup**: collect the minimum profile fields, run `npm install`, then run `npm run setup` and `npm run doctor`.
- **Research and progress import**: invoke `$exchange-concierge` and create a reviewable import bundle. Do not directly overwrite browser storage.
- **Mailbox evidence**: invoke `$exchange-email-intake` for the current user's authorized account/message/query scope, then pass its evidence report to `$exchange-concierge`.
- **Visual customization**: follow [visuals-and-web.md](references/visuals-and-web.md), use the installed image-generation skill for original artwork, and validate each crop in the real interface.
- **Cloud and sharing**: follow [cloud-deployment.md](references/cloud-deployment.md) only when the user explicitly asks for accounts, sync, collaboration, or deployment.
- **Existing site update**: read the newest exported website backup first and reconcile rather than resetting the user's manual records.

## End-to-end workflow

### 1. Establish the journey

Collect only the fields required by `config/exchange-profile.schema.json`: display name, home and host locations, school, programme, known dates, time zones, country code, currencies, language, and research cutoff. Orientation may remain blank until the school publishes it. Ask for missing choices only when they cannot be inferred safely from a user-provided acceptance record.

Run:

```bash
npm install
npm run setup
npm run doctor
```

For automated or tested setup, pass a complete JSON profile:

```bash
npm run setup -- --profile path/to/profile.json --output config/exchange-profile.json
```

Read [onboarding-and-evidence.md](references/onboarding-and-evidence.md) before requesting any files or connected accounts.

### 2. Create an evidence map

Separate evidence into four levels:

1. user-confirmed facts and accepted website edits;
2. school, government, city, airline, insurance, or booking records;
3. current official web sources;
4. experience sources such as YouTube and blogs.

Never use level 4 as authority for law, visa, customs, medicines, airline restrictions, fees, or deadlines. Record source, captured date, confidence, and privacy for every proposed change.

### 3. Research the destination

Read [research-coverage.md](references/research-coverage.md). Search official sources for the actual nationality, host country, city, school, exchange period, and programme. Prefer material published or verified after the profile's `research.minimumVerifiedDate`. Mark dynamic prices, dates, and procedures for re-checking instead of freezing them as permanent facts.

Use YouTube and lived-experience sources to discover seasonal packing needs, common omissions, campus routines, and practical trade-offs. Cross-check safety and restrictions with official sources.
The two links in `config/packing-inspiration.json` are reusable experience-only starting points. Keep them available for packing-item discovery, but never use them to infer the current user's airline, fare, baggage kilograms, customs rules, or legal requirements.

Keep the destination resource library user-specific. It begins empty, then receives only resources extracted from the current user's authorized uploads or researched for the current profile. Website-pasted URLs remain private pending intake until `$exchange-concierge` produces a sourced, reviewable resource proposal.

### 4. Reconcile progress

Invoke `$exchange-concierge`. Feed it only the authorized evidence plus the newest website backup if one exists. Generate `outputs/exchange-companion-import.json`, validate it, and let the user review each proposal in the website's AI inbox.

Preserve manual records as durable evidence. A newer automated pass may propose a correction, but it must show the contradictory source and remain reversible.

### 5. Produce the visual identity

Use the existing hand-drawn European travel scrapbook system unless the user chooses another direction. During first setup, use AI to personalize the destination-specific hero, social images, icons, and fixed interface copy; after a route change, the setup tool uses neutral placeholder art. Update the visual paths and `visual.generatedFor` in `config/exchange-profile.json`, then validate that every file exists. Keep functional controls recognizable and accessible.

After first setup is accepted, treat country, school, time zones, primary currencies, fixed copy, and artwork as locked repository configuration. Routine `exchange-concierge-input` handoffs include this setup snapshot only so a new session understands context; do not rewrite it unless the user explicitly requests reconfiguration or redesign.

### 6. Validate the local website

Run:

```bash
npm run check
```

Then inspect the real site at desktop, tablet, and phone widths. Verify the dashboard, task editing, packing weights, resource empty state, travel creation, map links, AI import, backup/restore, keyboard focus, and reduced motion. Fix failures before any cloud provisioning or public release.

### 7. Add optional free cloud

Keep the complete local-only version working. When explicitly requested, create a user-owned Supabase project, apply the checked-in migration, copy only the public URL and publishable key into local environment variables, and test private sync plus scoped travel sharing. Never use a service-role key in the browser or repository.

### 8. Deploy one reviewed release

Run the doctor, profile validation, privacy check, lint, tests, and production build immediately before deployment. Show the user what will be public. Deploy only after the full local experience is stable so development does not repeatedly consume build or provider quotas.

## Completion contract

Report:

- the configured route, school, dates, and current research cutoff;
- which sources were authorized and which were intentionally excluded;
- the number of pending proposals by confidence and privacy;
- the images replaced and responsive views inspected;
- local, cloud, sharing, and deployment status separately;
- all remaining items that require user review or a fresh official check.

Do not claim that cloud sync, sharing, account recovery, or public deployment exists unless it was configured and tested in this clone.
