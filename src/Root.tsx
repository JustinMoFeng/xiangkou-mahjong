import { useState } from "react";
import App from "./App";
import Home, { type GameMode } from "./Home";
import SichuanApp from "./sichuan/SichuanApp";
import "./sichuan/sichuan.css";
import "./home.css";

const MODE_KEY = "xiangkou-mode-v1";

type View = "home" | GameMode;

function resolveInitialView(): View {
  const params = new URLSearchParams(window.location.search);

  // Scenario URLs always target the classic game (used by e2e/dev tools).
  if (params.get("scenario")) {
    return "classic";
  }

  const modeParam = params.get("mode");
  if (modeParam === "classic" || modeParam === "sichuan") {
    return modeParam;
  }

  const saved = window.localStorage.getItem(MODE_KEY);
  if (saved === "classic" || saved === "sichuan") {
    return saved;
  }

  return "home";
}

export default function Root() {
  const [view, setView] = useState<View>(resolveInitialView);

  function select(mode: GameMode) {
    window.localStorage.setItem(MODE_KEY, mode);
    setView(mode);
  }

  function backHome() {
    window.localStorage.removeItem(MODE_KEY);
    setView("home");
  }

  if (view === "home") {
    return <Home onSelect={select} />;
  }

  if (view === "sichuan") {
    return <SichuanApp onBackHome={backHome} />;
  }

  return <App onBackHome={backHome} />;
}
