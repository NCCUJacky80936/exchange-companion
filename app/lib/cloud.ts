"use client";

import type { RealtimeChannel, Session, SupabaseClient } from "@supabase/supabase-js";
import type { AiImportBundle, AppState, ConciergeConnectionFile, ConciergeConnectionInfo, TelegramLinkInfo, TelegramPairingInfo, TravelLinkSettings, TravelMemberAccess, TravelPlan, TravelSharingSettings } from "./types";
import { cloudPlanIdFor, matchesPublicTravelPayload, publicTravelPayload, resolveTravelPermission } from "./travel-cloud";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let browserClient: SupabaseClient | null = null;
let browserClientPromise: Promise<SupabaseClient | null> | null = null;
let travelSubscriptionSequence = 0;

export function cloudIsConfigured(): boolean {
  return Boolean(url && publishableKey);
}

export async function getCloudClient(): Promise<SupabaseClient | null> {
  if (!cloudIsConfigured() || typeof window === "undefined") return null;
  browserClientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => {
    browserClient ??= createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return browserClient;
  });
  return browserClientPromise;
}

export async function ensureCloudSession(): Promise<Session | null> {
  const client = await getCloudClient();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (session) return session;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export function isPermanentSession(session: Session | null): session is Session {
  return Boolean(session && !session.user.is_anonymous);
}

function accountIdToEmail(accountId: string): string {
  const normalized = accountId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized)) throw new Error("invalid_account_id");
  return `${normalized}@users.exchange-companion.local`;
}

export async function createPasswordAccount(accountId: string, email: string, password: string): Promise<"signed-in" | "confirmation-required"> {
  if (password.length < 8) throw new Error("weak_password");
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const normalized = accountId.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("invalid_email");
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { display_name: normalized, account_id: normalized } },
  });
  if (error) throw error;
  if (!data.user || data.user.is_anonymous) throw new Error("account_not_created");
  return data.session ? "signed-in" : "confirmation-required";
}

export async function signInWithPasswordAccount(accountId: string, password: string): Promise<void> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const identifier = accountId.trim().toLowerCase();
  const { error } = await client.auth.signInWithPassword({ email: identifier.includes("@") ? identifier : accountIdToEmail(identifier), password });
  if (error) throw error;
}

export async function sendMagicLink(email: string): Promise<void> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("?")[0] },
  });
  if (error) throw error;
}

export async function sendTravelGuestMagicLink(email: string, shareToken: string): Promise<void> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("invalid_email");
  if (!shareToken) throw new Error("share_token_required");
  const redirect = new URL(window.location.href.split("?")[0]);
  redirect.searchParams.set("share", shareToken);
  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirect.toString(),
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const client = await getCloudClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
  await ensureCloudSession();
}

export interface VersionedPrivateState {
  state: AppState;
  revision: number;
}

export async function readPrivateState(currentSession?: Session): Promise<VersionedPrivateState | null> {
  const client = await getCloudClient();
  const session = currentSession ?? await ensureCloudSession();
  if (!client || !isPermanentSession(session)) return null;
  const { data, error } = await client
    .from("private_app_states")
    .select("state,revision")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.state ? { state: data.state as AppState, revision: Number(data.revision) } : null;
}

export async function writePrivateState(
  state: AppState,
  expectedRevision: number,
  actor: "manual" | "proposal" | "system" = "manual",
): Promise<number> {
  const client = await getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) throw new Error("permanent_account_required");
  const { data, error } = await client.rpc("save_private_app_state", {
    next_state: state,
    expected_revision: expectedRevision,
    changed_paths: ["state"],
    change_actor: actor,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  const revision = Number(result?.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("invalid_cloud_revision");
  return revision;
}

interface ConciergeProposalRun {
  id: string;
  bundle: AiImportBundle;
  base_revision: number;
  created_at: string;
}

async function invokeConcierge<T>(body: Record<string, unknown>, currentSession?: Session): Promise<T> {
  const client = await getCloudClient();
  const session = currentSession ?? await ensureCloudSession();
  if (!client || !isPermanentSession(session)) throw new Error("permanent_account_required");
  const { data, error } = await client.functions.invoke("exchange-concierge-sync", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function createConciergeConnection(label = "Codex Exchange Concierge"): Promise<ConciergeConnectionFile> {
  const data = await invokeConcierge<{ connection: ConciergeConnectionFile }>({ action: "pair", label });
  return data.connection;
}

export async function listConciergeConnections(currentSession?: Session): Promise<ConciergeConnectionInfo[]> {
  const data = await invokeConcierge<{ connections: Array<Record<string, unknown>> }>({ action: "connections" }, currentSession);
  return data.connections.map((item) => ({
    id: String(item.id),
    label: String(item.label),
    journeyId: String(item.journey_id),
    scopes: Array.isArray(item.scopes) ? item.scopes.map(String) : [],
    createdAt: String(item.created_at),
    lastUsedAt: item.last_used_at ? String(item.last_used_at) : undefined,
    expiresAt: String(item.expires_at),
    revokedAt: item.revoked_at ? String(item.revoked_at) : undefined,
  }));
}

export async function revokeConciergeConnection(connectionId: string): Promise<void> {
  await invokeConcierge({ action: "revoke", connectionId });
}

export async function pullConciergeProposalRuns(): Promise<ConciergeProposalRun[]> {
  const data = await invokeConcierge<{ runs: ConciergeProposalRun[] }>({ action: "pull" });
  return data.runs;
}

export async function acknowledgeConciergeProposalRuns(runIds: string[]): Promise<void> {
  if (!runIds.length) return;
  await invokeConcierge({ action: "ack", runIds });
}

export async function createTelegramPairing(connectionId: string): Promise<TelegramPairingInfo> {
  const data = await invokeConcierge<{ pairing: TelegramPairingInfo }>({ action: "telegram-pair", connectionId });
  return data.pairing;
}

export async function getTelegramStatus(connectionId?: string, currentSession?: Session): Promise<TelegramLinkInfo | null> {
  const data = await invokeConcierge<{ link: TelegramLinkInfo | null }>({
    action: "telegram-status",
    ...(connectionId ? { connectionId } : {}),
  }, currentSession);
  return data.link;
}

export async function revokeTelegramLink(connectionId: string): Promise<void> {
  await invokeConcierge({ action: "telegram-revoke", connectionId });
}

export async function publishTravelPlan(plan: TravelPlan): Promise<TravelPlan> {
  const client = await getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) throw new Error("permanent_account_required");
  const cloudPlanId = await cloudPlanIdFor(plan, session.user.id);
  const record = {
    id: cloudPlanId,
    owner_id: session.user.id,
    payload: publicTravelPayload(plan),
  };
  let mutation = await client.from("travel_plans").insert(record);
  if (mutation.error?.code === "23505") {
    mutation = await client.from("travel_plans")
      .update({ payload: record.payload })
      .eq("id", cloudPlanId)
      .eq("owner_id", session.user.id);
  }
  if (mutation.error) throw mutation.error;
  const { data, error } = await client.from("travel_plans")
    .select("owner_id, updated_at")
    .eq("id", cloudPlanId)
    .single();
  if (error) throw error;
  return {
    ...plan,
    cloud: {
      published: true,
      cloudPlanId,
      ownerId: data.owner_id,
      permission: data.owner_id === session.user.id ? "owner" : "editor",
      lastSyncedAt: data.updated_at,
    },
  };
}

export async function updatePublishedTravelPlan(plan: TravelPlan): Promise<void> {
  const client = await getCloudClient();
  if (!client || !plan.cloud?.published || plan.cloud.permission === "viewer") return;
  const cloudPlanId = plan.cloud.cloudPlanId ?? plan.id;
  const payload = publicTravelPayload(plan);
  const { data: current, error: readError } = await client.from("travel_plans").select("payload").eq("id", cloudPlanId).single();
  if (readError) throw readError;
  if (matchesPublicTravelPayload(current.payload, plan)) return;
  const { error } = await client.from("travel_plans").update({ payload }).eq("id", cloudPlanId);
  if (error) throw error;
}

function randomShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytea(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `\\x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function shareUrlFor(linkId: string): string {
  const shareUrl = new URL(window.location.href.split("?")[0]);
  shareUrl.searchParams.set("share", linkId);
  return shareUrl.toString();
}

function memberAccountLabel(invitedEmail: string): string {
  const legacySuffix = "@users.exchange-companion.local";
  return invitedEmail.endsWith(legacySuffix) ? invitedEmail.slice(0, -legacySuffix.length) : invitedEmail;
}

function memberAccountToEmail(account: string): string {
  const normalized = account.trim().toLowerCase();
  if (!normalized) throw new Error("approved_account_required");
  if (!normalized.includes("@")) return accountIdToEmail(normalized);
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("invalid_email");
  return normalized;
}

async function ensurePrimaryTravelLink(plan: TravelPlan): Promise<TravelLinkSettings> {
  const client = await getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) throw new Error("permanent_account_required");
  const cloudPlanId = plan.cloud?.cloudPlanId ?? plan.id;
  const selectPrimary = () => client.from("travel_share_links")
    .select("id, permission, expires_at, revoked_at")
    .eq("plan_id", cloudPlanId)
    .eq("is_primary", true)
    .maybeSingle();
  let { data, error } = await selectPrimary();
  if (error) throw error;
  if (!data) {
    const token = randomShareToken();
    const created = await client.from("travel_share_links").insert({
      plan_id: cloudPlanId,
      token_hash: await sha256Bytea(token),
      permission: "viewer",
      access_mode: "anyone",
      expires_at: null,
      revoked_at: new Date().toISOString(),
      is_primary: true,
      created_by: session.user.id,
    }).select("id, permission, expires_at, revoked_at").single();
    if (created.error?.code === "23505") {
      ({ data, error } = await selectPrimary());
      if (error || !data) throw error ?? new Error("primary_link_missing");
    } else {
      if (created.error) throw created.error;
      data = created.data;
    }
  }
  return { id: data.id, url: shareUrlFor(data.id), permission: data.permission, enabled: data.revoked_at === null, expiresAt: data.expires_at ?? undefined };
}

async function listTravelMembers(plan: TravelPlan): Promise<TravelMemberAccess[]> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const cloudPlanId = plan.cloud?.cloudPlanId ?? plan.id;
  const { data, error } = await client.from("travel_members")
    .select("id, invited_email, permission")
    .eq("plan_id", cloudPlanId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).filter((member) => member.invited_email).map((member) => ({ id: member.id, account: memberAccountLabel(member.invited_email!), permission: member.permission }));
}

export async function loadTravelSharingSettings(plan: TravelPlan): Promise<TravelSharingSettings> {
  const [link, members] = await Promise.all([ensurePrimaryTravelLink(plan), listTravelMembers(plan)]);
  return { link, members };
}

export async function updateTravelLinkSettings(plan: TravelPlan, settings: { enabled: boolean; permission: "viewer" | "editor"; expiresAt?: string }): Promise<TravelLinkSettings> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const current = await ensurePrimaryTravelLink(plan);
  const { data, error } = await client.from("travel_share_links").update({
    permission: settings.permission,
    expires_at: settings.expiresAt || null,
    revoked_at: settings.enabled ? null : new Date().toISOString(),
  }).eq("id", current.id).select("id, permission, expires_at, revoked_at").single();
  if (error) throw error;
  return { id: data.id, url: shareUrlFor(data.id), permission: data.permission, enabled: data.revoked_at === null, expiresAt: data.expires_at ?? undefined };
}

export async function upsertTravelMember(plan: TravelPlan, account: string, permission: "viewer" | "editor"): Promise<TravelMemberAccess[]> {
  const client = await getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) throw new Error("permanent_account_required");
  await ensurePrimaryTravelLink(plan);
  const cloudPlanId = plan.cloud?.cloudPlanId ?? plan.id;
  const invitedEmail = memberAccountToEmail(account);
  const { data: existing, error: lookupError } = await client.from("travel_members")
    .select("id")
    .eq("plan_id", cloudPlanId)
    .ilike("invited_email", invitedEmail)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const mutation = existing
    ? client.from("travel_members").update({ permission }).eq("id", existing.id)
    : client.from("travel_members").insert({ plan_id: cloudPlanId, invited_email: invitedEmail, permission, added_by: session.user.id });
  const { error } = await mutation;
  if (error) throw error;
  return listTravelMembers(plan);
}

export async function updateTravelMemberPermission(plan: TravelPlan, memberId: string, permission: "viewer" | "editor"): Promise<TravelMemberAccess[]> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const { error } = await client.from("travel_members").update({ permission }).eq("id", memberId);
  if (error) throw error;
  return listTravelMembers(plan);
}

export async function removeTravelMember(plan: TravelPlan, memberId: string): Promise<TravelMemberAccess[]> {
  const client = await getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const { error } = await client.from("travel_members").delete().eq("id", memberId);
  if (error) throw error;
  return listTravelMembers(plan);
}

export async function redeemTravelShare(token: string): Promise<TravelPlan> {
  const client = await getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !session) throw new Error("cloud_not_configured");
  const { data: redemption, error: redemptionError } = await client.rpc("redeem_travel_share", { share_token: token });
  if (redemptionError) throw redemptionError;
  const result = redemption?.[0];
  if (!result) throw new Error("invalid_share");
  const { data, error } = await client.from("travel_plans").select("id, payload, owner_id, updated_at").eq("id", result.plan_id).single();
  if (error) throw error;
  return {
    ...(data.payload as TravelPlan),
    cloud: {
      published: true,
      cloudPlanId: data.id,
      ownerId: data.owner_id,
      permission: resolveTravelPermission(data.owner_id, session.user.id, result.permission),
      lastSyncedAt: data.updated_at,
    },
  };
}

export async function listMemberTravelPlans(seedPlan: TravelPlan): Promise<TravelPlan[]> {
  const client = await getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) return [seedPlan];
  const { data: memberships, error: membershipError } = await client.from("travel_members")
    .select("plan_id, permission");
  if (membershipError) throw membershipError;
  const permissionByPlan = new Map<string, "viewer" | "editor">();
  for (const membership of memberships ?? []) {
    const current = permissionByPlan.get(membership.plan_id);
    if (!current || membership.permission === "editor") permissionByPlan.set(membership.plan_id, membership.permission);
  }
  const planIds = [...permissionByPlan.keys()];
  if (!planIds.length) return [seedPlan];
  const { data: plans, error: plansError } = await client.from("travel_plans")
    .select("id, payload, owner_id, updated_at")
    .in("id", planIds);
  if (plansError) throw plansError;
  const accessible: TravelPlan[] = (plans ?? []).map((row) => ({
    ...(row.payload as TravelPlan),
    cloud: {
      published: true,
      cloudPlanId: row.id,
      ownerId: row.owner_id,
      permission: resolveTravelPermission(row.owner_id, session.user.id, permissionByPlan.get(row.id)),
      lastSyncedAt: row.updated_at,
    },
  }));
  if (!accessible.some((plan) => plan.id === seedPlan.id)) accessible.push(seedPlan);
  return accessible;
}

export async function restoreOwnedTravelPermissions(state: AppState, currentSession?: Session): Promise<AppState> {
  const client = await getCloudClient();
  const session = currentSession ?? await ensureCloudSession();
  if (!client || !isPermanentSession(session)) return state;
  const cloudPlanIds = [...new Set((state.travelPlans ?? [])
    .filter((plan) => plan.cloud?.published)
    .map((plan) => plan.cloud?.cloudPlanId ?? plan.id))];
  if (!cloudPlanIds.length) return state;
  const { data, error } = await client.from("travel_plans")
    .select("id")
    .in("id", cloudPlanIds)
    .eq("owner_id", session.user.id);
  if (error) throw error;
  const ownedPlanIds = new Set((data ?? []).map((row) => row.id));
  let changed = false;
  const travelPlans = (state.travelPlans ?? []).map((plan) => {
    const cloudPlanId = plan.cloud?.cloudPlanId ?? plan.id;
    if (!plan.cloud?.published || !ownedPlanIds.has(cloudPlanId) || plan.cloud.permission === "owner") return plan;
    changed = true;
    return { ...plan, cloud: { ...plan.cloud, ownerId: session.user.id, permission: "owner" as const } };
  });
  return changed ? { ...state, travelPlans } : state;
}

export function subscribeToTravelPlan(planId: string, onChange: (plan: TravelPlan) => void): RealtimeChannel | null {
  const client = browserClient;
  if (!client) return null;
  travelSubscriptionSequence += 1;
  return client.channel(`travel-plan:${planId}:${travelSubscriptionSequence}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "travel_plans", filter: `id=eq.${planId}` }, (event) => {
      const row = event.new as { payload: TravelPlan; owner_id: string; updated_at: string };
      onChange({
        ...row.payload,
        cloud: { published: true, cloudPlanId: planId, ownerId: row.owner_id, lastSyncedAt: row.updated_at },
      });
    })
    .subscribe();
}

export async function removeTravelSubscription(channel: RealtimeChannel | null): Promise<void> {
  const client = await getCloudClient();
  if (client && channel) await client.removeChannel(channel);
}
