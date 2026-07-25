import { useEffect, useState } from "react";
import App from "./App";
import Home, { SichuanModeSelect, XiangkouModeSelect, type GameMode } from "./Home";
import LinkMatchApp from "./link-match/LinkMatchApp";
import { SichuanCreateRoom, SichuanJoinRoom } from "./online/SichuanRoom";
import { XiangkouCreateRoom, XiangkouJoinRoom } from "./online/XiangkouRoom";
import SichuanApp from "./sichuan/SichuanApp";
import YangYangApp from "./yangyang/YangYangApp";
import "./sichuan/sichuan.css";
import "./home.css";

type View =
  | "home"
  | "xiangkou"
  | "xiangkouRoomCreate"
  | "xiangkouRoomJoin"
  | "sichuanMode"
  | "sichuanRoomCreate"
  | "sichuanRoomJoin"
  | "classic"
  | "sichuan"
  | "link-match"
  | "yangyang";

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
  if (path === "/play/xiangkou/room/create") {
    return "xiangkouRoomCreate";
  }
  if (path === "/play/xiangkou/room" || path.startsWith("/play/xiangkou/room/")) {
    return "xiangkouRoomJoin";
  }
  if (path === "/game/sichuan") {
    return "sichuanMode";
  }
  if (path === "/sichuan" || path === "/play/sichuan/bot") {
    return "sichuan";
  }
  if (path === "/play/sichuan/room/create") {
    return "sichuanRoomCreate";
  }
  if (path === "/play/sichuan/room" || path.startsWith("/play/sichuan/room/")) {
    return "sichuanRoomJoin";
  }
  if (path === "/play/link-match") {
    return "link-match";
  }
  if (path === "/play/yangyang") {
    return "yangyang";
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
    if (mode === "sichuan") {
      navigate("/game/sichuan", "sichuanMode");
      return;
    }
    if (mode === "link-match") {
      navigate("/play/link-match", "link-match");
      return;
    }
    navigate("/play/yangyang", "yangyang");
  }

  function enterClassicBot() {
    navigate("/play/xiangkou/bot", "classic");
  }

  function createXiangkouRoom() {
    navigate("/play/xiangkou/room/create", "xiangkouRoomCreate");
  }

  function joinXiangkouRoom(roomCode?: string) {
    const suffix = roomCode ? `/${roomCode}` : "";
    navigate(`/play/xiangkou/room${suffix}`, "xiangkouRoomJoin");
  }

  function enterSichuanBot() {
    navigate("/play/sichuan/bot", "sichuan");
  }

  function createSichuanRoom() {
    navigate("/play/sichuan/room/create", "sichuanRoomCreate");
  }

  function joinSichuanRoom(roomCode?: string) {
    const suffix = roomCode ? `/${roomCode}` : "";
    navigate(`/play/sichuan/room${suffix}`, "sichuanRoomJoin");
  }

  function backHome() {
    navigate("/", "home");
  }

  if (view === "home") {
    return <Home onSelect={select} />;
  }

  if (view === "xiangkou") {
    return (
      <XiangkouModeSelect
        onBackHome={backHome}
        onEnterBot={enterClassicBot}
        onCreateRoom={createXiangkouRoom}
        onJoinRoom={joinXiangkouRoom}
      />
    );
  }

  if (view === "xiangkouRoomCreate") {
    return <XiangkouCreateRoom onBackMode={() => navigate("/game/xiangkou", "xiangkou")} />;
  }

  if (view === "xiangkouRoomJoin") {
    const path = appPath(window.location.pathname);
    const roomCode = path.startsWith("/play/xiangkou/room/") ? path.slice("/play/xiangkou/room/".length) : "";
    return (
      <XiangkouJoinRoom
        initialRoomCode={roomCode}
        onBackMode={() => navigate("/game/xiangkou", "xiangkou")}
      />
    );
  }

  if (view === "sichuanMode") {
    return (
      <SichuanModeSelect
        onBackHome={backHome}
        onEnterBot={enterSichuanBot}
        onCreateRoom={createSichuanRoom}
        onJoinRoom={joinSichuanRoom}
      />
    );
  }

  if (view === "sichuanRoomCreate") {
    return <SichuanCreateRoom onBackMode={() => navigate("/game/sichuan", "sichuanMode")} />;
  }

  if (view === "sichuanRoomJoin") {
    const path = appPath(window.location.pathname);
    const roomCode = path.startsWith("/play/sichuan/room/") ? path.slice("/play/sichuan/room/".length) : "";
    return (
      <SichuanJoinRoom
        initialRoomCode={roomCode}
        onBackMode={() => navigate("/game/sichuan", "sichuanMode")}
      />
    );
  }

  if (view === "sichuan") {
    return <SichuanApp onBackHome={() => navigate("/game/sichuan", "sichuanMode")} />;
  }

  if (view === "link-match") {
    return <LinkMatchApp onBackHome={backHome} />;
  }

  if (view === "yangyang") {
    return <YangYangApp onBackHome={backHome} />;
  }

  return <App onBackHome={() => navigate("/game/xiangkou", "xiangkou")} />;
}
