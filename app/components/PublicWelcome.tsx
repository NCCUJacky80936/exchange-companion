"use client";

import { ArrowRight, GitFork, LockKeyhole } from "lucide-react";
import Image from "next/image";

export default function PublicWelcome({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="welcome-shell">
      <header className="welcome-nav"><div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>Exchange Companion</small></div></div><button className="button text-button" onClick={onLogin}>登入</button></header>
      <section className="welcome-hero">
        <div className="welcome-copy"><p className="eyebrow">Your private exchange command center</p><h1>讓 AI 幫你輕鬆記錄<br />交換大小事</h1><p>把學校信件、行前任務、預算、行李與旅行安排放在同一個網頁 App。AI Agent 幫你整理，你只需要確認。</p><div className="welcome-actions"><button className="button primary" onClick={onLogin}>登入開始使用<ArrowRight size={18} /></button><a className="button secondary" href="https://github.com/NCCUJacky80936/exchange-companion" target="_blank" rel="noreferrer"><GitFork size={18} />用 GitHub 建立自己的版本</a></div><small><LockKeyhole size={14} />需要帳號，是因為交換進度、信件摘要、預算與行政資料都屬於私人紀錄；這是可安裝的網頁 App，不是 App Store 應用程式。</small></div>
        <div className="welcome-art"><Image src="/images/exchange-hero-clean-720.webp" alt="手繪交換旅行行李與路線插畫" width={720} height={360} sizes="(max-width: 640px) 70vw, (max-width: 1024px) 52vw, 46vw" priority unoptimized /></div>
      </section>
      <section className="welcome-features" aria-label="主要功能"><article><Image src="/images/doodle-icons-v2/journey-route-160.webp" alt="" width={72} height={72} unoptimized /><h2>一條交換路線</h2><p>從錄取、簽證、住宿到返國，期限與阻塞狀態集中追蹤。</p></article><article><Image src="/images/doodle-icons-v2/ai-spark-160.webp" alt="" width={72} height={72} unoptimized /><h2>AI 幫你補齊</h2><p>讀取你授權的信件、文件與網址，產生可逐項審核的更新。</p></article><article><Image src="/images/doodle-icons-v2/travel-suitcase-160.webp" alt="" width={72} height={72} unoptimized /><h2>行李與旅行一起看</h2><p>核對本人機票額度，並檢查旅行是否撞到上課或考試。</p></article></section>
    </main>
  );
}
