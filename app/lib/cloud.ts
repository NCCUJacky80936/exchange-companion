"use client";

import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AiImportBundle, AppState, ConciergeConnectionFile, ConciergeConnectionInfo, TravelPlan, TravelShareAccess, TravelShareLink } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let browserClient: SupabaseClient | null = null;

export function cloudIsConfigured(): boolean {
  return Boolean(url && publishableKey);
}

export function getCloudClient(): SupabaseClient | null {
  if (!cloudIsConfigured() || typeof window === "undefined") return null;
  browserClient ??= createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export async function ensureCloudSession(): Promise<Session | null> {
  const client = getCloudClient();
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
  const client = getCloudClient();
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
  const client = getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const identifier = accountId.trim().toLowerCase();
  const { error } = await client.auth.signInWithPassword({ email: identifier.includes("@") ? identifier : accountIdToEmail(identifier), password });
  if (error) throw error;
}

export async function sendMagicLink(email: string): Promise<void> {
  const client = getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("?")[0] },
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const client = getCloudClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
  await ensureCloudSession();
}

export interface VersionedPrivateState {
  state: AppState;
  revision: number;
}

export async function readPrivateState(): Promise<VersionedPrivateState | null> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
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
  const client = getCloudClient();
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

async function invokeConcierge<T>(body: Record<string, unknown>): Promise<T> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
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

export async function listConciergeConnections(): Promise<ConciergeConnectionInfo[]> {
  const data = await invokeConcierge<{ connections: Array<Record<string, unknown>> }>({ action: "connections" });
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

function cloudPayload(plan: TravelPlan): TravelPlan {
  const payload = { ...plan };
  delete payload.cloud;
  return payload as TravelPlan;
}

export async function publishTravelPlan(plan: TravelPlan): Promise<TravelPlan> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !session) throw new Error("cloud_not_configured");
  const { data, error } = await client.from("travel_plans").upsert({
    id: plan.id,
    owner_id: session.user.id,
    payload: cloudPayload(plan),
  }, { onConflict: "id" }).select("owner_id, updated_at").single();
  if (error) throw error;
  return {
    ...plan,
    cloud: {
      published: true,
      ownerId: data.owner_id,
      permission: data.owner_id === session.user.id ? "owner" : "editor",
      lastSyncedAt: data.updated_at,
    },
  };
}

export async function updatePublishedTravelPlan(plan: TravelPlan): Promise<void> {
  const client = getCloudClient();
  if (!client || !plan.cloud?.published || plan.cloud.permission === "viewer") return;
  const { error } = await client.from("travel_plans").update({ payload: cloudPayload(plan) }).eq("id", plan.id);
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

export async function createTravelShareLink(options: {
  plan: TravelPlan;
  permission: "viewer" | "editor";
  accessMode: TravelShareAccess;
  approvedEmail?: string;
  expiresAt?: string;
}): Promise<TravelShareLink> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !session) throw new Error("cloud_not_configured");

  if (options.accessMode === "approved_google") {
    const accountId = options.approvedEmail?.trim().toLowerCase();
    if (!accountId) throw new Error("approved_account_required");
    const invitedEmail = accountIdToEmail(accountId);
    const { data: existingMember, error: lookupError } = await client.from("travel_members")
      .select("id")
      .eq("plan_id", options.plan.id)
      .ilike("invited_email", invitedEmail)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const memberMutation = existingMember
      ? client.from("travel_members").update({ permission: options.permission }).eq("id", existingMember.id)
      : client.from("travel_members").insert({
        plan_id: options.plan.id,
        invited_email: invitedEmail,
        permission: options.permission,
        added_by: session.user.id,
      });
    const { error: memberError } = await memberMutation;
    if (memberError) throw memberError;
  }

  const token = randomShareToken();
  const { data, error } = await client.from("travel_share_links").insert({
    plan_id: options.plan.id,
    token_hash: await sha256Bytea(token),
    permission: options.permission,
    access_mode: options.accessMode,
    expires_at: options.expiresAt || null,
    created_by: session.user.id,
  }).select("id, permission, access_mode, expires_at").single();
  if (error) throw error;

  const shareUrl = new URL(window.location.href.split("?")[0]);
  shareUrl.searchParams.set("share", token);
  return {
    id: data.id,
    url: shareUrl.toString(),
    permission: data.permission,
    accessMode: data.access_mode,
    expiresAt: data.expires_at ?? undefined,
  };
}

export async function revokeTravelShareLink(id: string): Promise<void> {
  const client = getCloudClient();
  if (!client) throw new Error("cloud_not_configured");
  const { error } = await client.from("travel_share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function redeemTravelShare(token: string): Promise<TravelPlan> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !session) throw new Error("cloud_not_configured");
  const { data: redemption, error: redemptionError } = await client.rpc("redeem_travel_share", { share_token: token });
  if (redemptionError) throw redemptionError;
  const result = redemption?.[0];
  if (!result) throw new Error("invalid_share");
  const { data, error } = await client.from("travel_plans").select("payload, owner_id, updated_at").eq("id", result.plan_id).single();
  if (error) throw error;
  return {
    ...(data.payload as TravelPlan),
    cloud: {
      published: true,
      ownerId: data.owner_id,
      permission: result.permission,
      lastSyncedAt: data.updated_at,
    },
  };
}

export function subscribeToTravelPlan(planId: string, onChange: (plan: TravelPlan) => void): RealtimeChannel | null {
  const client = getCloudClient();
  if (!client) return null;
  return client.channel(`travel-plan:${planId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "travel_plans", filter: `id=eq.${planId}` }, (event) => {
      const row = event.new as { payload: TravelPlan; owner_id: string; updated_at: string };
      onChange({
        ...row.payload,
        cloud: { published: true, ownerId: row.owner_id, lastSyncedAt: row.updated_at },
      });
    })
    .subscribe();
}

export async function removeTravelSubscription(channel: RealtimeChannel | null): Promise<void> {
  const client = getCloudClient();
  if (client && channel) await client.removeChannel(channel);
}
