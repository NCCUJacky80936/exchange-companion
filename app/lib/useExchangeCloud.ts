"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  cloudIsConfigured,
  createPasswordAccount,
  createTravelShareLink,
  ensureCloudSession,
  getCloudClient,
  isPermanentSession,
  publishTravelPlan,
  readPrivateState,
  redeemTravelShare,
  removeTravelSubscription,
  sendMagicLink,
  signInWithPasswordAccount,
  signOutCloud,
  subscribeToTravelPlan,
  updatePublishedTravelPlan,
  writePrivateState,
} from "./cloud";
import { normalizeImportedState, resetState } from "./storage";
import type { AppState, TravelPlan, TravelShareAccess, TravelShareLink } from "./types";

const PRIVATE_SYNC_KEY = "exchange-companion:private-cloud-sync";
export type ShareRedemptionStatus = "none" | "loading" | "active" | "login-required" | "invalid";

export interface ExchangeCloudController {
  configured: boolean;
  authReady: boolean;
  accountDataReady: boolean;
  session: Session | null;
  permanentAccount: boolean;
  shareStatus: ShareRedemptionStatus;
  sharedPlanId: string;
  privateSyncEnabled: boolean;
  busy: boolean;
  notice: string;
  setNotice: (notice: string) => void;
  createAccount: (accountId: string, password: string) => Promise<void>;
  accountSignIn: (accountId: string, password: string) => Promise<void>;
  emailSignIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadPrivateState: () => Promise<void>;
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
  const [authReady, setAuthReady] = useState(!configured);
  const [accountDataReady, setAccountDataReady] = useState(!configured);
  const [shareStatus, setShareStatus] = useState<ShareRedemptionStatus>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("share") ? "loading" : "none");
  const [sharedPlanId, setSharedPlanId] = useState("");
  const [privateSyncEnabled, setPrivateSyncEnabled] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(PRIVATE_SYNC_KEY) === "on");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(configured ? "正在準備免費雲端…" : "尚未連接免費雲端；本機功能仍可完整使用。 ");
  const redeemedToken = useRef("");
  const loadedAccount = useRef("");
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
      setNotice(current?.user.is_anonymous ? "請先登入；旅行分享連結仍可免登入開啟。" : "帳戶已連線。 ");
    }).catch(() => setNotice("雲端暫時無法連線，請重新整理後再試。"))
      .finally(() => setAuthReady(true));
    const { data: listener } = client!.auth.onAuthStateChange((_event, nextSession) => {
      if (!isPermanentSession(nextSession)) setAccountDataReady(false);
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [configured]);

  const loadPermanentAccountState = useCallback(async (currentSession: Session) => {
    if (!isPermanentSession(currentSession)) return;
    loadedAccount.current = currentSession.user.id;
    setAccountDataReady(false);
    try {
      const remote = await readPrivateState();
      if (remote) {
        setState(normalizeImportedState(remote));
        setNotice("已載入你的私人交換手帳。 ");
      } else {
        const fresh = resetState();
        setState(fresh);
        await writePrivateState(fresh);
        setNotice("已建立一份只屬於這個帳號的新手帳。先到「AI 幫我整理」匯出交接檔即可開始。 ");
      }
      window.localStorage.setItem(PRIVATE_SYNC_KEY, "on");
      setPrivateSyncEnabled(true);
      setAccountDataReady(true);
    } catch {
      loadedAccount.current = "";
      setPrivateSyncEnabled(false);
      setNotice("目前無法載入私人手帳；尚未進入主畫面，也沒有覆蓋本機資料。 ");
    }
  }, [setState]);

  useEffect(() => {
    if (!configured || !isPermanentSession(session)) {
      loadedAccount.current = "";
      return;
    }
    if (loadedAccount.current !== session.user.id) void loadPermanentAccountState(session);
  }, [configured, loadPermanentAccountState, session]);

  useEffect(() => {
    if (!configured || !session) return;
    const token = new URLSearchParams(window.location.search).get("share");
    if (!token || redeemedToken.current === token) return;
    redeemedToken.current = token;
    setShareStatus("loading");
    setBusy(true);
    void redeemTravelShare(token).then((plan) => {
      setState((current) => ({
        ...current,
        travelPlans: [...(current.travelPlans ?? []).filter((item) => item.id !== plan.id), plan],
      }));
      setSharedPlanId(plan.id);
      setShareStatus("active");
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("share");
      window.history.replaceState({}, "", cleanUrl);
      setNotice(plan.cloud?.permission === "viewer" ? "已開啟唯讀旅行。" : "已加入可共同編輯的旅行。 ");
    }).catch((error: { message?: string }) => {
      redeemedToken.current = "";
      const loginRequired = error.message?.includes("account_approval_required");
      setShareStatus(loginRequired ? "login-required" : "invalid");
      setNotice(loginRequired ? "這個連結只開放指定手帳帳號，請先用受邀的帳號代號登入。" : "分享連結已失效、過期，或你沒有權限。 ");
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
    if (!configured || !isPermanentSession(session) || !privateSyncEnabled || !accountDataReady) return;
    const timer = window.setTimeout(() => {
      void writePrivateState(state).then(() => setNotice("私人手帳已同步。 ")).catch(() => setNotice("私人同步暫停；本機資料仍安全保留。 "));
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [accountDataReady, configured, privateSyncEnabled, session, state]);

  const runBusy = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try { return await action(); } finally { setBusy(false); }
  }, []);

  return useMemo(() => ({
    configured,
    authReady,
    accountDataReady,
    session,
    permanentAccount: isPermanentSession(session),
    shareStatus,
    sharedPlanId,
    privateSyncEnabled,
    busy,
    notice,
    setNotice,
    createAccount: async (accountId: string, password: string) => {
      try {
        await runBusy(() => createPasswordAccount(accountId, password));
        setNotice("免費手帳帳號已建立並登入。請妥善保存密碼；目前不提供 Email 密碼重設。 ");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        setNotice(message.includes("invalid_account_id") ? "帳號代號需為 3–32 個英文字母、數字、底線或連字號。" : message.includes("already") || message.includes("registered") ? "這個帳號代號已有人使用，請直接登入或更換代號。" : "目前無法建立帳號，請稍後再試。 ");
      }
    },
    accountSignIn: async (accountId: string, password: string) => {
      try {
        await runBusy(() => signInWithPasswordAccount(accountId, password));
        setNotice("手帳帳號已登入。 ");
      } catch {
        setNotice("帳號代號或密碼不正確。 ");
      }
    },
    emailSignIn: (email: string) => runBusy(async () => {
      await sendMagicLink(email);
      setNotice("登入連結已寄出，請回到信箱完成登入。 ");
    }),
    signOut: () => runBusy(async () => {
      window.localStorage.removeItem(PRIVATE_SYNC_KEY);
      setPrivateSyncEnabled(false);
      setAccountDataReady(false);
      loadedAccount.current = "";
      await signOutCloud();
      setNotice("已登出，請重新登入後再開啟私人手帳。 ");
    }),
    reloadPrivateState: () => isPermanentSession(session) ? runBusy(() => loadPermanentAccountState(session)) : Promise.resolve(),
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
  }), [accountDataReady, authReady, busy, configured, loadPermanentAccountState, notice, privateSyncEnabled, runBusy, session, setState, shareStatus, sharedPlanId]);
}
