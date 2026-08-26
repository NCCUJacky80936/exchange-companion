"use client";

import { ArrowLeft, ArrowRight, GitFork, LockKeyhole, RefreshCw, Sparkles, UserRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";

type AuthView = "welcome" | "login" | "register";

export default function AuthGate({ cloud }: { cloud: ExchangeCloudController }) {
  const [view, setView] = useState<AuthView>("welcome");
  const [identifier, setIdentifier] = useState("");
  const [accountId, setAccountId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  if (cloud.permanentAccount && !cloud.accountDataReady) {
    return <main className="auth-shell auth-loading"><section className="auth-card paper-card"><span className="tape" /><span className="auth-icon"><RefreshCw /></span><p className="eyebrow">Private notebook</p><h1>正在拿回你的交換手帳</h1><p>{cloud.notice}</p>{!cloud.busy ? <button className="button secondary" onClick={() => void cloud.reloadPrivateState()}><RefreshCw size={17} />重新載入</button> : null}</section></main>;
  }

  if (view === "welcome") return (
    <main className="welcome-shell">
      <header className="welcome-nav"><div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>Exchange Companion</small></div></div><button className="button text-button" onClick={() => setView("login")}>登入</button></header>
      <section className="welcome-hero">
        <div className="welcome-copy"><p className="eyebrow">Your private exchange command center</p><h1>讓 AI 幫你輕鬆記錄<br />交換大小事</h1><p>把學校信件、行前任務、預算、行李與旅行安排放在同一個網頁 App。AI Agent 幫你整理，你只需要確認。</p><div className="welcome-actions"><button className="button primary" onClick={() => setView("login")}>登入開始使用<ArrowRight size={18} /></button><a className="button secondary" href="https://github.com/NCCUJacky80936/exchange-companion" target="_blank" rel="noreferrer"><GitFork size={18} />用 GitHub 建立自己的版本</a></div><small><LockKeyhole size={14} />需要帳號，是因為交換進度、信件摘要、預算與行政資料都屬於私人紀錄；這是可安裝的網頁 App，不是 App Store 應用程式。</small></div>
        <div className="welcome-art"><Image src="/images/exchange-hero-clean.webp" alt="手繪交換旅行行李與路線插畫" width={520} height={296} sizes="(max-width: 640px) 70vw, (max-width: 1024px) 52vw, 46vw" priority /></div>
      </section>
      <section className="welcome-features" aria-label="主要功能"><article><Image src="/images/doodle-icons-v2/journey-route.webp" alt="" width={72} height={72} /><h2>一條交換路線</h2><p>從錄取、簽證、住宿到返國，期限與阻塞狀態集中追蹤。</p></article><article><Image src="/images/doodle-icons-v2/ai-spark.webp" alt="" width={72} height={72} /><h2>AI 幫你補齊</h2><p>讀取你授權的信件、文件與網址，產生可逐項審核的更新。</p></article><article><Image src="/images/doodle-icons-v2/travel-suitcase.webp" alt="" width={72} height={72} /><h2>行李與旅行一起看</h2><p>核對本人機票額度，並檢查旅行是否撞到上課或考試。</p></article></section>
    </main>
  );

  const submitLogin = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void cloud.accountSignIn(identifier, password); };
  const submitRegister = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void cloud.createAccount(accountId, email, password); };
  return (
    <main className="auth-shell">
      <section className="auth-card paper-card" aria-labelledby="auth-title"><span className="tape" /><button className="auth-back" onClick={() => setView("welcome")}><ArrowLeft size={16} />回到介紹</button><div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>{view === "login" ? "Welcome back" : "Create your private notebook"}</small></div></div>
        <div className="auth-grid"><div className="auth-copy"><p className={`eyebrow ${view === "register" ? "structural-eyebrow" : ""}`}>{view === "login" ? "Private sign in" : "Step 1 of 3"}</p><h1 id="auth-title">{view === "login" ? "打開你的私人手帳" : "先建立登入資料"}</h1><p>{view === "login" ? "登入後才會載入你的交換進度與 AI 整理結果。" : "帳號資料完成後，再用兩個短步驟設定交換目的地；全部走完才會進入主畫面。"}</p></div><div className="auth-art" aria-hidden="true"><Image src="/images/doodle-icons-v2/home-notebook.webp" alt="" width={210} height={210} /></div></div>
        {cloud.shareStatus === "login-required" ? <p className="auth-alert">這趟旅行只開放指定帳號，請使用受邀帳號登入。</p> : null}
        {view === "login" ? <form className="auth-form" onSubmit={submitLogin}><label className="auth-field-full"><span>Email 或舊版帳號代號</span><div><UserRound size={18} /><input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></div></label><label className="auth-field-full"><span>密碼</span><div><LockKeyhole size={18} /><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></div></label><button className="button primary auth-submit" disabled={!identifier || password.length < 8 || cloud.busy}>登入我的手帳<ArrowRight size={18} /></button><button className="button secondary auth-field-full" type="button" onClick={() => { setPassword(""); setView("register"); }}>第一次使用？建立帳號</button></form>
          : <><div className="onboarding-progress"><span className="active">1 帳號</span><span>2 目的地</span><span>3 交換細節</span></div><form className="auth-form" onSubmit={submitRegister}><label><span>帳號代號</span><div><UserRound size={18} /><input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="travel-austin" pattern="[A-Za-z0-9_-]{3,32}" required /></div></label><label><span>Email</span><div><Sparkles size={18} /><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></label><label className="auth-field-full"><span>密碼</span><div><LockKeyhole size={18} /><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></div></label><button className="button primary auth-submit" disabled={!accountId || !email || password.length < 8 || cloud.busy}>下一步：設定目的地<ArrowRight size={18} /></button><button className="button text-button auth-field-full" type="button" onClick={() => { setPassword(""); setView("login"); }}>已經有帳號？登入</button></form></>}
        <p className="auth-status" role="status">{cloud.notice}</p>
      </section>
    </main>
  );
}
