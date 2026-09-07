# Exchange Companion agent entrypoint

This repository is a public, reusable exchange-site template. Do not assume the user is the repository author, attends the demonstration school, lives in the demonstration country, or has access to any files outside this repository.

## Project skills

- Use `.agents/skills/create-exchange-companion/SKILL.md` for first setup or an explicitly requested exchange-site configuration, visual, cloud, sharing, or deployment change.
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

## Deployment routing (mandatory)

- If `.openai/hosting.json` contains a non-empty `project_id`, the existing Codex Sites project is the canonical production target. Use the Sites building/hosting workflow and reuse that binding for normal releases.
- Preserve a non-empty Sites binding exactly; do not replace, clear, or edit its `project_id` to change the route or bypass its access controls.
- Do not route an ordinary site update through Wrangler, `deploy:preflight`, or `deploy:cloudflare`; those npm scripts are guarded and will stop when a Sites binding exists.
- Cloudflare Workers is an exception only when the user explicitly requests a Worker migration or a separate Worker deployment. The one-command `ALLOW_CLOUDFLARE_WORKERS_DEPLOY=1` override is required and must not be persisted.
- Installing Cloudflare skills or MCP servers is independent of the website's hosting route and never changes this precedence.

## Continuous reconciliation contract

- A user-confirmed exchange status added in the current conversation, an authorized project file, or the website is new journey evidence. Skills, automation, documentation, project-memory, task-note, and local-output organization are not new journey state by themselves and do not require a Concierge run.
- Honor an explicit read-only or no-push limit in the current request: report evidence and a candidate correction without the prohibited write/delivery. A limit to one source is not permission to inspect other sources.
- When `$exchange-concierge` is active for new evidence, pull the latest website handoff in the same run, reconcile the affected editable surface plus its dependency closure, validate the pending bundle, and push it to the cloud proposal inbox. Use a full run only for the weekly automation, a first import, or an explicitly comprehensive audit. The provided scripts still validate the bundle against the complete handoff schema and audit complete coverage on every finalize. If the private connection is missing, expired, revoked, or rejected, report that delivery failure prominently; never imply the website was updated.
- Proactive monitoring is a separate trigger layer. This project uses one weekly Codex automation to capture authorized Germany-exchange email and inspect new workspace screenshots or documents. A user-confirmed status in an active Codex conversation must reconcile and push in that same run instead of waiting for the weekly check. Do not create duplicate monitors.
- A successful cloud push updates the review inbox, not the saved journey. Proposals remain pending until the user applies them.
