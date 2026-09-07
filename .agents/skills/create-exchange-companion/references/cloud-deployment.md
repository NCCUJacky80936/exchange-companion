# Free-first cloud and deployment

`AGENTS.md` is the single authority for choosing the deployment route and preserving an existing Sites binding. Use this reference only for the selected provider's setup, validation, and release details; never rewrite the binding to change providers.

## Local mode first

The website must remain useful with `localStorage`, JSON backup, calendar export, packing, resources, and travel planning when no cloud environment variables exist.

## Optional Supabase setup

Use a new project owned by the person cloning the repository. Apply `supabase/migrations/20260809163742_exchange_cloud_collaboration.sql`. Configure the deployed site URL and redirect allowlist in that user's Supabase project.

Store only these browser-safe values in a local or hosting environment:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Never put a service-role key, database password, access token, or production secret in the browser, Git history, screenshot, issue, or example file.

Validate row-level security, account creation, sign-in, private state sync, sign-out, anonymous read-only and edit links, account-restricted links, link expiry, and revocation. The database must never copy private exchange state into travel collaboration rows.

## Sharing boundary

Only explicitly selected public resources, generic packing, sanitized flight facts, and selected travel plans may be shared. Tasks, visa, finance, addresses, mail, documents, personal study schedules, emergency contacts, and private progress remain private.

## Deployment gate

Release requires a passing `npm run check` and inspection of the production artifact being published. Reuse a completed check for the same source revision and relevant environment; rerun affected checks when code, dependencies, configuration, or the release environment changes. `check` already includes profile/privacy validation, lint, tests, and a build through `test`; do not run them again individually just to restate a pass. Run the production-specific build/verification when its environment or artifact requires it. Confirm the selected provider binding belongs to the authorized user and preserve the existing route. Preview the public pages and sharing scope with the user.

Follow the route selected under `AGENTS.md`. For an existing Sites binding, use the Sites hosting workflow and reuse the bound project. Run `deploy:preflight` / `deploy:cloudflare` only for an authorized Cloudflare route, honoring the one-command override requirements in `AGENTS.md` when applicable. Cloudflare authentication (`npx wrangler login`) is needed only for that route; account selection stays in the user's local environment or private configuration, never in the public template.

Deploy once after local validation. Record the public URL and exact tested release commit. Do not claim that a clone inherits the demonstration site's cloud account or deployment.

For Sites, retrieve the existing site's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` immediately before the production build and expose them only to that build process. Hosted runtime entries alone do not guarantee that a client bundle created elsewhere contains the public configuration. Never persist the values in the repository. After deployment, verify from a fresh browser state that the login/create-account gate appears before any private notebook UI.
