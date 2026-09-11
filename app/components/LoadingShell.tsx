export default function LoadingShell({ message = "正在打開你的交換手帳…" }: { message?: string }) {
  return (
    <div className="loading-shell" role="status" aria-live="polite">
      <span className="loading-brand" aria-hidden="true">旅</span>
      <strong>交換手帳</strong>
      <p>{message}</p>
      <div className="startup-recovery"><p>等待太久？可以重新載入頁面。</p><a href="?__fresh=1" data-startup-reload>重新載入</a></div>
    </div>
  );
}
