# Free-first cloud and deployment

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

Immediately before release, run `npm run check` and inspect the production build. Confirm `.openai/hosting.json` contains no other person's project ID and `supabase/config.toml` contains no other person's production URL. Preview the public pages and sharing scope with the user.

For a first-time Cloudflare user, run `npx wrangler login`. If the authenticated user can access multiple Cloudflare accounts, set `CLOUDFLARE_ACCOUNT_ID` in that user's local or hosting environment, or add `account_id` only to that user's private Wrangler configuration. Never commit a personal account ID to the public template.

Run `npm run deploy:preflight` to confirm Cloudflare authentication when using the repository's executable default path, then run `npm run deploy:cloudflare`. Alternatively, use an available Sites hosting workflow. Deploy once after local validation. Record the public URL and the exact tested release commit. Do not claim that a clone inherits the demonstration site's cloud account or deployment.
