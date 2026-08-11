"use client";

import { ArrowRight, LockKeyhole, RefreshCw, Sparkles, UserRound } from "lucide-react";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";

export default function AuthGate({ cloud }: { cloud: ExchangeCloudController }) {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void cloud.accountSignIn(accountId, password);
  }

  if (cloud.permanentAccount && !cloud.accountDataReady) {
    return (
      <main className="auth-shell auth-loading" aria-live="polite">
        <section className="auth-card paper-card">
          <span className="tape" />
          <span className="auth-icon"><RefreshCw /></span>
          <p className="eyebrow">Private notebook</p>
          <h1>正在拿回你的交換手帳</h1>
          <p>{cloud.notice}</p>
          {!cloud.busy ? <button className="button secondary" onClick={() => void cloud.reloadPrivateState()}><RefreshCw size={17} />重新載入</button> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card paper-card" aria-labelledby="auth-title">
        <span className="tape" />
        <div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>Exchange Companion</small></div></div>
        <div className="auth-grid">
          <div className="auth-copy">
            <p className="eyebrow">Your exchange, kept private</p>
            <h1 id="auth-title">先登入，再打開你的私人手帳</h1>
            <p>交換進度、信件整理結果與行政紀錄只會在登入後載入。旅行分享連結仍可依擁有者設定免登入開啟。</p>
            <div className="auth-promises"><span><LockKeyhole size={17} />不同帳號不共用交換進度</span><span><Sparkles size={17} />登入後可交給 Exchange Concierge 整理</span></div>
          </div>
          <div className="auth-art" aria-hidden="true"><Image src="/images/doodle-icons/passport-safe.png" alt="" width={210} height={210} /></div>
        </div>
        {cloud.shareStatus === "login-required" ? <p className="auth-alert">這趟旅行只開放指定帳號，請使用受邀的帳號登入。</p> : null}
        {cloud.shareStatus === "invalid" ? <p className="auth-alert">分享連結已失效或過期；你仍可登入自己的手帳。</p> : null}
        <form className="auth-form" onSubmit={signIn}>
          <label><span>手帳帳號</span><div><UserRound size={18} /><input name="accountId" autoComplete="username" spellCheck={false} value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="例如 travel-austin" required /></div></label>
          <label><span>密碼</span><div><LockKeyhole size={18} /><input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 個字元" minLength={8} required /></div></label>
          <button className="button primary auth-submit" disabled={!accountId || password.length < 8 || cloud.busy} type="submit">登入我的手帳<ArrowRight size={18} /></button>
          <button className="button secondary" disabled={!accountId || password.length < 8 || cloud.busy} type="button" onClick={() => void cloud.createAccount(accountId, password)}>第一次使用，建立免費帳號</button>
        </form>
        <p className="auth-status" role="status">{cloud.notice}</p>
        <small className="auth-footnote">帳號不需 Email，目前沒有忘記密碼功能；請自行保存密碼。</small>
      </section>
    </main>
  );
}
