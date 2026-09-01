import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const entities = new Set(["journey", "task", "resource", "resource-intake", "packing-item", "bag", "flight-allowance", "budget-item", "study-event", "travel-plan"]);
const rootFields = new Set(["schemaVersion", "generatedAt", "journeyScope", "baseRevision", "sources", "proposals"]);
const sourceFields = new Set(["id", "label", "kind", "evidenceType", "url", "capturedAt", "note"]);
const proposalFields = new Set(["id", "title", "summary", "entity", "action", "targetId", "value", "confidence", "privacy", "evidenceIds", "status"]);
const editableSurfaces = [
  ["journey", "state.journey", "journey"],
  ["tasks", "state.tasks[]", "task"],
  ["resources", "state.resources[]", "resource"],
  ["resource-intake", "state.resourceIntake[]", "resource-intake"],
  ["packing", "state.packingItems[]", "packing-item"],
  ["bags", "state.bags[]", "bag"],
  ["flight-allowances", "state.flightAllowances[]", "flight-allowance"],
  ["base-budget", "state.budget[]", "budget-item"],
  ["study-events", "state.studyEvents[]", "study-event"],
  ["travel-plans", "state.travelPlans[]", "travel-plan"],
].map(([id, statePath, proposalEntity]) => ({ id, statePath, proposalEntity }));

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: JsonRecord, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function defaultKey(jsonName: string, legacyName: string): string {
  const values = Deno.env.get(jsonName);
  if (values) {
    const parsed = JSON.parse(values) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return requiredEnv(legacyName);
}

function bearer(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `xc_${encoded}`;
}

function randomPairCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function telegramSecret(name: string): string {
  return requiredEnv(name).trim();
}

async function sendTelegramMessage(chatId: string, text: string, forceReply = false): Promise<number> {
  const response = await fetch(`https://api.telegram.org/bot${telegramSecret("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(forceReply ? { reply_markup: { force_reply: true, selective: true } } : {}),
    }),
  });
  const result = await response.json().catch(() => null) as JsonRecord | null;
  const message = result && isRecord(result.result) ? result.result : null;
  if (!response.ok || result?.ok !== true || !message || !Number.isSafeInteger(message.message_id)) {
    throw new Error("telegram_send_failed");
  }
  return Number(message.message_id);
}

function telegramBotInfo() {
  const username = telegramSecret("TELEGRAM_BOT_USERNAME").replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error("invalid_telegram_bot_username");
  return { botUsername: `@${username}`, botUrl: `https://t.me/${username}` };
}

function telegramPairingBotInfo(code: string) {
  const info = telegramBotInfo();
  const url = new URL(info.botUrl);
  url.searchParams.set("start", code);
  return { ...info, botUrl: url.toString() };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableScope(journeyId: string): string {
  return `exchange:${journeyId}`;
}

function validBundle(bundle: unknown, journeyScope: string, baseRevision: number): bundle is JsonRecord {
  if (!isRecord(bundle) || JSON.stringify(bundle).length > 2_000_000 || !hasOnlyKeys(bundle, rootFields)) return false;
  if (bundle.schemaVersion !== 1 || bundle.journeyScope !== journeyScope || bundle.baseRevision !== baseRevision) return false;
  if (typeof bundle.generatedAt !== "string" || !bundle.generatedAt.includes("T") || !/(?:Z|[+-]\d{2}:\d{2})$/.test(bundle.generatedAt)) return false;
  if (!Array.isArray(bundle.sources) || !Array.isArray(bundle.proposals) || bundle.proposals.length > 250 || bundle.sources.length > 250) return false;
  const sourceIds = new Set<string>();
  for (const source of bundle.sources) {
    if (!isRecord(source) || !hasOnlyKeys(source, sourceFields) || typeof source.id !== "string" || !source.id.startsWith("source-") || sourceIds.has(source.id)) return false;
    if (typeof source.label !== "string" || typeof source.kind !== "string" || typeof source.capturedAt !== "string") return false;
    sourceIds.add(source.id);
  }
  const proposalIds = new Set<string>();
  for (const proposal of bundle.proposals) {
    if (!isRecord(proposal) || !hasOnlyKeys(proposal, proposalFields) || typeof proposal.id !== "string" || !proposal.id.startsWith("proposal-") || proposalIds.has(proposal.id)) return false;
    if (typeof proposal.title !== "string" || typeof proposal.summary !== "string" || !entities.has(String(proposal.entity)) || !["add", "update"].includes(String(proposal.action))) return false;
    if (!isRecord(proposal.value) || !["high", "medium", "low"].includes(String(proposal.confidence)) || !["private", "shareable"].includes(String(proposal.privacy)) || proposal.status !== "pending") return false;
    if (!Array.isArray(proposal.evidenceIds) || !proposal.evidenceIds.length || !proposal.evidenceIds.every((id) => typeof id === "string" && sourceIds.has(id))) return false;
    if (proposal.action === "update" && typeof proposal.targetId !== "string") return false;
    if (proposal.action === "add" && "targetId" in proposal) return false;
    proposalIds.add(proposal.id);
  }
  return true;
}

function handoff(state: JsonRecord, revision: number, recentChanges: unknown[]) {
  const journey = isRecord(state.journey) ? state.journey : {};
  const journeyId = String(journey.id ?? "");
  const journeyScope = stableScope(journeyId);
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    kind: "exchange-companion-handoff",
    generatedAt,
    journeyScope,
    baseRevision: revision,
    outputTemplate: { schemaVersion: 1, generatedAt, journeyScope, baseRevision: revision, sources: [], proposals: [] },
    agentContract: {
      requiredSkill: "$exchange-concierge",
      requiredSkillPath: ".agents/skills/exchange-concierge/SKILL.md",
      emailSkill: "$exchange-email-intake",
      emailSkillPath: ".agents/skills/exchange-email-intake/SKILL.md",
      initializer: ".agents/skills/exchange-concierge/scripts/initialize_import_bundle.py",
      validator: ".agents/skills/exchange-concierge/scripts/validate_import_bundle.py",
      cloudMode: true,
      instructions: [
        "Treat state as the latest source of truth and baseRevision as an optimistic concurrency precondition.",
        "Return pending proposals only. The connection may read this journey and submit proposals, but cannot apply them.",
        "Before submitting, run the repository validator against this exact handoff.",
      ],
    },
    editableSurfaces,
    setupSnapshot: { lockedForRoutineReconciliation: true },
    recentChanges,
    state,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const payload = await req.json();
    if (!isRecord(payload) || typeof payload.action !== "string") return json({ error: "invalid_request" }, 400);
    const token = bearer(req);
    // Retention cleanup is opportunistic and only needed when the inbox is read.
    // Running two DELETE queries for every pair/context/submit call wastes free-tier CPU.
    if (payload.action === "pull" || payload.action === "proposals") {
      const pendingCutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const deliveredCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("concierge_proposal_runs").delete().eq("status", "pending").lt("created_at", pendingCutoff);
      await admin.from("concierge_proposal_runs").delete().neq("status", "pending").lt("delivered_at", deliveredCutoff);
    }

    const authenticateUser = async () => {
      if (!token || token.startsWith("xc_")) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user || data.user.is_anonymous) return null;
      return data.user;
    };

    const authenticateConnection = async () => {
      if (!token.startsWith("xc_")) return null;
      const tokenHash = await sha256(token);
      const { data, error } = await admin.from("concierge_connections").select("id,user_id,journey_id,scopes,expires_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
      if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
      await admin.from("concierge_connections").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
      return data;
    };

    if (payload.action === "pair") {
      const user = await authenticateUser();
      if (!user) return json({ error: "login_required" }, 401);
      const { data: row, error } = await admin.from("private_app_states").select("state,revision").eq("user_id", user.id).maybeSingle();
      if (error || !row || !isRecord(row.state) || !isRecord(row.state.journey)) return json({ error: "state_not_ready" }, 409);
      const journeyId = String(row.state.journey.id ?? "");
      if (!journeyId) return json({ error: "journey_id_required" }, 409);
      const connectionToken = randomToken();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 400 * 24 * 60 * 60 * 1000);
      const { data: connection, error: insertError } = await admin.from("concierge_connections").insert({
        user_id: user.id,
        journey_id: journeyId,
        label: typeof payload.label === "string" && payload.label.trim() ? payload.label.trim().slice(0, 120) : "Codex Exchange Concierge",
        token_hash: await sha256(connectionToken),
        expires_at: expiresAt.toISOString(),
      }).select("id,label,created_at,expires_at").single();
      if (insertError) throw insertError;
      return json({
        connection: {
          schemaVersion: 1,
          kind: "exchange-concierge-connection",
          endpoint: `${supabaseUrl}/functions/v1/exchange-concierge-sync`,
          token: connectionToken,
          journeyId,
          journeyScope: stableScope(journeyId),
          createdAt: connection.created_at,
          expiresAt: connection.expires_at,
          permissions: ["read_latest_private_state", "submit_pending_proposals"],
          requiredSkill: "$exchange-concierge",
          warning: "Private credential. Keep in the gitignored work directory; never commit or share it.",
        },
        connectionId: connection.id,
      });
    }

    if (["telegram-pair", "telegram-status", "telegram-revoke"].includes(payload.action)) {
      const user = await authenticateUser();
      if (!user) return json({ error: "login_required" }, 401);
      const requestedConnectionId = typeof payload.connectionId === "string" ? payload.connectionId : "";

      if (payload.action === "telegram-pair") {
        if (!requestedConnectionId) return json({ error: "connection_id_required" }, 400);
        const { data: connection, error: connectionError } = await admin.from("concierge_connections")
          .select("id,journey_id,expires_at,revoked_at")
          .eq("id", requestedConnectionId).eq("user_id", user.id).maybeSingle();
        if (connectionError) throw connectionError;
        if (!connection || connection.revoked_at || new Date(connection.expires_at).getTime() <= Date.now()) {
          return json({ error: "connection_not_active" }, 409);
        }
        const code = randomPairCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await admin.from("telegram_pair_codes").update({ used_at: new Date().toISOString() })
          .eq("user_id", user.id).is("used_at", null);
        const { error } = await admin.from("telegram_pair_codes").insert({
          user_id: user.id,
          journey_id: connection.journey_id,
          connection_id: connection.id,
          code_hash: await sha256(code),
          expires_at: expiresAt,
        });
        if (error) throw error;
        return json({ pairing: { connectionId: connection.id, code, expiresAt, ...telegramPairingBotInfo(code) } }, 201);
      }

      if (payload.action === "telegram-status") {
        let query = admin.from("telegram_links")
          .select("id,connection_id,linked_at,last_received_at,revoked_at")
          .eq("user_id", user.id).is("revoked_at", null).order("linked_at", { ascending: false }).limit(1);
        if (requestedConnectionId) query = query.eq("connection_id", requestedConnectionId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return json({ link: null });
        const { data: activeConnection, error: activeConnectionError } = await admin.from("concierge_connections")
          .select("expires_at,revoked_at").eq("id", data.connection_id).eq("user_id", user.id).maybeSingle();
        if (activeConnectionError) throw activeConnectionError;
        if (!activeConnection || activeConnection.revoked_at || new Date(activeConnection.expires_at).getTime() <= Date.now()) {
          const { error: revokeError } = await admin.rpc("revoke_telegram_connection", { requested_connection_id: data.connection_id });
          if (revokeError) throw revokeError;
          return json({ link: null });
        }
        const { count, error: countError } = await admin.from("telegram_requests")
          .select("id", { count: "exact", head: true })
          .eq("link_id", data.id)
          .in("status", ["queued", "leased", "awaiting_clarification"]);
        if (countError) throw countError;
        return json({ link: {
          connectionId: data.connection_id,
          connected: true,
          linkedAt: data.linked_at,
          lastReceivedAt: data.last_received_at,
          queuedCount: count ?? 0,
          botUsername: telegramBotInfo().botUsername,
        } });
      }

      if (!requestedConnectionId) return json({ error: "connection_id_required" }, 400);
      const { data: owned, error: ownedError } = await admin.from("concierge_connections")
        .select("id").eq("id", requestedConnectionId).eq("user_id", user.id).maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) return json({ error: "connection_not_found" }, 404);
      const { error } = await admin.rpc("revoke_telegram_connection", { requested_connection_id: requestedConnectionId });
      if (error) throw error;
      return json({ ok: true });
    }

    if (["connections", "revoke", "pull", "ack"].includes(payload.action)) {
      const user = await authenticateUser();
      if (!user) return json({ error: "login_required" }, 401);
      if (payload.action === "connections") {
        const { data, error } = await admin.from("concierge_connections").select("id,label,journey_id,scopes,created_at,last_used_at,expires_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false });
        if (error) throw error;
        return json({ connections: data ?? [] });
      }
      if (payload.action === "revoke") {
        if (typeof payload.connectionId !== "string") return json({ error: "connection_id_required" }, 400);
        const { error } = await admin.from("concierge_connections").update({ revoked_at: new Date().toISOString() }).eq("id", payload.connectionId).eq("user_id", user.id);
        if (error) throw error;
        const { error: telegramError } = await admin.rpc("revoke_telegram_connection", { requested_connection_id: payload.connectionId });
        if (telegramError) throw telegramError;
        return json({ ok: true });
      }
      if (payload.action === "pull") {
        const { data, error } = await admin.from("concierge_proposal_runs").select("id,bundle,base_revision,created_at").eq("user_id", user.id).eq("status", "pending").order("created_at", { ascending: true }).limit(20);
        if (error) throw error;
        return json({ runs: data ?? [] });
      }
      const runIds = Array.isArray(payload.runIds) ? payload.runIds.filter((id) => typeof id === "string").slice(0, 20) : [];
      if (!runIds.length) return json({ error: "run_ids_required" }, 400);
      const { error } = await admin.from("concierge_proposal_runs").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("user_id", user.id).in("id", runIds).eq("status", "pending");
      if (error) throw error;
      return json({ ok: true });
    }

    const connection = await authenticateConnection();
    if (!connection) return json({ error: "invalid_or_expired_connection" }, 401);
    const { data: row, error: stateError } = await admin.from("private_app_states").select("state,revision").eq("user_id", connection.user_id).maybeSingle();
    if (stateError || !row || !isRecord(row.state)) return json({ error: "state_not_ready" }, 409);
    const journey = isRecord(row.state.journey) ? row.state.journey : {};
    if (journey.id !== connection.journey_id) return json({ error: "journey_mismatch" }, 409);

    if (payload.action === "telegram-claim") {
      if (!connection.scopes.includes("read_telegram_queue") || !connection.scopes.includes("update_telegram_queue")) {
        return json({ error: "scope_denied" }, 403);
      }
      const leaseId = randomToken().replace("xc_", "tql_");
      const { data, error } = await admin.rpc("claim_telegram_requests", {
        requested_connection_id: connection.id,
        requested_lease_id: leaseId,
        requested_limit: 20,
        requested_character_limit: 32000,
      });
      if (error) throw error;
      const requests = (data ?? []).map((item: JsonRecord) => ({
        requestId: item.request_id,
        text: item.request_text,
        receivedAt: item.received_at,
        parentRequestId: item.parent_request_id ?? undefined,
      }));
      return json({
        telegramBatch: {
          leaseId: requests.length ? leaseId : null,
          requests,
          totalCharacters: requests.reduce((total: number, item: JsonRecord) => total + String(item.text ?? "").length, 0),
        },
      });
    }

    if (["telegram-clarify", "telegram-complete", "telegram-fail"].includes(payload.action)) {
      if (!connection.scopes.includes("update_telegram_queue")) return json({ error: "scope_denied" }, 403);
      const leaseId = typeof payload.leaseId === "string" ? payload.leaseId : "";
      const requestIds = Array.isArray(payload.requestIds)
        ? payload.requestIds.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20)
        : typeof payload.requestId === "string" && /^[0-9a-f-]{36}$/i.test(payload.requestId) ? [payload.requestId] : [];
      if (!leaseId || !requestIds.length) return json({ error: "lease_and_request_ids_required" }, 400);

      const { data: linkRows, error: linkError } = await admin.from("telegram_links")
        .select("id,telegram_chat_id").eq("connection_id", connection.id).is("revoked_at", null);
      if (linkError) throw linkError;
      const linkIds = (linkRows ?? []).map((item) => item.id);
      if (!linkIds.length) return json({ error: "telegram_link_not_active" }, 409);
      const { data: leasedRows, error: leasedError } = await admin.from("telegram_requests")
        .select("id,link_id,status,lease_id,result_run_key")
        .in("id", requestIds).in("link_id", linkIds);
      if (leasedError) throw leasedError;
      if (payload.action === "telegram-complete") {
        const retryRunKey = typeof payload.runKey === "string" ? payload.runKey.trim() : "";
        if (retryRunKey && (leasedRows ?? []).length === requestIds.length
          && leasedRows?.every((item) => item.result_run_key === retryRunKey && ["processed", "no_change"].includes(item.status))) {
          return json({ ok: true, duplicate: true, completed: 0 });
        }
      }
      if ((leasedRows ?? []).length !== requestIds.length || leasedRows?.some((item) => item.status !== "leased" || item.lease_id !== leaseId)) {
        return json({ error: "lease_mismatch" }, 409);
      }

      if (payload.action === "telegram-clarify") {
        if (requestIds.length !== 1) return json({ error: "single_request_required" }, 400);
        const question = typeof payload.question === "string" ? payload.question.trim() : "";
        if (!question || question.length > 500) return json({ error: "invalid_question" }, 400);
        const link = linkRows?.find((item) => item.id === leasedRows?.[0]?.link_id);
        if (!link) return json({ error: "telegram_link_not_active" }, 409);
        const messageId = await sendTelegramMessage(String(link.telegram_chat_id), question, true);
        const { data: updated, error } = await admin.rpc("clarify_telegram_request", {
          requested_connection_id: connection.id,
          requested_request_id: requestIds[0],
          requested_lease_id: leaseId,
          requested_bot_prompt_message_id: messageId,
          requested_question: question,
        });
        if (error) throw error;
        if (!updated) return json({ error: "lease_mismatch" }, 409);
        return json({ ok: true, awaitingReply: true });
      }

      if (payload.action === "telegram-complete") {
        const runKey = typeof payload.runKey === "string" ? payload.runKey.trim() : "";
        const outcome = payload.outcome === "no_change" ? "no_change" : payload.outcome === "processed" ? "processed" : "";
        const proposalCount = Number(payload.proposalCount);
        if (!/^run-\d{8}-\d{6}(?:-[a-z0-9]+)*$/.test(runKey) || !outcome || !Number.isInteger(proposalCount) || proposalCount < 0) {
          return json({ error: "invalid_completion" }, 400);
        }
        const companionUrl = telegramSecret("EXCHANGE_COMPANION_URL");
        const notification = outcome === "no_change"
          ? "目前手帳已涵蓋，未新增提案。"
          : `已整理完成，共送出 ${proposalCount} 則待確認提案。\n${companionUrl}`;
        const chatIds = [...new Set((leasedRows ?? []).map((request) => String(linkRows?.find((link) => link.id === request.link_id)?.telegram_chat_id ?? "")).filter(Boolean))];
        for (const chatId of chatIds) await sendTelegramMessage(chatId, notification);
        const { data: changed, error } = await admin.rpc("complete_telegram_requests", {
          requested_connection_id: connection.id,
          requested_request_ids: requestIds,
          requested_lease_id: leaseId,
          requested_run_key: runKey,
          requested_outcome: outcome,
          requested_summary: notification,
        });
        if (error) throw error;
        if (!changed) return json({ error: "lease_mismatch" }, 409);
        return json({ ok: true, completed: changed });
      }

      const reason = typeof payload.error === "string" && payload.error.trim() ? payload.error.trim().slice(0, 300) : "processing_failed";
      const { data: failed, error } = await admin.rpc("fail_telegram_requests", {
        requested_connection_id: connection.id,
        requested_request_ids: requestIds,
        requested_lease_id: leaseId,
        requested_error: reason,
      });
      if (error) throw error;
      if ((failed ?? []).some((item: JsonRecord) => item.status === "failed")) {
        const chatIds = [...new Set((leasedRows ?? []).map((request) => String(linkRows?.find((link) => link.id === request.link_id)?.telegram_chat_id ?? "")).filter(Boolean))];
        for (const chatId of chatIds) {
          await sendTelegramMessage(chatId, "這批內容連續三次無法完成整理，已停止自動重試。請到手帳重新送出或檢查 Concierge 連結。");
        }
      }
      return json({ ok: true, requests: failed ?? [] });
    }

    if (payload.action === "context") {
      if (!connection.scopes.includes("read_state")) return json({ error: "scope_denied" }, 403);
      const { data: changes } = await admin.from("private_state_events").select("revision,base_revision,actor,changed_paths,created_at").eq("user_id", connection.user_id).eq("journey_id", connection.journey_id).order("revision", { ascending: false }).limit(50);
      return json(handoff(row.state, Number(row.revision), changes ?? []));
    }

    if (payload.action === "proposals") {
      if (!connection.scopes.includes("submit_proposals")) return json({ error: "scope_denied" }, 403);
      const baseRevision = Number(payload.baseRevision);
      const journeyScope = stableScope(connection.journey_id);
      if (!Number.isInteger(baseRevision) || baseRevision !== Number(row.revision)) return json({ error: "revision_conflict", currentRevision: row.revision }, 409);
      if (!validBundle(payload.bundle, journeyScope, baseRevision)) return json({ error: "invalid_bundle" }, 400);
      const runKey = typeof payload.runKey === "string" ? payload.runKey.trim() : "";
      if (!/^run-\d{8}-\d{6}(?:-[a-z0-9]+)*$/.test(runKey)) return json({ error: "invalid_run_key" }, 400);
      const { data: existing } = await admin.from("concierge_proposal_runs").select("id,status").eq("user_id", connection.user_id).eq("run_key", runKey).maybeSingle();
      if (existing) return json({ ok: true, duplicate: true, runId: existing.id, status: existing.status });
      const { data: run, error } = await admin.from("concierge_proposal_runs").insert({
        user_id: connection.user_id,
        connection_id: connection.id,
        journey_id: connection.journey_id,
        journey_scope: journeyScope,
        base_revision: baseRevision,
        run_key: runKey,
        bundle: payload.bundle,
      }).select("id,status,created_at").single();
      if (error) throw error;
      return json({ ok: true, runId: run.id, status: run.status, createdAt: run.created_at }, 201);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "server_error" }, 500);
  }
});
