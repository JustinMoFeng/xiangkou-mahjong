import { useEffect, useState } from "react";
import App from "./App";
import Home, { type GameMode } from "./Home";
import SichuanApp from "./sichuan/SichuanApp";
import "./sichuan/sichuan.css";
import "./home.css";

type View = "home" | GameMode;

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function resolveView(): View {
  const params = new URLSearchParams(window.location.search);

  // Scenario URLs always target the classic game (used by e2e/dev tools).
  if (params.get("scenario")) {
    return "classic";
  }

  // Legacy query param support: ?mode=classic|sichuan
  const modeParam = params.get("mode");
  if (modeParam === "classic" || modeParam === "sichuan") {
    return modeParam;
  }

  const path = normalizePath(window.location.pathname);
  if (path === "/classic") {
    return "classic";
  }
  if (path === "/sichuan") {
    return "sichuan";
  }
  return "home";
}

export default function Root() {
  const [view, setView] = useState<View>(resolveView);

  useEffect(() => {
    const onPopState = () => setView(resolveView());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string, next: View) {
    if (normalizePath(window.location.pathname) !== path || window.location.search) {
      window.history.pushState({}, "", path);
    }
    setView(next);
  }

  function select(mode: GameMode) {
    navigate(`/${mode}`, mode);
  }

  function backHome() {
    navigate("/", "home");
  }

  if (view === "home") {
    return <Home onSelect={select} />;
  }

  if (view === "sichuan") {
    return <SichuanApp onBackHome={backHome} />;
  }

  return <App onBackHome={backHome} />;
}
