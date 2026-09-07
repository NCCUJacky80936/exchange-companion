---
name: create-exchange-companion
description: Set up a cloned Exchange Companion template or make an explicitly requested site configuration, visual, cloud, or deployment change.
---

# Create Exchange Companion

Use this skill for the first setup of a clone or for an explicitly requested change to the exchange website itself. Keep manual edits reviewable, keep private records out of the public repository, and preserve the local-only experience.

Do not use this skill for routine progress reconciliation, current evidence research, or reviewable import bundles; use `$exchange-concierge`. For mailbox evidence, use `$exchange-email-intake` first and pass its bounded report to Concierge.

## Route by mode

- **First setup**: read [onboarding-and-evidence.md](references/onboarding-and-evidence.md), which contains the complete onboarding, evidence, validation, optional cloud, and release handoff. Read [research-coverage.md](references/research-coverage.md) only when destination research is in scope, [visuals-and-web.md](references/visuals-and-web.md) for visual work, and [cloud-deployment.md](references/cloud-deployment.md) for an explicitly requested cloud, sharing, or deployment operation.
- **Existing site change**: read `AGENTS.md` and only the source files and reference for the requested surface. Read the profile, README, privacy guide, or research reference when the requested change touches that material; a small copy or configuration edit does not require loading all of them.
- **Progress or mailbox work discovered during setup**: hand it to the corresponding skill instead of editing browser storage or website state directly.

## Shared boundaries

- Work from the repository root containing `config/exchange-profile.json` and `package.json`.
- Never scan a parent directory, mailbox, drive, or calendar without explicit authorization for that exact source and scope.
- Never commit `.env*`, tokens, credentials, source emails, uploaded documents, passport or visa scans, financial records, exact housing identifiers, or personal photos.
- Treat checked-in country data and artwork as demonstration content. Do not infer a new user's journey from it.
- Preserve manual website edits and accepted proposals as durable evidence. Do not overwrite browser state or reset a user's records as part of setup or a site change.
- Follow `AGENTS.md` as the single authority for deployment routing, including the existing Sites binding and its Cloudflare exception. Do not rewrite or bypass that binding. Deploy only after the relevant local validation is complete, and do not claim cloud sync, sharing, account recovery, or public deployment without a tested result.
