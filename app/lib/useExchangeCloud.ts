"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  cloudIsConfigured,
  createTravelShareLink,
  ensureCloudSession,
  getCloudClient,
  isPermanentSession,
  publishTravelPlan,
  readPrivateState,
  redeemTravelShare,
  removeTravelSubscription,
  sendMagicLink,
  signOutCloud,
  subscribeToTravelPlan,
  updatePublishedTravelPlan,
  writePrivateState,
} from "./cloud";
import { normalizeImportedState } from "./storage";
import type { AppState, TravelPlan, TravelShareAccess, TravelShareLink } from "./types";

const PRIVATE_SYNC_KEY = "exchange-companion:private-cloud-sync";

export interface ExchangeCloudController {
  configured: boolean;
  session: Session | null;
  permanentAccount: boolean;
  privateSyncEnabled: boolean;
  busy: boolean;
  notice: string;
  setNotice: (notice: string) => void;
  emailSignIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  enablePrivateSync: (mode: "upload-local" | "use-cloud") => Promise<void>;
  disablePrivateSync: () => void;
  publishPlan: (plan: TravelPlan) => Promise<TravelPlan>;
  createShare: (options: {
    plan: TravelPlan;
    permission: "viewer" | "editor";
    accessMode: TravelShareAccess;
    approvedEmail?: string;
    expiresAt?: string;
  }) => Promise<TravelShareLink>;
}

export function useExchangeCloud(state: AppState, setState: Dispatch<SetStateAction<AppState>>): ExchangeCloudController {
  const configured = cloudIsConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [privateSyncEnabled, setPrivateSyncEnabled] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(PRIVATE_SYNC_KEY) === "on");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(configured ? "正在準備免費雲端…" : "尚未連接免費雲端；本機功能仍可完整使用。 ");
  const redeemedToken = useRef("");
  const latestState = useRef<AppState | null>(null);
  const sharedPlanIds = useMemo(() => (state.travelPlans ?? []).filter((plan) => plan.cloud?.published).map((plan) => plan.id), [state.travelPlans]);

  useEffect(() => {
    latestState.current = state;
  }, [state]);

  useEffect(() => {
    if (!configured) return;
    const client = getCloudClient();
    void ensureCloudSession().then((current) => {
      setSession(current);
      setNotice(current?.user.is_anonymous ? "以訪客身分使用；可直接開啟分享連結。" : "帳戶已連線。 ");
    }).catch(() => setNotice("雲端暫時無法連線，本機資料不受影響。"));
    const { data: listener } = client!.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!configured || !session) return;
    const token = new URLSearchParams(window.location.search).get("share");
    if (!token || redeemedToken.current === token) return;
    redeemedToken.current = token;
    setBusy(true);
    void redeemTravelShare(token).then((plan) => {
      setState((current) => ({
        ...current,
        travelPlans: [...(current.travelPlans ?? []).filter((item) => item.id !== plan.id), plan],
      }));
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("share");
      window.history.replaceState({}, "", cleanUrl);
      setNotice(plan.cloud?.permission === "viewer" ? "已開啟唯讀旅行。" : "已加入可共同編輯的旅行。 ");
    }).catch((error: { message?: string }) => {
      redeemedToken.current = "";
      setNotice(error.message?.includes("account_approval_required") ? "這個連結只開放指定帳號，請先用受邀的 Email 登入。" : "分享連結已失效、過期，或你沒有權限。 ");
    }).finally(() => setBusy(false));
  }, [configured, session, setState]);

  useEffect(() => {
    if (!configured || !session) return;
    const channels = sharedPlanIds.map((planId) => subscribeToTravelPlan(planId, (incoming) => {
      setState((current) => ({
        ...current,
        travelPlans: (current.travelPlans ?? []).map((item) => item.id === incoming.id ? {
          ...incoming,
          cloud: { ...incoming.cloud!, permission: item.cloud?.permission ?? incoming.cloud?.permission },
        } : item),
      }));
    }));
    return () => { channels.forEach((channel) => void removeTravelSubscription(channel)); };
  }, [configured, session, setState, sharedPlanIds]);

  useEffect(() => {
    if (!configured || !session) return;
    const published = (state.travelPlans ?? []).filter((plan) => plan.cloud?.published && plan.cloud.permission !== "viewer");
    if (!published.length) return;
    const timer = window.setTimeout(() => {
      published.forEach((plan) => void updatePublishedTravelPlan(plan).catch(() => setNotice("共編更新尚未送出；已保留在本機，稍後會再試。")));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [configured, session, state.travelPlans]);

  useEffect(() => {
    if (!configured || !isPermanentSession(session) || !privateSyncEnabled) return;
    const timer = window.setTimeout(() => {
      void writePrivateState(state).then(() => setNotice("私人手帳已同步。 ")).catch(() => setNotice("私人同步暫停；本機資料仍安全保留。 "));
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [configured, privateSyncEnabled, session, state]);

  const runBusy = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try { return await action(); } finally { setBusy(false); }
  }, []);

  return useMemo(() => ({
    configured,
    session,
    permanentAccount: isPermanentSession(session),
    privateSyncEnabled,
    busy,
    notice,
    setNotice,
    emailSignIn: (email: string) => runBusy(async () => {
      await sendMagicLink(email);
      setNotice("登入連結已寄出，請回到信箱完成登入。 ");
    }),
    signOut: () => runBusy(async () => {
      window.localStorage.removeItem(PRIVATE_SYNC_KEY);
      setPrivateSyncEnabled(false);
      await signOutCloud();
      setNotice("已登出；目前回到本機／訪客模式。 ");
    }),
    enablePrivateSync: (mode: "upload-local" | "use-cloud") => runBusy(async () => {
      if (!isPermanentSession(session)) throw new Error("permanent_account_required");
      if (mode === "use-cloud") {
        const remote = await readPrivateState();
        if (!remote) throw new Error("cloud_state_missing");
        setState(normalizeImportedState(remote));
      } else {
        if (!latestState.current) throw new Error("local_state_missing");
        await writePrivateState(latestState.current);
      }
      window.localStorage.setItem(PRIVATE_SYNC_KEY, "on");
      setPrivateSyncEnabled(true);
      setNotice(mode === "use-cloud" ? "已載入這個帳戶的私人手帳。" : "本機手帳已建立私人雲端副本。 ");
    }),
    disablePrivateSync: () => {
      window.localStorage.removeItem(PRIVATE_SYNC_KEY);
      setPrivateSyncEnabled(false);
      setNotice("已停止私人雲端同步；雲端副本未刪除。 ");
    },
    publishPlan: (plan: TravelPlan) => runBusy(() => publishTravelPlan(plan)),
    createShare: (options) => runBusy(() => createTravelShareLink(options)),
  }), [busy, configured, notice, privateSyncEnabled, runBusy, session, setState]);
}
