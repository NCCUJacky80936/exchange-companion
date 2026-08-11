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
