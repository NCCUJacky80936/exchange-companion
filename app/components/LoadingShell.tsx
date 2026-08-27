export default function LoadingShell({ message = "正在打開你的交換手帳…" }: { message?: string }) {
  return (
    <div className="loading-shell" role="status" aria-live="polite">
      <span className="loading-brand" aria-hidden="true">旅</span>
      <strong>交換手帳</strong>
      <p>{message}</p>
    </div>
  );
}
