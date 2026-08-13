"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  cloudIsConfigured,
  acknowledgeConciergeProposalRuns,
  createConciergeConnection,
  createPasswordAccount,
  ensureCloudSession,
  getCloudClient,
  isPermanentSession,
  listConciergeConnections,
  loadTravelSharingSettings,
  publishTravelPlan,
  pullConciergeProposalRuns,
  readPrivateState,
  redeemTravelShare,
  removeTravelMember,
  removeTravelSubscription,
  restoreOwnedTravelPermissions,
  revokeConciergeConnection,
  sendMagicLink,
  signInWithPasswordAccount,
  signOutCloud,
  subscribeToTravelPlan,
  updateTravelLinkSettings,
  updateTravelMemberPermission,
  updatePublishedTravelPlan,
  upsertTravelMember,
  writePrivateState,
} from "./cloud";
import { findAiBundleCollisions, importAiBundle, matchesAiJourneyScope, validateAiImportBundle } from "./ai-import";
import { normalizeImportedState, resetState } from "./storage";
import { matchesPublicTravelPayload, publicTravelPayload } from "./travel-cloud";
import type { AppState, ConciergeConnectionFile, ConciergeConnectionInfo, TravelLinkSettings, TravelMemberAccess, TravelPlan, TravelSharingSettings } from "./types";

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
  privateRevision: number;
  syncConflict: boolean;
  conciergeConnections: ConciergeConnectionInfo[];
  conciergeConnectionsReady: boolean;
  busy: boolean;
  notice: string;
  setNotice: (notice: string) => void;
  createAccount: (accountId: string, email: string, password: string) => Promise<void>;
  accountSignIn: (accountId: string, password: string) => Promise<void>;
  emailSignIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadPrivateState: () => Promise<void>;
  enablePrivateSync: (mode: "upload-local" | "use-cloud") => Promise<void>;
  disablePrivateSync: () => void;
  markNextSaveActor: (actor: "manual" | "proposal") => void;
  createConciergeConnection: () => Promise<ConciergeConnectionFile>;
  refreshConciergeConnections: () => Promise<void>;
  revokeConciergeConnection: (connectionId: string) => Promise<void>;
  refreshConciergeInbox: () => Promise<number>;
  publishPlan: (plan: TravelPlan) => Promise<TravelPlan>;
  loadTravelSharing: (plan: TravelPlan) => Promise<TravelSharingSettings>;
  updateTravelLink: (plan: TravelPlan, settings: { enabled: boolean; permission: "viewer" | "editor"; expiresAt?: string }) => Promise<TravelLinkSettings>;
  upsertTravelMember: (plan: TravelPlan, account: string, permission: "viewer" | "editor") => Promise<TravelMemberAccess[]>;
  updateTravelMember: (plan: TravelPlan, memberId: string, permission: "viewer" | "editor") => Promise<TravelMemberAccess[]>;
  removeTravelMember: (plan: TravelPlan, memberId: string) => Promise<TravelMemberAccess[]>;
}

export function useExchangeCloud(state: AppState, setState: Dispatch<SetStateAction<AppState>>): ExchangeCloudController {
  const configured = cloudIsConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [accountDataReady, setAccountDataReady] = useState(!configured);
  const [shareStatus, setShareStatus] = useState<ShareRedemptionStatus>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("share") ? "loading" : "none");
  const [sharedPlanId, setSharedPlanId] = useState("");
  const [privateSyncEnabled, setPrivateSyncEnabled] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(PRIVATE_SYNC_KEY) === "on");
  const [privateRevision, setPrivateRevision] = useState(0);
  const [syncConflict, setSyncConflict] = useState(false);
  const [conciergeConnections, setConciergeConnections] = useState<ConciergeConnectionInfo[]>([]);
  const [conciergeConnectionsReady, setConciergeConnectionsReady] = useState(!configured);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(configured ? "正在準備免費雲端…" : "尚未連接免費雲端；本機功能仍可完整使用。 ");
  const redeemedToken = useRef("");
  const loadedAccount = useRef("");
  const latestState = useRef<AppState | null>(null);
  const lastSavedState = useRef<AppState | null>(null);
  const revisionRef = useRef(0);
  const nextSaveActor = useRef<"manual" | "proposal" | "system">("manual");
  const skipNextPrivateSave = useRef(false);
  const saveInFlight = useRef(false);
  const publishedPayloads = useRef(new Map<string, string>());
  const sharedPlanIds = useMemo(() => (state.travelPlans ?? [])
    .filter((plan) => plan.cloud?.published)
    .map((plan) => plan.cloud?.cloudPlanId ?? plan.id), [state.travelPlans]);

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
    setConciergeConnectionsReady(false);
    void listConciergeConnections(currentSession).then((connections) => {
      if (loadedAccount.current !== currentSession.user.id) return;
      setConciergeConnections(connections);
      setConciergeConnectionsReady(true);
    }).catch(() => {
      if (loadedAccount.current === currentSession.user.id) setConciergeConnectionsReady(false);
    });
    try {
      const remote = await readPrivateState(currentSession);
      if (remote) {
        const normalized = normalizeImportedState(remote.state);
        const repaired = await restoreOwnedTravelPermissions(normalized, currentSession);
        const historyWasPruned = JSON.stringify(repaired.aiInbox) !== JSON.stringify(remote.state.aiInbox);
        const ownershipWasRestored = repaired !== normalized;
        const revision = historyWasPruned || ownershipWasRestored ? await writePrivateState(repaired, remote.revision, "system") : remote.revision;
        revisionRef.current = revision;
        setPrivateRevision(revision);
        skipNextPrivateSave.current = true;
        lastSavedState.current = repaired;
        setState(repaired);
        setNotice(ownershipWasRestored ? "已載入私人手帳，並恢復你擁有的旅行分享權限。 " : "已載入你的私人交換手帳。 ");
      } else {
        const fresh = resetState();
        skipNextPrivateSave.current = true;
        setState(fresh);
        const revision = await writePrivateState(fresh, 0, "system");
        lastSavedState.current = fresh;
        revisionRef.current = revision;
        setPrivateRevision(revision);
        setNotice("已建立一份只屬於這個帳號的新手帳。可到「AI 幫我整理」首次連結 Codex。 ");
      }
      setSyncConflict(false);
      window.localStorage.setItem(PRIVATE_SYNC_KEY, "on");
      setPrivateSyncEnabled(true);
      setAccountDataReady(true);
    } catch {
      loadedAccount.current = "";
      setPrivateSyncEnabled(false);
      revisionRef.current = 0;
      setPrivateRevision(0);
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
      setState((current) => {
        const existing = (current.travelPlans ?? []).find((item) => item.id === incoming.id);
        if (existing && (incoming.updatedAt === existing.updatedAt || matchesPublicTravelPayload(incoming, existing))) return current;
        return {
          ...current,
          travelPlans: (current.travelPlans ?? []).map((item) => item.id === incoming.id ? {
            ...incoming,
            cloud: { ...incoming.cloud!, permission: item.cloud?.permission ?? incoming.cloud?.permission },
          } : item),
        };
      });
    }));
    return () => { channels.forEach((channel) => void removeTravelSubscription(channel)); };
  }, [configured, session, setState, sharedPlanIds]);

  useEffect(() => {
    if (!configured || !session) return;
    const published = (state.travelPlans ?? []).filter((plan) => plan.cloud?.published && plan.cloud.permission !== "viewer");
    if (!published.length) return;
    const changed = published.filter((plan) => {
      const planId = plan.cloud?.cloudPlanId ?? plan.id;
      const payload = JSON.stringify(publicTravelPayload(plan));
      if (publishedPayloads.current.get(planId) === payload) return false;
      publishedPayloads.current.set(planId, payload);
      return true;
    });
    if (!changed.length) return;
    const timer = window.setTimeout(() => {
      changed.forEach((plan) => void updatePublishedTravelPlan(plan).catch(() => {
        publishedPayloads.current.delete(plan.cloud?.cloudPlanId ?? plan.id);
        setNotice("共編更新尚未送出；已保留在本機，稍後會再試。");
      }));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [configured, session, state.travelPlans]);

  useEffect(() => {
    if (!configured || !isPermanentSession(session) || !privateSyncEnabled || !accountDataReady) return;
    if (skipNextPrivateSave.current) {
      skipNextPrivateSave.current = false;
      return;
    }
    if (state === lastSavedState.current) return;
    if (syncConflict || saveInFlight.current || revisionRef.current < 1) return;
    const timer = window.setTimeout(() => {
      saveInFlight.current = true;
      const actor = nextSaveActor.current;
      nextSaveActor.current = "manual";
      const expectedRevision = revisionRef.current;
      const stateToSave = actor === "proposal" && state.aiInbox ? {
        ...state,
        aiInbox: {
          ...state.aiInbox,
          proposals: state.aiInbox.proposals.map((proposal) => proposal.status === "pending" && proposal.baseRevision === expectedRevision
            ? { ...proposal, baseRevision: expectedRevision + 1 }
            : proposal),
        },
      } : state;
      if (stateToSave !== state) {
        skipNextPrivateSave.current = true;
        setState(stateToSave);
      }
      void writePrivateState(stateToSave, expectedRevision, actor).then((revision) => {
        lastSavedState.current = stateToSave;
        revisionRef.current = revision;
        setPrivateRevision(revision);
        setNotice("私人手帳已同步。 ");
        const terminalRunIds = [...new Set((stateToSave.aiInbox?.proposals ?? [])
          .filter((proposal) => proposal.cloudRunId)
          .map((proposal) => proposal.cloudRunId!))]
          .filter((runId) => !(stateToSave.aiInbox?.proposals ?? []).some((proposal) => proposal.cloudRunId === runId && proposal.status === "pending"));
        if (terminalRunIds.length) void acknowledgeConciergeProposalRuns(terminalRunIds);
      }).catch((error: { message?: string; code?: string }) => {
        if (error.code === "40001" || error.code === "PT409" || error.message?.includes("revision_conflict")) {
          setSyncConflict(true);
          setNotice("網站與雲端都有新修改，已停止自動覆蓋。請重新載入雲端版本後再整理。 ");
        } else {
          setNotice("私人同步暫停；本機資料仍安全保留。 ");
        }
      }).finally(() => { saveInFlight.current = false; });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [accountDataReady, configured, privateRevision, privateSyncEnabled, session, setState, state, syncConflict]);

  const runBusy = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try { return await action(); } finally { setBusy(false); }
  }, []);

  const refreshConnections = useCallback(async () => {
    if (!isPermanentSession(session)) return;
    try {
      const connections = await listConciergeConnections();
      setConciergeConnections(connections);
      setConciergeConnectionsReady(true);
    } catch (error) {
      setConciergeConnectionsReady(false);
      throw error;
    }
  }, [session]);

  const refreshInbox = useCallback(async (): Promise<number> => {
    if (!isPermanentSession(session) || !latestState.current) return 0;
    const runs = await pullConciergeProposalRuns();
    let next = latestState.current;
    let importedCount = 0;
    for (const run of runs) {
      const bundle = run.bundle;
      if (!validateAiImportBundle(bundle) || !matchesAiJourneyScope(next, bundle)) continue;
      if (bundle.baseRevision !== Number(run.base_revision) || bundle.baseRevision > revisionRef.current) continue;
      const collisions = findAiBundleCollisions(next, bundle);
      if (collisions.length) continue;
      next = importAiBundle(next, bundle, run.id);
      importedCount += bundle.proposals.length;
    }
    if (importedCount) {
      nextSaveActor.current = "proposal";
      setState(next);
    }
    return importedCount;
  }, [session, setState]);

  return useMemo(() => ({
    configured,
    authReady,
    accountDataReady,
    session,
    permanentAccount: isPermanentSession(session),
    shareStatus,
    sharedPlanId,
    privateSyncEnabled,
    privateRevision,
    syncConflict,
    conciergeConnections,
    conciergeConnectionsReady,
    busy,
    notice,
    setNotice,
    createAccount: async (accountId: string, email: string, password: string) => {
      try {
        const result = await runBusy(() => createPasswordAccount(accountId, email, password));
        setNotice(result === "confirmation-required" ? "帳號資料已建立，請先到 Email 完成驗證，再回來登入並繼續目的地設定。" : "帳號資料已建立。完成交換目的地設定後，才會正式進入你的手帳。 ");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        setNotice(message.includes("invalid_account_id") ? "帳號代號需為 3–32 個英文字母、數字、底線或連字號。" : message.includes("invalid_email") ? "請輸入可使用的 Email。" : message.includes("already") || message.includes("registered") ? "這個 Email 已註冊，請直接登入。" : "目前無法建立帳號，請稍後再試。 ");
      }
    },
    accountSignIn: async (accountId: string, password: string) => {
      try {
        await runBusy(() => signInWithPasswordAccount(accountId, password));
        setNotice("手帳帳號已登入。 ");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        setNotice(message.includes("cloud_not_configured")
          ? "本機尚未連接雲端，請補上本機設定並重新啟動網站。 "
          : message.includes("fetch") || message.includes("network")
            ? "目前無法連到雲端，請確認網路後再試。 "
            : "Email／舊版帳號代號或密碼不正確。 ");
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
      revisionRef.current = 0;
      setPrivateRevision(0);
      setSyncConflict(false);
      setConciergeConnections([]);
      setConciergeConnectionsReady(false);
      await signOutCloud();
      setNotice("已登出，請重新登入後再開啟私人手帳。 ");
    }),
    reloadPrivateState: () => isPermanentSession(session) ? runBusy(() => loadPermanentAccountState(session)) : Promise.resolve(),
    enablePrivateSync: (mode: "upload-local" | "use-cloud") => runBusy(async () => {
      if (!isPermanentSession(session)) throw new Error("permanent_account_required");
      if (mode === "use-cloud") {
        const remote = await readPrivateState();
        if (!remote) throw new Error("cloud_state_missing");
        skipNextPrivateSave.current = true;
        const normalized = normalizeImportedState(remote.state);
        const repaired = await restoreOwnedTravelPermissions(normalized, session);
        const revision = repaired !== normalized ? await writePrivateState(repaired, remote.revision, "system") : remote.revision;
        revisionRef.current = revision;
        setPrivateRevision(revision);
        lastSavedState.current = repaired;
        setState(repaired);
      } else {
        if (!latestState.current) throw new Error("local_state_missing");
        const expectedRevision = revisionRef.current;
        const revision = await writePrivateState(latestState.current, expectedRevision, "system");
        lastSavedState.current = latestState.current;
        revisionRef.current = revision;
        setPrivateRevision(revision);
      }
      setSyncConflict(false);
      window.localStorage.setItem(PRIVATE_SYNC_KEY, "on");
      setPrivateSyncEnabled(true);
      setNotice(mode === "use-cloud" ? "已載入這個帳戶的私人手帳。" : "本機手帳已建立私人雲端副本。 ");
    }),
    disablePrivateSync: () => {
      window.localStorage.removeItem(PRIVATE_SYNC_KEY);
      setPrivateSyncEnabled(false);
      setNotice("已停止私人雲端同步；雲端副本未刪除。 ");
    },
    markNextSaveActor: (actor: "manual" | "proposal") => { nextSaveActor.current = actor; },
    createConciergeConnection: () => runBusy(async () => {
      const connection = await createConciergeConnection();
      await refreshConnections();
      return connection;
    }),
    refreshConciergeConnections: () => runBusy(refreshConnections),
    revokeConciergeConnection: (connectionId: string) => runBusy(async () => {
      await revokeConciergeConnection(connectionId);
      await refreshConnections();
    }),
    refreshConciergeInbox: () => runBusy(refreshInbox),
    publishPlan: (plan: TravelPlan) => runBusy(() => publishTravelPlan(plan)),
    loadTravelSharing: (plan) => runBusy(() => loadTravelSharingSettings(plan)),
    updateTravelLink: (plan, settings) => runBusy(() => updateTravelLinkSettings(plan, settings)),
    upsertTravelMember: (plan, account, permission) => runBusy(() => upsertTravelMember(plan, account, permission)),
    updateTravelMember: (plan, memberId, permission) => runBusy(() => updateTravelMemberPermission(plan, memberId, permission)),
    removeTravelMember: (plan, memberId) => runBusy(() => removeTravelMember(plan, memberId)),
  }), [accountDataReady, authReady, busy, conciergeConnections, conciergeConnectionsReady, configured, loadPermanentAccountState, notice, privateRevision, privateSyncEnabled, refreshConnections, refreshInbox, runBusy, session, setState, shareStatus, sharedPlanId, syncConflict]);
}
