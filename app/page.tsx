import LoadingShell from "./components/LoadingShell";
import AppEntry from "./components/AppEntry";

export default function Home() {
  return <><div className="initial-loading-shell"><LoadingShell /></div><AppEntry /></>;
}
