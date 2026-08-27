export function markExchangePerformance(name: string): void {
  if (process.env.NODE_ENV === "production" || typeof performance === "undefined" || typeof performance.mark !== "function") return;
  performance.mark(`exchange:${name}`);
}
