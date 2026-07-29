import { ArrowLeft, ChevronRight, Lightbulb, RotateCcw, Shuffle, Timer } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AudioControl } from "../casual/AudioControl";
import type { CasualAudioSettings } from "../casual/audio";
import { tileAssetPath, tileLabel } from "../casual/tiles";
import { useCasualAudio } from "../casual/useCasualAudio";
import {
  createLinkGame,
  revealLinkHint,
  selectLinkTile,
  shuffleRemainingLinkTiles,
  type LinkGameState,
  type LinkPoint,
  type LinkTile,
} from "./engine";
import { getLinkLevelPreset, getNextLinkLevelPreset, LINK_LEVEL_PRESETS, type LinkLevelPreset } from "./levels";
import { loadLinkBestTimes, saveLinkBestTime, type LinkBestTimes } from "./storage";
import "./link-match.css";

type RenderedPath = {
  id: string;
  width: number;
  height: number;
  points: Array<{ x: number; y: number }>;
};

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function useNowTick(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export default function LinkMatchApp({ onBackHome }: { onBackHome: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const hasLevelParam = params.has("level");
  const seedParam = Number(params.get("seed"));
  const initialSeed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now();
  const initialLevel = getLinkLevelPreset(params.get("level") ?? undefined);
  const [state, setState] = useState<LinkGameState>(() => createLinkGame(initialSeed, Date.now(), initialLevel));
  const [bestTimes, setBestTimes] = useState<LinkBestTimes>(() => loadLinkBestTimes());
  const [selectedLevel, setSelectedLevel] = useState<LinkLevelPreset | undefined>(() => (hasLevelParam ? initialLevel : undefined));
  const boardRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; moved: boolean }>();
  const [visiblePath, setVisiblePath] = useState<RenderedPath>();
  const [isPanning, setIsPanning] = useState(false);
  const { audioEnabled, settings, playAudio, toggleAudio, updateAudioSettings } = useCasualAudio("link-match");
  const now = useNowTick(state.status === "playing");
  const elapsedSeconds = Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
  const remainingSeconds = Math.max(0, state.timeLimitSeconds - elapsedSeconds);
  const hasTimedOut = elapsedSeconds > state.timeLimitSeconds;
  const activeTiles = state.tiles.filter((tile) => !tile.removed).length;
  const bestSeconds = bestTimes[state.levelId];
  const canGoNext =
    state.endless ||
    state.levelId === "tiny-test" ||
    LINK_LEVEL_PRESETS.some((level, index) => level.id === state.levelId && index < LINK_LEVEL_PRESETS.length - 1);

  useEffect(() => {
    if (state.lastPath.length < 2) {
      setVisiblePath(undefined);
      return undefined;
    }

    let hideTimer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const nextPath = measureLinkPath(boardRef.current, state.lastPath);
      if (!nextPath) {
        setVisiblePath(undefined);
        return;
      }

      setVisiblePath({
        id: `${state.moves}-${state.lastPath.map((point) => `${point.row}:${point.col}`).join("|")}`,
        ...nextPath,
      });
      hideTimer = window.setTimeout(() => setVisiblePath(undefined), 680);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [state.lastPath, state.moves]);

  useEffect(() => {
    if (state.status !== "won" || !state.endedAt) {
      return;
    }

    const finalSeconds = Math.max(1, Math.floor((state.endedAt - state.startedAt) / 1000));
    setBestTimes(saveLinkBestTime(state.levelId, finalSeconds));
  }, [state.endedAt, state.levelId, state.startedAt, state.status]);

  useEffect(() => {
    if (state.status === "won") {
      playAudio("win");
    }
  }, [playAudio, state.status]);

  function restart() {
    playAudio("restart");
    setState((current) =>
      createLinkGame(Date.now(), Date.now(), getLinkLevelPreset(current.levelId), current.endlessRound),
    );
  }

  function startLevel(level: LinkLevelPreset) {
    playAudio("level-start");
    setVisiblePath(undefined);
    setSelectedLevel(level);
    window.history.replaceState({}, "", `${withBasePath("/play/link-match")}?level=${level.id}`);
    setState(createLinkGame(Date.now(), Date.now(), level));
  }

  function nextLevel() {
    playAudio("level-start");
    const nextPreset = state.endless ? getLinkLevelPreset("endless") : getNextLinkLevelPreset(state.levelId);
    const carryItems = {
      hintsRemaining: Math.min(8, state.hintsRemaining + 1),
      shufflesRemaining: Math.min(5, state.shufflesRemaining + 1),
    };
    setVisiblePath(undefined);
    setSelectedLevel(nextPreset);
    window.history.replaceState({}, "", `${withBasePath("/play/link-match")}?level=${nextPreset.id}`);
    setState(createLinkGame(Date.now(), Date.now(), nextPreset, state.endless ? state.endlessRound + 1 : 1, carryItems));
  }

  function backToLevels() {
    setVisiblePath(undefined);
    setSelectedLevel(undefined);
    window.history.replaceState({}, "", withBasePath("/play/link-match"));
  }

  function pick(tile: LinkTile) {
    const next = selectLinkTile(state, tile.id);
    if (next !== state) {
      playAudio(next.removedPairs > state.removedPairs ? "match" : "select");
    }
    setState(next);
  }

  function hint() {
    const next = revealLinkHint(state);
    if (next !== state && next.hintsRemaining < state.hintsRemaining) {
      playAudio("hint");
    }
    setState(next);
  }

  function shuffle() {
    const next = shuffleRemainingLinkTiles(state, Date.now(), true);
    if (next !== state && next.shuffleCount > state.shuffleCount) {
      playAudio("shuffle");
    }
    setState(next);
  }

  function onPanStart(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      moved: false,
    };
  }

  function onPanMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      drag.moved = true;
      setIsPanning(true);
      if (!viewport.hasPointerCapture(event.pointerId)) {
        viewport.setPointerCapture(event.pointerId);
      }
    }

    if (drag.moved) {
      viewport.scrollLeft = drag.left - deltaX;
      viewport.scrollTop = drag.top - deltaY;
      event.preventDefault();
    }
  }

  function onPanEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (drag && viewport && drag.pointerId === event.pointerId && viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    dragRef.current = undefined;
    window.setTimeout(() => setIsPanning(false), 0);
  }

  return (
    <main className="casual-shell link-shell">
      <div className="rotate-device" aria-label="横屏提示">
        <div>
          <strong>请横屏游玩</strong>
          <span>休闲麻将消除需要横向空间，旋转手机后继续当前关卡。</span>
        </div>
      </div>

      {!selectedLevel ? (
        <LevelSelect
          audioEnabled={audioEnabled}
          bestTimes={bestTimes}
          settings={settings}
          onBackHome={onBackHome}
          onStartLevel={startLevel}
          onToggleAudio={toggleAudio}
          onUpdateAudioSettings={updateAudioSettings}
        />
      ) : (
      <section className="link-game-frame" aria-label="麻将连连看">
        <header className="casual-topbar">
          <button className="casual-icon-button" type="button" onClick={backToLevels} aria-label="返回关卡">
            <ArrowLeft size={18} />
          </button>
          <div className="casual-title">
            <p>{state.endless ? `无尽第 ${state.endlessRound} 盘` : state.levelName}</p>
            <h1>麻将连连看</h1>
          </div>
          <div className="casual-stats" aria-label="连连看计分">
            <span>
              <Timer size={15} />
              {hasTimedOut ? `超时 ${formatElapsed(elapsedSeconds - state.timeLimitSeconds)}` : formatElapsed(remainingSeconds)}
            </span>
            <span>步数 {state.moves}</span>
            <span>
              {state.removedPairs}/{state.pairCount} 对
            </span>
            <span>{bestSeconds ? `最快 ${formatElapsed(bestSeconds)}` : "最快 --"}</span>
            <span>提示 {state.hintsRemaining}</span>
            <span>洗牌 {state.shufflesRemaining}</span>
          </div>
          <div className="casual-actions" aria-label="连连看操作">
            <AudioControl
              audioEnabled={audioEnabled}
              settings={settings}
              buttonClassName="casual-icon-button"
              onToggleAudio={toggleAudio}
              onUpdateSettings={updateAudioSettings}
            />
            <button type="button" onClick={restart}>
              <RotateCcw size={16} />
              重开
            </button>
            <button type="button" onClick={hint} disabled={state.status !== "playing" || state.hintsRemaining <= 0}>
              <Lightbulb size={16} />
              提示
            </button>
            <button type="button" onClick={shuffle} disabled={state.status !== "playing" || activeTiles <= 2 || state.shufflesRemaining <= 0}>
              <Shuffle size={16} />
              洗牌
            </button>
          </div>
        </header>

        <section className="link-playfield" aria-label="连连看棋盘">
          <div
            ref={viewportRef}
            className={`link-board-viewport ${isPanning ? "is-panning" : ""}`}
            data-testid="link-board-viewport"
            onPointerDown={onPanStart}
            onPointerMove={onPanMove}
            onPointerUp={onPanEnd}
            onPointerCancel={onPanEnd}
          >
            <div className="link-board-stage">
              <div
                ref={boardRef}
                className="link-board"
                style={
                  {
                    "--link-cols": state.columns,
                    "--link-rows": state.rows,
                    "--link-aspect": `${state.columns} / ${state.rows}`,
                  } as CSSProperties
                }
              >
                <LinkPathOverlay path={visiblePath} />
                {state.tiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    className={[
                      "link-tile",
                      tile.removed ? "is-removed" : "",
                      state.selectedId === tile.id ? "is-selected" : "",
                      state.hintIds.includes(tile.id) ? "is-hinted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ gridColumn: tile.col + 1, gridRow: tile.row + 1 }}
                    disabled={tile.removed || state.status !== "playing"}
                    onClick={() => pick(tile)}
                    aria-label={`${tileLabel(tile.code)} ${tile.removed ? "已消除" : "可选择"}`}
                    data-testid="link-tile"
                    data-tile-id={tile.id}
                    data-row={tile.row}
                    data-col={tile.col}
                    data-code={tile.code}
                  >
                    <img src={tileAssetPath(tile.code)} alt="" draggable={false} decoding="async" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="link-game-footer">
          <span>相同麻将牌连线不超过两次转弯即可消除</span>
          <span>{state.endless ? `无尽第 ${state.endlessRound} 盘` : state.levelName} · 剩余 {activeTiles} 张</span>
        </footer>

        {state.status === "won" ? (
          <ResultDialog
            title="全部消除"
            detail={`${hasTimedOut ? "超时完成，" : ""}用时 ${formatElapsed(elapsedSeconds)}，共 ${state.moves} 步`}
            primaryLabel={state.endless ? "再来一关" : canGoNext ? "下一关" : "再来一关"}
            onPrimary={nextLevel}
            onRestart={restart}
            onBackHome={onBackHome}
          />
        ) : null}
      </section>
      )}
    </main>
  );
}

function withBasePath(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/+$/, "");
  if (!base) {
    return path;
  }
  return path === "/" ? `${base}/` : `${base}${path}`;
}

function LevelSelect({
  audioEnabled,
  bestTimes,
  settings,
  onBackHome,
  onStartLevel,
  onToggleAudio,
  onUpdateAudioSettings,
}: {
  audioEnabled: boolean;
  bestTimes: LinkBestTimes;
  settings: CasualAudioSettings;
  onBackHome: () => void;
  onStartLevel: (level: LinkLevelPreset) => void;
  onToggleAudio: () => void;
  onUpdateAudioSettings: (settings: CasualAudioSettings) => void;
}) {
  return (
    <section className="link-level-select" aria-label="麻将连连看关卡选择">
      <header className="link-level-select__top">
        <button className="casual-icon-button" type="button" onClick={onBackHome} aria-label="返回合集">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p>麻将连连看</p>
          <h1>选择关卡</h1>
        </div>
        <AudioControl
          audioEnabled={audioEnabled}
          settings={settings}
          buttonClassName="casual-icon-button"
          onToggleAudio={onToggleAudio}
          onUpdateSettings={onUpdateAudioSettings}
        />
      </header>

      <section className="link-level-grid" aria-label="连连看关卡">
        {LINK_LEVEL_PRESETS.map((level) => (
          <button key={level.id} type="button" className="link-level-card" onClick={() => onStartLevel(level)}>
            <span className="link-level-card__difficulty">{level.difficulty}</span>
            <strong>{level.name}</strong>
            <small>{level.subtitle}</small>
            <small>{level.tileKindCount}种牌面 · {formatElapsed(level.timeLimitSeconds)}</small>
            <p>{level.description}</p>
            <span className="link-level-card__best">
              {bestTimes[level.id] ? `最快 ${formatElapsed(bestTimes[level.id])}` : "未完成"}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
      </section>
    </section>
  );
}

function measureLinkPath(board: HTMLDivElement | null, path: LinkPoint[]): Omit<RenderedPath, "id"> | undefined {
  if (!board || path.length < 2) {
    return undefined;
  }

  const bounds = board.getBoundingClientRect();
  const style = window.getComputedStyle(board);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const columnGap = Number.parseFloat(style.columnGap) || 0;
  const rowGap = Number.parseFloat(style.rowGap) || 0;
  const contentWidth = bounds.width - paddingLeft - paddingRight;
  const contentHeight = bounds.height - paddingTop - paddingBottom;
  const columns = Number(board.style.getPropertyValue("--link-cols")) || 8;
  const rows = Number(board.style.getPropertyValue("--link-rows")) || 6;
  const cellWidth = (contentWidth - columnGap * (columns - 1)) / columns;
  const cellHeight = (contentHeight - rowGap * (rows - 1)) / rows;
  const outsideGapX = Math.max(6, columnGap + 2);
  const outsideGapY = Math.max(6, rowGap + 2);

  const toPoint = (point: LinkPoint) => {
    if (point.col < 0) {
      return {
        x: paddingLeft - outsideGapX,
        y:
          point.row < 0
            ? paddingTop - outsideGapY
            : point.row >= rows
              ? paddingTop + contentHeight + outsideGapY
              : paddingTop + point.row * (cellHeight + rowGap) + cellHeight / 2,
      };
    }

    if (point.col >= columns) {
      return {
        x: paddingLeft + contentWidth + outsideGapX,
        y:
          point.row < 0
            ? paddingTop - outsideGapY
            : point.row >= rows
              ? paddingTop + contentHeight + outsideGapY
              : paddingTop + point.row * (cellHeight + rowGap) + cellHeight / 2,
      };
    }

    if (point.row < 0) {
      return {
        x: paddingLeft + point.col * (cellWidth + columnGap) + cellWidth / 2,
        y: paddingTop - outsideGapY,
      };
    }

    if (point.row >= rows) {
      return {
        x: paddingLeft + point.col * (cellWidth + columnGap) + cellWidth / 2,
        y: paddingTop + contentHeight + outsideGapY,
      };
    }

    return {
      x: paddingLeft + point.col * (cellWidth + columnGap) + cellWidth / 2,
      y: paddingTop + point.row * (cellHeight + rowGap) + cellHeight / 2,
    };
  };

  return {
    width: bounds.width,
    height: bounds.height,
    points: path.map(toPoint),
  };
}

function LinkPathOverlay({ path }: { path?: RenderedPath }) {
  if (!path || path.points.length < 2) {
    return <svg className="link-path" aria-hidden="true" />;
  }

  const points = path.points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      key={path.id}
      className="link-path"
      viewBox={`0 0 ${path.width} ${path.height}`}
      aria-label="连接路径"
      data-testid="link-path"
    >
      <polyline points={points} pathLength={1} />
    </svg>
  );
}

function ResultDialog({
  title,
  detail,
  primaryLabel,
  onPrimary,
  onRestart,
  onBackHome,
}: {
  title: string;
  detail: string;
  primaryLabel: string;
  onPrimary: () => void;
  onRestart: () => void;
  onBackHome: () => void;
}) {
  return (
    <div className="casual-result-backdrop" role="dialog" aria-modal="true" aria-label="连连看结算">
      <section className="casual-result-card">
        <p>胜利</p>
        <h2>{title}</h2>
        <span>{detail}</span>
        <div>
          <button type="button" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" onClick={onRestart}>
            重开
          </button>
          <button type="button" onClick={onBackHome}>
            返回合集
          </button>
        </div>
      </section>
    </div>
  );
}
