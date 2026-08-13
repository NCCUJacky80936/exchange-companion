import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

assert(url && key, "Supabase public environment variables are required");

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(url, key, clientOptions);
const visitor = createClient(url, key, clientOptions);
const editor = createClient(url, key, clientOptions);

const ownerAuth = await owner.auth.signInAnonymously();
const visitorAuth = await visitor.auth.signInAnonymously();
const editorAuth = await editor.auth.signInAnonymously();
assert.equal(ownerAuth.error, null);
assert.equal(visitorAuth.error, null);
assert.equal(editorAuth.error, null);
if (process.env.CLOUD_SMOKE_REPORT_IDS === "1") {
  console.log(JSON.stringify({ qaAnonymousUserIds: [ownerAuth.data.user.id, visitorAuth.data.user.id, editorAuth.data.user.id] }));
}

const ownerId = ownerAuth.data.user.id;
const editorId = editorAuth.data.user.id;
const planId = `cloud-smoke-${crypto.randomUUID()}`;
const shareToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(shareToken));
const tokenHash = `\\x${Buffer.from(digest).toString("hex")}`;

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
    is_primary: true,
    created_by: ownerId,
  }).select("id").single();
  assert.equal(link.error, null);
  const stableToken = link.data.id;

  const ownerRedeemed = await owner.rpc("redeem_travel_share", { share_token: stableToken });
  assert.equal(ownerRedeemed.error, null);
  assert.equal(ownerRedeemed.data[0].plan_id, planId);
  assert.equal(ownerRedeemed.data[0].permission, "owner", "opening your own share link must never downgrade ownership");

  const redeemed = await visitor.rpc("redeem_travel_share", { share_token: stableToken });
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

  const changedLink = await owner.from("travel_share_links").update({ permission: "editor" }).eq("id", stableToken);
  assert.equal(changedLink.error, null);
  const sameLinkRedeemed = await visitor.rpc("redeem_travel_share", { share_token: stableToken });
  assert.equal(sameLinkRedeemed.error, null);
  assert.equal(sameLinkRedeemed.data[0].permission, "editor", "the same link must immediately receive its new permission");
  const linkEditorUpdate = await visitor.from("travel_plans")
    .update({ payload: { id: planId, kind: "travel", title: "Cloud smoke test edited" } })
    .eq("id", planId);
  assert.equal(linkEditorUpdate.error, null);
  const edited = await owner.from("travel_plans").select("payload").eq("id", planId).single();
  assert.equal(edited.error, null);
  assert.equal(edited.data.payload.title, "Cloud smoke test edited");

  const member = await owner.from("travel_members").insert({
    plan_id: planId,
    user_id: editorId,
    permission: "editor",
    added_by: ownerId,
  });
  assert.equal(member.error, null);

  const disabledLink = await owner.from("travel_share_links").update({ revoked_at: new Date().toISOString() }).eq("id", stableToken);
  assert.equal(disabledLink.error, null);
  const memberUpdate = await editor.from("travel_plans")
    .update({ payload: { id: planId, kind: "travel", title: "Member edit while link is off" } })
    .eq("id", planId);
  assert.equal(memberUpdate.error, null, "an individually approved editor must remain independent from link access");

  const oneLink = await owner.from("travel_share_links").select("id").eq("plan_id", planId);
  assert.equal(oneLink.error, null);
  assert.equal(oneLink.data.length, 1, "permission changes must not create replacement links");
} finally {
  await owner.from("travel_plans").delete().eq("id", planId);
  await owner.auth.signOut();
  await visitor.auth.signOut();
  await editor.auth.signOut();
}

console.log("Cloud collaboration smoke test passed.");
