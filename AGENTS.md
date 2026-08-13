# Exchange Companion agent entrypoint

This repository is a public, reusable exchange-site template. Do not assume the user is the repository author, attends the demonstration school, lives in the demonstration country, or has access to any files outside this repository.

## Project skills

- Use `.agents/skills/create-exchange-companion/SKILL.md` for first setup, destination research, visual production, website customization, free cloud preparation, and deployment.
- Use `.agents/skills/exchange-concierge/SKILL.md` for authorized evidence collection, progress reconciliation, current research, packing recommendations, and reviewable import bundles.
- Use `.agents/skills/exchange-email-intake/SKILL.md` whenever mailbox evidence is requested. It must use only the current user's explicitly authorized accounts, exact messages, queries, and date ranges, then pass a privacy-safe evidence report to Exchange Concierge.

First-use country, school, time zone, currencies, fixed interface copy, and artwork are repository setup. Routine handoff runs treat that setup snapshot as locked unless the user explicitly requests reconfiguration or redesign.

## Safety

- Read only repository files unless the user explicitly authorizes another exact source.
- Never commit private documents, emails, credentials, tokens, addresses, account details, or personal photos.
- Preserve manual website edits and accepted proposals as durable evidence.
- Keep the local-only experience functional when cloud variables are absent.
- Run `npm run check` and responsive visual QA before deployment.
- Deploy one reviewed release after local validation; do not repeatedly provision or publish during development.

## Continuous reconciliation contract

- A user-confirmed exchange status added in the current conversation, an authorized project file, or the website is new evidence. When `$exchange-concierge` is active, do not stop after updating or reading Markdown, project memory, a task note, or a local output file.
- In the same run, pull the latest website handoff, reconcile every editable surface, validate the pending bundle, and push it to the cloud proposal inbox. If the private connection is missing, expired, revoked, or rejected, report that delivery failure prominently; never imply the website was updated.
- Proactive monitoring is a separate trigger layer. The project should have one Codex automation that periodically checks authorized Germany-exchange workspace changes and invokes the repository skill. Do not create duplicate monitors.
- A successful cloud push updates the review inbox, not the saved journey. Proposals remain pending until the user applies them.
