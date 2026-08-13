"use client";

import { Bot, Check, ChevronRight, Cloud, Copy, Download, FileJson, FolderGit2, Link2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildFirstConciergePrompt, buildSkillInstallPrompt, EXCHANGE_COMPANION_REPOSITORY } from "../lib/concierge-starter";
import type { AppState } from "../lib/types";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";

function downloadConnection(connection: Awaited<ReturnType<ExchangeCloudController["createConciergeConnection"]>>): void {
  const blob = new Blob([JSON.stringify(connection, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "exchange-concierge-connection.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function HomeActivationGuide({
  state,
  setState,
  cloud,
  forced,
  onClose,
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  cloud: ExchangeCloudController;
  forced: boolean;
  onClose: () => void;
}) {
  const [route, setRoute] = useState<"online" | "repository">("online");
  const [message, setMessage] = useState("");
  const [copiedFirstRun, setCopiedFirstRun] = useState(false);
  const activeConnection = useMemo(() => cloud.conciergeConnections.find((connection) => !connection.revokedAt), [cloud.conciergeConnections]);
  const firstImport = state.aiInbox?.lastImportedAt;
  const pending = (state.aiInbox?.proposals ?? []).filter((proposal) => proposal.status === "pending").length;
  const cloudReady = !cloud.configured || (cloud.permanentAccount && cloud.privateRevision > 0 && cloud.privateSyncEnabled);
  const syncStatus = !cloud.configured
    ? "本機私人手帳已建立；可使用 JSON 離線交接"
    : cloudReady
      ? "私人同步已就緒"
      : "先建立私人雲端副本，AI 才能讀到同一份最新手帳";
  const skillPromptCopied = Boolean(state.homeExperience?.starterPromptCopiedAt);

  async function copySkillPrompt() {
    try {
      await navigator.clipboard.writeText(buildSkillInstallPrompt());
      const copiedAt = new Date().toISOString();
      setState((current) => ({ ...current, homeExperience: { mode: current.homeExperience?.mode ?? "activation", workflow: current.homeExperience?.workflow ?? "undecided", tutorialVersion: current.homeExperience?.tutorialVersion ?? 1, starterPromptCopiedAt: copiedAt, activatedAt: current.homeExperience?.activatedAt } }));
      setMessage("安裝指令已複製；裡面只有公開 GitHub 路徑，不含私人 token。 ");
    } catch {
      setMessage("瀏覽器沒有允許複製。請改用已下載的 GitHub 專案，或允許剪貼簿權限後再試。 ");
    }
  }

  async function createConnection() {
    try {
      const connection = await cloud.createConciergeConnection();
      downloadConnection(connection);
      setMessage("私人連結檔已下載。只交給你的 Codex 一次，請勿上傳 GitHub 或分享。 ");
    } catch {
      setMessage("目前無法建立連結。請先確認帳號已登入，且私人手帳已完成同步。 ");
    }
  }

  async function copyFirstRunPrompt() {
    try {
      await navigator.clipboard.writeText(buildFirstConciergePrompt());
      setCopiedFirstRun(true);
      setMessage("第一次整理指令已複製；請連同私人連結檔交給 Codex。 ");
      window.setTimeout(() => setCopiedFirstRun(false), 1800);
    } catch {
      setMessage("瀏覽器沒有允許複製。請允許剪貼簿權限，或到 AI 頁下載 JSON 交接檔。 ");
    }
  }

  function useManualMode() {
    const activatedAt = new Date().toISOString();
    setState((current) => ({ ...current, homeExperience: { mode: "dashboard", workflow: "manual", tutorialVersion: current.homeExperience?.tutorialVersion ?? 1, starterPromptCopiedAt: current.homeExperience?.starterPromptCopiedAt, activatedAt } }));
    window.scrollTo({ top: 0, behavior: "auto" });
    onClose();
  }

  return <div className="activation-home">
    <header className="activation-heading">
      <div><p className="eyebrow">第一次使用</p><h1>{forced ? "重新打開啟用指南" : "啟用你的交換手帳"}</h1><p>網站負責保存與呈現；Codex 只在你授權後整理資料，所有變更都先回到待確認區。</p></div>
      <span className="activation-progress-stamp">{[cloudReady, skillPromptCopied, Boolean(activeConnection), Boolean(firstImport)].filter(Boolean).length}<small>/ 4</small></span>
    </header>

    <ol className="activation-steps">
      <li className={cloudReady ? "complete" : "active"}>
        <div className="activation-step-number">{cloudReady ? <Check /> : "1"}</div>
        <section className="activation-step-card paper-card">
          <div className="activation-step-heading"><Cloud /><div><span>STEP 01</span><h2>私人手帳已建立</h2></div></div>
          <p>{state.journey.hostCity || "目的地待補"} · {state.journey.hostSchool || "交換學校可之後補齊"}</p>
          <div className="activation-status-line"><ShieldCheck size={17} /><span>{syncStatus}</span></div>
          {!cloudReady && cloud.permanentAccount ? <button className="button primary" disabled={cloud.busy} onClick={() => void cloud.enablePrivateSync("upload-local")}><Cloud size={17} />建立私人同步</button> : null}
        </section>
      </li>

      <li className={skillPromptCopied || route === "repository" ? "complete" : "active"}>
        <div className="activation-step-number">{skillPromptCopied || route === "repository" ? <Check /> : "2"}</div>
        <section className="activation-step-card paper-card">
          <div className="activation-step-heading"><FolderGit2 /><div><span>STEP 02</span><h2>準備 AI Skills</h2></div></div>
          <div className="activation-route-tabs" role="tablist" aria-label="使用方式"><button role="tab" aria-selected={route === "online"} className={route === "online" ? "active" : ""} onClick={() => setRoute("online")}>只使用線上網站</button><button role="tab" aria-selected={route === "repository"} className={route === "repository" ? "active" : ""} onClick={() => setRoute("repository")}>已下載 GitHub 專案</button></div>
          {route === "online" ? <div className="activation-route-copy activation-route-detailed"><p>先把三個公開 Skills 裝進你自己的 Codex。這一步只安裝操作說明，不會讀取你的信件、檔案或手帳。</p><ol className="activation-micro-steps"><li><strong>打開 Codex</strong><span>建立一個新任務，或回到你準備交換資料的任務。</span></li><li><strong>複製並貼上安裝指令</strong><span>按下方按鈕，回到 Codex 貼上後送出。</span></li><li><strong>等 Codex 回報完成</strong><span>看到 3 個 Skills 都可使用後，再回來做 STEP 03。</span></li></ol><button className="button primary" onClick={() => void copySkillPrompt()}><Copy size={17} />{skillPromptCopied ? "再次複製安裝指令" : "複製安裝指令"}</button></div> : <div className="activation-route-copy activation-route-detailed"><p>你下載的 GitHub 專案已經內建 Skills，不需要再安裝。</p><ol className="activation-micro-steps"><li><strong>用 Codex 開啟專案資料夾</strong><span>確認工作資料夾是這個 Exchange Companion 專案。</span></li><li><strong>直接前往 STEP 03</strong><span>稍後把私人連結檔交給同一個 Codex 任務。</span></li></ol><a className="button secondary" href={EXCHANGE_COMPANION_REPOSITORY} target="_blank" rel="noreferrer"><FolderGit2 size={17} />查看公開專案</a></div>}
        </section>
      </li>

      <li className={activeConnection ? "complete" : "active"}>
        <div className="activation-step-number">{activeConnection ? <Check /> : "3"}</div>
        <section className="activation-step-card paper-card">
          <div className="activation-step-heading"><Link2 /><div><span>STEP 03</span><h2>首次連結 Codex</h2></div></div>
          <p>這一步會下載一個名為 <strong>exchange-concierge-connection.json</strong> 的私人連結檔。它只讓 Agent 讀取最新手帳並送回待審提案，不能替你直接套用。</p>
          <ol className="activation-micro-steps"><li><strong>按下方按鈕下載</strong><span>通常會出現在瀏覽器的「下載項目」。不用打開或修改檔案。</span></li><li><strong>把檔案留在私人位置</strong><span>不要傳給別人，也不要放上 GitHub、雲端公開連結或群組。</span></li><li><strong>下一步會把它附給 Codex</strong><span>連結檔只需交給自己的 Codex 一次，之後可隨時撤銷。</span></li></ol>
          <button className="button primary" disabled={!cloud.permanentAccount || cloud.privateRevision < 1 || cloud.busy} onClick={() => void createConnection()}><Download size={17} />{activeConnection ? "重新下載私人連結檔" : "下載 exchange-concierge-connection.json"}</button>
          {!cloud.configured ? <p className="activation-offline-note"><FileJson size={16} />離線使用時可改到 AI 頁下載 JSON 交接檔；第一次合法匯入也會完成啟用。</p> : null}
        </section>
      </li>

      <li className={firstImport ? "complete" : "active"}>
        <div className="activation-step-number">{firstImport ? <Check /> : "4"}</div>
        <section className="activation-step-card paper-card">
          <div className="activation-step-heading"><Sparkles /><div><span>STEP 04</span><h2>完成第一次整理</h2></div></div>
          <p>最後把私人連結檔與第一次整理指令放進同一個 Codex 任務。Codex 會先問你願意開放哪些資料，不會直接掃描全部內容。</p>
          <ol className="activation-micro-steps"><li><strong>複製第一次整理指令</strong><span>按下方「複製第一次整理指令」。</span></li><li><strong>回到剛才的 Codex 任務</strong><span>用附件按鈕加入 STEP 03 下載的 <code>exchange-concierge-connection.json</code>。</span></li><li><strong>貼上指令並送出</strong><span>不要把連結檔內容或 token 貼成文字，只要附上原檔。</span></li><li><strong>確認授權範圍</strong><span>Codex 問到信箱、資料夾、網址或日期時，只勾選你願意提供的範圍。</span></li><li><strong>等 Codex 說提案已送回</strong><span>再回到這裡按「檢查回傳」。看到待確認提案就代表成功。</span></li></ol>
          <div className="activation-verification-grid"><span className={activeConnection?.lastUsedAt ? "done" : ""}>{activeConnection?.lastUsedAt ? <Check /> : <Bot />}Agent 已讀取</span><span className={firstImport ? "done" : ""}>{firstImport ? <Check /> : <RefreshCw />}提案已送回</span><span className={pending ? "done" : ""}>{pending ? <Check /> : <ChevronRight />}等待你確認 {pending ? `· ${pending}` : ""}</span></div>
          <div className="activation-final-actions"><button className="button primary" onClick={() => void copyFirstRunPrompt()}><Copy size={17} />{copiedFirstRun ? "已複製" : "複製第一次整理指令"}</button>{cloud.permanentAccount ? <button className="button secondary" disabled={cloud.busy} onClick={() => void cloud.refreshConciergeInbox()}><RefreshCw size={17} />檢查回傳</button> : null}</div>
        </section>
      </li>
    </ol>

    {message ? <p className="activation-message" role="status">{message}</p> : null}
    <footer className="activation-footer"><div><strong>還不想連接 AI？</strong><span>所有任務、旅行、預算與行李仍可完整手動使用。</span></div><button className="button text-button" onClick={useManualMode}>先用純手動模式 <ChevronRight size={17} /></button>{forced ? <button className="button secondary" onClick={onClose}>返回控制台</button> : null}</footer>
  </div>;
}
