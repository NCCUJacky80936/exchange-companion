"use client";

import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AppState, TravelPlan, TravelShareAccess, TravelShareLink } from "./types";

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

export function isPermanentSession(session: Session | null): boolean {
  return Boolean(session && !session.user.is_anonymous);
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

export async function readPrivateState(): Promise<AppState | null> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) return null;
  const { data, error } = await client
    .from("private_app_states")
    .select("state")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.state as AppState | undefined) ?? null;
}

export async function writePrivateState(state: AppState): Promise<void> {
  const client = getCloudClient();
  const session = await ensureCloudSession();
  if (!client || !isPermanentSession(session)) throw new Error("permanent_account_required");
  const { error } = await client.from("private_app_states").upsert({
    user_id: session.user.id,
    state,
    source_device: navigator.userAgent.slice(0, 180),
  }, { onConflict: "user_id" });
  if (error) throw error;
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
    const invitedEmail = options.approvedEmail?.trim().toLowerCase();
    if (!invitedEmail) throw new Error("approved_email_required");
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
