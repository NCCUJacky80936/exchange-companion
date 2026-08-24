begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email, created_at, updated_at) values
  ('10000000-0000-0000-0000-000000000001', 'telegram-one@example.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'telegram-two@example.invalid', now(), now());

insert into public.concierge_connections (id, user_id, journey_id, token_hash, expires_at) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'journey-one', 'token-one', now() + interval '1 day'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'journey-two', 'token-two', now() + interval '1 day');

insert into public.telegram_pair_codes (user_id, journey_id, connection_id, code_hash, expires_at, created_at) values
  ('10000000-0000-0000-0000-000000000001', 'journey-one', '20000000-0000-0000-0000-000000000001', 'valid-code', now() + interval '10 minutes', now()),
  ('10000000-0000-0000-0000-000000000002', 'journey-two', '20000000-0000-0000-0000-000000000002', 'expired-code', now() - interval '10 minutes', now() - interval '20 minutes');

select is(
  (select count(*)::integer from public.consume_telegram_pair_code('expired-code', 7002, 7002)),
  0,
  'expired pairing codes cannot be consumed'
);

select is(
  (select count(*)::integer from public.consume_telegram_pair_code('valid-code', 7001, 7001)),
  1,
  'a valid pairing code creates one link'
);

select is(
  (select count(*)::integer from public.consume_telegram_pair_code('valid-code', 7001, 7001)),
  0,
  'a pairing code can be used only once'
);

select ok(
  (select scopes @> array['read_telegram_queue', 'update_telegram_queue']::text[]
   from public.concierge_connections where id = '20000000-0000-0000-0000-000000000001'),
  'pairing grants queue scopes only to the selected connection'
);

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 1001, 501, null, 'first request', 'hash-1001')),
  'queued',
  'linked private text is queued'
);

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 1001, 501, null, 'first request', 'hash-1001')),
  'duplicate',
  'duplicate update_id is idempotent'
);

select is(
  (select outcome from public.enqueue_telegram_request(7001, 9999, 1002, 502, null, 'wrong chat', 'hash-1002')),
  'not_linked',
  'an unrelated Telegram account or chat cannot enqueue'
);

do $$
begin
  for counter in 1..20 loop
    perform * from public.enqueue_telegram_request(
      7001, 7001, 1100 + counter, 600 + counter, null,
      'batch request ' || counter, 'hash-batch-' || counter
    );
  end loop;
end;
$$;

select is(
  (select count(*)::integer from public.claim_telegram_requests(
    '20000000-0000-0000-0000-000000000001', 'tql-first', 20, 32000
  )),
  20,
  'claim leases at most the oldest 20 requests'
);

select is(
  (select count(*)::integer from public.telegram_requests where status = 'queued'),
  1,
  'requests beyond the batch limit stay queued'
);

update public.telegram_requests set lease_expires_at = now() - interval '1 second'
where id = (select id from public.telegram_requests where lease_id = 'tql-first' order by received_at, id limit 1);

select is(
  (select count(*)::integer from public.claim_telegram_requests(
    '20000000-0000-0000-0000-000000000001', 'tql-second', 20, 32000
  )),
  2,
  'expired leases recover alongside the next queued request'
);

select ok(
  public.clarify_telegram_request(
    '20000000-0000-0000-0000-000000000001',
    (select id from public.telegram_requests where lease_id = 'tql-second' order by received_at, id limit 1),
    'tql-second', 99001, 'Which date?'
  ),
  'a leased request can transition to awaiting clarification'
);

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 2001, 801, 99001, 'next Monday', 'hash-2001')),
  'queued',
  'a Force Reply answer is queued'
);

select ok(
  (select parent_request_id is not null from public.telegram_requests where update_id = 2001),
  'a Force Reply answer links to its original request'
);

select is(
  (select count(*)::integer from public.claim_telegram_requests(
    '20000000-0000-0000-0000-000000000001', 'tql-reply', 1, 32000
  )),
  1,
  'the clarification answer waits in the normal queue for the next run'
);

select ok(
  public.clarify_telegram_request(
    '20000000-0000-0000-0000-000000000001',
    (select id from public.telegram_requests where update_id = 2001),
    'tql-reply', 99002, 'Which train?'
  ),
  'a clarification answer may itself receive one concrete follow-up'
);

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 2002, 802, 99002, 'ICE 515', 'hash-2002')),
  'queued',
  'a second Force Reply answer remains linked to the clarification chain'
);

do $$
begin
  perform * from public.claim_telegram_requests(
    '20000000-0000-0000-0000-000000000001', 'tql-grandchild', 1, 32000
  );
end;
$$;

select is(
  public.complete_telegram_requests(
    '20000000-0000-0000-0000-000000000001',
    array[(select id from public.telegram_requests where update_id = 2002)],
    'tql-grandchild', 'run-20260824-210000-telegram', 'no_change', 'covered'
  ),
  3,
  'completion resolves the full clarification ancestor chain'
);

select is(
  (select count(*)::integer from public.telegram_requests
   where (update_id in (2001, 2002) or bot_prompt_message_id = 99001) and raw_text is not null),
  0,
  'successful completion removes the related raw text'
);

delete from public.telegram_requests;

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 2501, 2501, null, 'retry me', 'retry-hash')),
  'queued',
  'a failure fixture enters the queue normally'
);

do $$
declare
  retry_request_id uuid := (select id from public.telegram_requests where update_id = 2501);
begin
  perform * from public.claim_telegram_requests('20000000-0000-0000-0000-000000000001', 'tql-fail-1', 1, 32000);
  perform * from public.fail_telegram_requests('20000000-0000-0000-0000-000000000001', array[retry_request_id], 'tql-fail-1', 'one');
end;
$$;

select ok(
  (select attempts = 1 and status = 'queued' from public.telegram_requests where update_id = 2501),
  'the first failure releases the request for retry'
);

do $$
declare
  retry_request_id uuid := (select id from public.telegram_requests where update_id = 2501);
begin
  perform * from public.claim_telegram_requests('20000000-0000-0000-0000-000000000001', 'tql-fail-2', 1, 32000);
  perform * from public.fail_telegram_requests('20000000-0000-0000-0000-000000000001', array[retry_request_id], 'tql-fail-2', 'two');
end;
$$;

select ok(
  (select attempts = 2 and status = 'queued' from public.telegram_requests where update_id = 2501),
  'the second failure remains retryable'
);

do $$
declare
  retry_request_id uuid := (select id from public.telegram_requests where update_id = 2501);
begin
  perform * from public.claim_telegram_requests('20000000-0000-0000-0000-000000000001', 'tql-fail-3', 1, 32000);
  perform * from public.fail_telegram_requests('20000000-0000-0000-0000-000000000001', array[retry_request_id], 'tql-fail-3', 'three');
end;
$$;

select ok(
  (select attempts = 3 and status = 'failed' and raw_text = 'retry me' from public.telegram_requests where update_id = 2501),
  'the third failure stops retrying while retaining raw text for at most 14 days'
);

delete from public.telegram_requests;

insert into public.telegram_requests (link_id, update_id, telegram_message_id, raw_text, raw_hash)
select
  (select id from public.telegram_links where connection_id = '20000000-0000-0000-0000-000000000001' and revoked_at is null),
  2600 + counter, 2600 + counter, 'queued ' || counter, 'queue-' || counter
from generate_series(1, 50) as counter;

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 2701, 2701, null, 'over capacity', 'capacity-hash')),
  'queue_full',
  'the per-link unresolved queue is capped at 50 requests'
);

delete from public.telegram_requests;

insert into public.telegram_requests (id, link_id, update_id, telegram_message_id, raw_text, raw_hash, received_at)
select
  format('30000000-0000-0000-0000-%s', lpad(counter::text, 12, '0'))::uuid,
  (select id from public.telegram_links where connection_id = '20000000-0000-0000-0000-000000000001' and revoked_at is null),
  3000 + counter, 3000 + counter, repeat('x', 4000), 'large-' || counter, now() + counter * interval '1 second'
from generate_series(1, 9) as counter;

select is(
  (select count(*)::integer from public.claim_telegram_requests(
    '20000000-0000-0000-0000-000000000001', 'tql-characters', 20, 32000
  )),
  8,
  'claim respects the 32000-character aggregate limit'
);

delete from public.telegram_requests;

insert into public.telegram_requests (link_id, update_id, telegram_message_id, raw_text, raw_hash, received_at)
values (
  (select id from public.telegram_links where connection_id = '20000000-0000-0000-0000-000000000001' and revoked_at is null),
  4001, 4001, 'stale text', 'stale-hash', now() - interval '15 days'
);

select is(
  (select outcome from public.enqueue_telegram_request(7001, 7001, 4002, 4002, null, 'fresh text', 'fresh-hash')),
  'queued',
  'a fresh request triggers opportunistic retention cleanup'
);

select ok(
  (select raw_text is null and status = 'expired' from public.telegram_requests where update_id = 4001),
  'unresolved raw text expires after 14 days'
);

select is(
  (select count(*)::integer from cron.job where jobname = 'telegram-concierge-retention'),
  1,
  'a single daily database retention job enforces the 14-day maximum without a second Codex monitor'
);

select ok(
  public.revoke_telegram_connection('20000000-0000-0000-0000-000000000001'),
  'revocation reports that an active link changed'
);

select ok(
  (select revoked_at is not null from public.telegram_links where connection_id = '20000000-0000-0000-0000-000000000001')
  and not (select scopes && array['read_telegram_queue', 'update_telegram_queue']::text[]
           from public.concierge_connections where id = '20000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.telegram_requests where raw_text is not null),
  'revocation removes queue scopes and clears every remaining raw message'
);

select * from finish();
rollback;
