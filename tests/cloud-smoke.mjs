import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

assert(url && key, "Supabase public environment variables are required");

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(url, key, clientOptions);
const visitor = createClient(url, key, clientOptions);

const ownerAuth = await owner.auth.signInAnonymously();
const visitorAuth = await visitor.auth.signInAnonymously();
assert.equal(ownerAuth.error, null);
assert.equal(visitorAuth.error, null);

const ownerId = ownerAuth.data.user.id;
const planId = `cloud-smoke-${crypto.randomUUID()}`;
const shareToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(shareToken));
const tokenHash = `\\x${Buffer.from(digest).toString("hex")}`;
const restrictedToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
const restrictedDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(restrictedToken));
const restrictedTokenHash = `\\x${Buffer.from(restrictedDigest).toString("hex")}`;

try {
  const created = await owner.from("travel_plans").insert({
    id: planId,
    owner_id: ownerId,
    payload: { id: planId, kind: "travel", title: "Cloud smoke test" },
  });
  assert.equal(created.error, null);

  const hidden = await visitor.from("travel_plans").select("id").eq("id", planId);
  assert.equal(hidden.error, null);
  assert.equal(hidden.data.length, 0, "an unrelated visitor must not see the plan");

  const link = await owner.from("travel_share_links").insert({
    plan_id: planId,
    token_hash: tokenHash,
    permission: "viewer",
    access_mode: "anyone",
    created_by: ownerId,
  });
  assert.equal(link.error, null);

  const redeemed = await visitor.rpc("redeem_travel_share", { share_token: shareToken });
  assert.equal(redeemed.error, null);
  assert.equal(redeemed.data[0].plan_id, planId);
  assert.equal(redeemed.data[0].permission, "viewer");

  const visible = await visitor.from("travel_plans").select("id").eq("id", planId).single();
  assert.equal(visible.error, null);
  assert.equal(visible.data.id, planId);

  const forbiddenUpdate = await visitor.from("travel_plans")
    .update({ payload: { id: planId, title: "must not change" } })
    .eq("id", planId)
    .select("id");
  assert.equal(forbiddenUpdate.error, null);
  assert.equal(forbiddenUpdate.data.length, 0, "a viewer must not update the plan");

  const member = await owner.from("travel_members").insert({
    plan_id: planId,
    invited_email: "approved@example.com",
    permission: "editor",
    added_by: ownerId,
  });
  assert.equal(member.error, null);

  const restrictedLink = await owner.from("travel_share_links").insert({
    plan_id: planId,
    token_hash: restrictedTokenHash,
    permission: "editor",
    access_mode: "approved_google",
    created_by: ownerId,
  });
  assert.equal(restrictedLink.error, null);

  const rejectedAnonymous = await visitor.rpc("redeem_travel_share", { share_token: restrictedToken });
  assert.match(rejectedAnonymous.error?.message ?? "", /account_approval_required/);
} finally {
  await owner.from("travel_plans").delete().eq("id", planId);
  await owner.auth.signOut();
  await visitor.auth.signOut();
}

console.log("Cloud collaboration smoke test passed.");
