"use client";

import { ArrowRight, GitFork, LockKeyhole } from "lucide-react";
import Image from "next/image";

export default function PublicWelcome({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="welcome-shell">
      <header className="welcome-nav"><div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>Exchange Companion</small></div></div><button className="button text-button" onClick={onLogin}>登入</button></header>
      <section className="welcome-hero">
        <div className="welcome-copy"><p className="eyebrow">Exchange student &amp; study abroad planner</p><h1>交換大小事，<br />整理成下一步</h1><p>免費整合行前待辦、預算、行李、課程與旅行。重要資料可以依階段快速篩選、用白話搜尋；Telegram 直接按按鈕或傳一句話，不用背指令。</p><div className="welcome-actions"><button className="button primary" onClick={onLogin}>登入開始使用<ArrowRight size={18} /></button><a className="button secondary" href="https://github.com/NCCUJacky80936/exchange-companion" target="_blank" rel="noopener noreferrer"><GitFork size={18} />用 GitHub 建立自己的版本</a></div><small><LockKeyhole size={14} />交換進度、信件摘要與預算預設不公開；AI 只能送出待確認提案，仍由你決定是否套用。</small></div>
        <div className="welcome-art"><Image src="/images/exchange-hero-clean-720.webp" alt="手繪交換旅行行李與路線插畫" width={720} height={360} sizes="(max-width: 640px) 70vw, (max-width: 1024px) 52vw, 46vw" priority unoptimized /></div>
      </section>
      <section className="welcome-features" aria-label="主要功能"><article><Image src="/images/doodle-icons-v2/journey-route-160.webp" alt="" width={72} height={72} unoptimized /><h2>一條交換路線</h2><p>從申請、簽證、住宿到返國，把期限、預算與阻塞狀態集中追蹤。</p></article><article><Image src="/images/doodle-icons-v2/ai-spark-160.webp" alt="" width={72} height={72} unoptimized /><h2>智慧資源庫</h2><p>依行政、學業、生活、交通與料理分類，也能用同義詞快速找到官方資料。</p></article><article><Image src="/images/doodle-icons-v2/travel-suitcase-160.webp" alt="" width={72} height={72} unoptimized /><h2>Telegram 快速收件</h2><p>用選單或自然語言記下一件事，再回網站確認提案；不會直接改動手帳。</p></article></section>
      <section className="welcome-details" aria-labelledby="welcome-details-title">
        <div><p className="eyebrow">Made for exchange students</p><h2 id="welcome-details-title">不只德國，也能換成你的交換計畫</h2></div>
        <p>這是一套可自行架設的 open-source exchange program planner。更換國家、城市、學校、日期與幣別後，就能從申請一路整理到返國；純本機模式可直接使用，也能選配自己的 Supabase 私人同步。</p>
      </section>
      <aside className="welcome-safety-note" aria-label="資料安全提醒"><LockKeyhole size={17} /><p><strong>手帳不是密碼保管箱。</strong>請勿記錄密碼、API key、護照或身分證號、完整卡號、訂位代碼與精確住址；純本機資料會以未加密形式保存在這台裝置的瀏覽器。</p></aside>
    </main>
  );
}
