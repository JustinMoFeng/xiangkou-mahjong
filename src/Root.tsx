import { useEffect, useState } from "react";
import App from "./App";
import Home, { XiangkouModeSelect, type GameMode } from "./Home";
import SichuanApp from "./sichuan/SichuanApp";
import "./sichuan/sichuan.css";
import "./home.css";

type View = "home" | "xiangkou" | "classic" | "sichuan";

const BASE_PATH = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/+$/, "");

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function appPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (BASE_PATH && normalized === BASE_PATH) {
    return "/";
  }
  if (BASE_PATH && normalized.startsWith(`${BASE_PATH}/`)) {
    return normalizePath(normalized.slice(BASE_PATH.length));
  }
  return normalized;
}

function withBase(path: string): string {
  if (!BASE_PATH) {
    return path;
  }
  return path === "/" ? `${BASE_PATH}/` : `${BASE_PATH}${path}`;
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

  const path = appPath(window.location.pathname);
  if (path === "/game/xiangkou") {
    return "xiangkou";
  }
  if (path === "/classic" || path === "/play/xiangkou/bot") {
    return "classic";
  }
  if (path === "/sichuan" || path === "/game/sichuan") {
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
    const target = withBase(path);
    if (normalizePath(window.location.pathname) !== normalizePath(target) || window.location.search) {
      window.history.pushState({}, "", target);
    }
    setView(next);
  }

  function select(mode: GameMode) {
    if (mode === "xiangkou") {
      navigate("/game/xiangkou", "xiangkou");
      return;
    }
    navigate("/game/sichuan", "sichuan");
  }

  function enterClassicBot() {
    navigate("/play/xiangkou/bot", "classic");
  }

  function backHome() {
    navigate("/", "home");
  }

  if (view === "home") {
    return <Home onSelect={select} />;
  }

  if (view === "xiangkou") {
    return <XiangkouModeSelect onBackHome={backHome} onEnterBot={enterClassicBot} />;
  }

  if (view === "sichuan") {
    return <SichuanApp onBackHome={backHome} />;
  }

  return <App onBackHome={() => navigate("/game/xiangkou", "xiangkou")} />;
}
