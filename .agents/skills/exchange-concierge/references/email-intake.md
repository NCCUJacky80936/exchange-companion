# Email intake

Use this workflow whenever the user authorizes mailbox evidence.

## 1. Establish current-user scope

Collect only what is needed for this run:

- mailbox account or connected-account label;
- allowed senders or domains;
- Gmail query keywords or labels;
- inclusive date range;
- whether attachment filenames may be inspected;
- whether a private local archive is requested.

If the user identifies exact messages, record those exact message references and do not require or infer a mailbox-wide sender/query/date search. Clarify body, attachment-name, and attachment-content permission independently.

Do not inherit account addresses, token filenames, sender lists, or archive paths from the repository author. Show the resolved scope before the first read. Treat each additional account as a separate authorization decision.

The optional [email-sources.example.json](../assets/email-sources.example.json) is a portable template. Copy it to `work/email-sources.json` or another gitignored private location, then replace placeholders. The template is an intake aid, not a credential store.

## 2. Choose the access method

Use methods in this order:

1. A Gmail connector or connected mail app authenticated by the current user.
2. An explicitly authorized Gmail Takeout `.mbox` file.
3. An explicitly authorized folder of `.eml` exports.
4. User-pasted messages for a small manual intake.

If a connector is not connected, ask the user to connect Gmail through the host application. Never request a Gmail password, app password, refresh token, OAuth client secret, or access token in chat. Do not ship the repository author's OAuth client or tokens with the Skill.

## 3. Search incrementally

- Search metadata first and newest first.
- Use a bounded Gmail query such as `from:(international@host.example.edu) after:2026/07/01 before:2026/09/01`.
- Read at most the newest 20–50 matched messages per query unless the user authorizes a wider backfill.
- Deduplicate using provider message IDs in the private working inventory.
- Read full bodies only for messages that match the authorized query and appear relevant from metadata.
- List attachment filenames only by default. Download or open an attachment only when explicitly authorized and necessary.

Run each account separately and keep per-account counts. A search failure in one account must not be reported as coverage of that account.

## 4. Separate private evidence from the website bundle

Private working evidence may contain account labels, message IDs, headers, and relevant excerpts. Keep it under `work/email-capture/` or another confirmed private location excluded from Git.

The Exchange Companion import must not contain:

- full message bodies or quoted threads;
- Gmail display URLs or provider message IDs;
- account addresses unless strictly necessary and private;
- OAuth material or connector metadata;
- attachments, scans, booking codes, payment references, addresses, or account numbers.

Represent a message as a concise evidence source label and extracted fact. Default all email-derived proposals to `private`.

## 5. Validate the capture

Report:

- authorized accounts and queries searched;
- matched, read, new, duplicate, and failed-message counts;
- attachment metadata inspected or downloaded;
- private working files created or updated;
- whether any material status changed;
- validation status: `pass`, `partial`, or `blocked`.

Use `pass` only when every authorized exact message or account query was read as scoped and count differences are explained. Use `partial` for non-critical coverage gaps. Use `blocked` when authentication, message reads, or private output failed enough that the result is not trustworthy.
