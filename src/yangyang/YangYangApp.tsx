import { ArrowLeft, ChevronRight, Layers3, Lightbulb, RotateCcw, Shuffle, Timer, Undo2 } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { tileAssetPath, tileLabel } from "../casual/tiles";
import {
  createYangGame,
  createYangGameForLevel,
  createYangTripleScenario,
  getClickableYangTiles,
  isYangTileBlocked,
  revealYangHint,
  selectYangTile,
  shuffleYangTiles,
  undoYangMove,
  YANG_SLOT_CAPACITY,
  type YangGameState,
  type YangTile,
} from "./engine";
import {
  createYangLayoutPoints,
  getNextYangLevelPreset,
  getYangLevelPreset,
  resolveYangLevel,
  YANG_LEVEL_PRESETS,
  type YangLevelPreset,
} from "./levels";
import {
  clearSavedYangGame,
  loadSavedYangGame,
  loadYangBestTimes,
  saveYangBestTime,
  saveYangGame,
  type YangBestTimes,
} from "./storage";
import "./yangyang.css";

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

export default function YangYangApp({ onBackHome }: { onBackHome: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const hasLevelParam = params.has("level");
  const seedParam = Number(params.get("seed"));
  const hasSeedParam = Number.isFinite(seedParam) && seedParam > 0;
  const initialSeed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now();
  const initialLevel = getYangLevelPreset(params.get("level") ?? undefined);
  const shouldUseSavedGame = hasLevelParam && !hasSeedParam && params.get("level") !== "triple" && params.get("level") !== "test-triple";
  const [state, setState] = useState<YangGameState>(() => {
    if (params.get("level") === "triple") return createYangTripleScenario(Date.now());
    if (shouldUseSavedGame) {
      const saved = loadSavedYangGame();
      if (saved?.levelId === initialLevel.id) return saved;
    }
    return createYangGameForLevel(initialSeed, Date.now(), initialLevel);
  });
  const [bestTimes, setBestTimes] = useState<YangBestTimes>(() => loadYangBestTimes());
  const [selectedLevel, setSelectedLevel] = useState<YangLevelPreset | undefined>(() =>
    hasLevelParam ? initialLevel : undefined,
  );
  const now = useNowTick(state.status === "playing");
  const elapsedSeconds = Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
  const clickableIds = new Set(getClickableYangTiles(state.tiles).map((tile) => tile.id));
  const remainingCount = state.tiles.filter((tile) => !tile.removed).length;
  const bestSeconds = bestTimes[state.levelId];
  const mainTiles = state.tiles.filter((tile) => tile.zone === "main").sort((first, second) => first.layer - second.layer);
  const leftSupportTiles = state.tiles.filter((tile) => tile.zone === "support-left").sort((first, second) => first.layer - second.layer);
  const rightSupportTiles = state.tiles.filter((tile) => tile.zone === "support-right").sort((first, second) => first.layer - second.layer);
  const mainBounds = getYangMainBounds(mainTiles);

  useEffect(() => {
    if (shouldUseSavedGame && selectedLevel) {
      saveYangGame(state);
    }
  }, [selectedLevel, shouldUseSavedGame, state]);

  useEffect(() => {
    if (!shouldUseSavedGame) {
      return undefined;
    }

    const saveBeforeUnload = () => saveYangGame(state);
    window.addEventListener("pagehide", saveBeforeUnload);
    return () => window.removeEventListener("pagehide", saveBeforeUnload);
  }, [shouldUseSavedGame, state]);

  useEffect(() => {
    if (state.status !== "won" || !state.endedAt) {
      return;
    }

    const finalSeconds = Math.max(1, Math.floor((state.endedAt - state.startedAt) / 1000));
    setBestTimes(saveYangBestTime(state.levelId, finalSeconds));
  }, [state.endedAt, state.levelId, state.startedAt, state.status]);

  function restart() {
    const level = selectedLevel ?? getYangLevelPreset(state.levelId);
    const next = createYangGameForLevel(Date.now(), Date.now(), level, state.endless ? state.endlessRound : 1);
    clearSavedYangGame();
    setState(next);
  }

  function startLevel(level: YangLevelPreset) {
    clearSavedYangGame();
    setSelectedLevel(level);
    window.history.replaceState({}, "", `${withBasePath("/play/yangyang")}?level=${level.id}`);
    setState(createYangGameForLevel(Date.now(), Date.now(), level));
  }

  function nextLevel() {
    const nextPreset = state.endless ? getYangLevelPreset("endless") : getNextYangLevelPreset(state.levelId);
    const nextRound = state.endless ? state.endlessRound + 1 : 1;
    clearSavedYangGame();
    setSelectedLevel(nextPreset);
    window.history.replaceState({}, "", `${withBasePath("/play/yangyang")}?level=${nextPreset.id}`);
    setState(createYangGameForLevel(Date.now(), Date.now(), nextPreset, nextRound));
  }

  function backToLevels() {
    clearSavedYangGame();
    setSelectedLevel(undefined);
    window.history.replaceState({}, "", withBasePath("/play/yangyang"));
  }

  function pick(tile: YangTile) {
    setState((current) => selectYangTile(current, tile.id));
  }

  function undo() {
    setState((current) => undoYangMove(current));
  }

  function hint() {
    setState((current) => revealYangHint(current));
  }

  function shuffle() {
    setState((current) => shuffleYangTiles(current));
  }

  function renderTile(tile: YangTile) {
    const blocked = isYangTileBlocked(state.tiles, tile.id);
    return (
      <button
        key={tile.id}
        type="button"
        className={[
          "yang-tile",
          tile.removed ? "is-removed" : "",
          blocked ? "is-blocked" : "is-clickable",
          state.hintIds.includes(tile.id) ? "is-hinted" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={yangTileStyle(tile, mainBounds)}
        disabled={tile.removed || !clickableIds.has(tile.id) || state.status !== "playing"}
        onClick={() => pick(tile)}
        aria-label={`${tileLabel(tile.code)} ${blocked ? "被压住" : "可点击"}`}
        data-testid="yang-tile"
        data-code={tile.code}
        data-zone={tile.zone}
        data-blocked={blocked ? "true" : "false"}
      >
        <img src={tileAssetPath(tile.code)} alt={tileLabel(tile.code)} draggable={false} decoding="async" />
      </button>
    );
  }

  return (
    <main className="casual-shell yang-shell">
      <div className="rotate-device" aria-label="横屏提示">
        <div>
          <strong>请横屏游玩</strong>
          <span>麻将羊羊消需要横向桌面，旋转手机后继续当前关卡。</span>
        </div>
      </div>

      {!selectedLevel ? (
        <YangLevelSelect bestTimes={bestTimes} onBackHome={onBackHome} onStartLevel={startLevel} />
      ) : (
      <section className="casual-frame yang-frame" aria-label="麻将羊羊消">
        <header className="casual-topbar">
          <button className="casual-icon-button" type="button" onClick={backToLevels} aria-label="返回关卡">
            <ArrowLeft size={18} />
          </button>
          <div className="casual-title">
            <p>{state.endless ? `无尽第 ${state.endlessRound} 关` : `${state.difficulty} · ${state.levelName}`}</p>
            <h1>麻将羊羊消</h1>
          </div>
          <div className="casual-stats" aria-label="羊羊消计分">
            <span>
              <Timer size={15} />
              {formatElapsed(elapsedSeconds)}
            </span>
            <span>步数 {state.moves}</span>
            <span>剩余 {remainingCount}</span>
            <span>{bestSeconds ? `最快 ${formatElapsed(bestSeconds)}` : "最快 --"}</span>
            <span>{state.tileCount}张</span>
            <span>{state.maxLayer + 1}层</span>
          </div>
          <div className="casual-actions" aria-label="羊羊消操作">
            <button type="button" onClick={restart}>
              <RotateCcw size={16} />
              重开
            </button>
            <button type="button" onClick={undo} disabled={state.history.length === 0}>
              <Undo2 size={16} />
              撤回
            </button>
            <button type="button" onClick={hint} disabled={state.status !== "playing"}>
              <Lightbulb size={16} />
              提示
            </button>
            <button type="button" onClick={shuffle} disabled={state.status !== "playing" || remainingCount <= 1}>
              <Shuffle size={16} />
              洗牌
            </button>
          </div>
        </header>

        <section className="yang-playfield" aria-label="羊羊消牌堆">
          <div className="yang-stack" aria-label="多层牌堆" data-layout={state.layoutKind}>
            <div className="yang-pile yang-pile--main" aria-label="主牌堆">
              {mainTiles.map(renderTile)}
            </div>
            <div className="yang-pile yang-pile--support yang-pile--support-left" aria-label="左侧辅助牌堆">
              {leftSupportTiles.map(renderTile)}
            </div>
            <div className="yang-pile yang-pile--support yang-pile--support-right" aria-label="右侧辅助牌堆">
              {rightSupportTiles.map(renderTile)}
            </div>
          </div>
        </section>

        <footer className="yang-slotbar" aria-label="羊羊消槽位">
          {Array.from({ length: YANG_SLOT_CAPACITY }).map((_, index) => {
            const slot = state.slots[index];
            return (
              <div key={index} className={`yang-slot ${slot ? "is-filled" : ""}`} data-testid="yang-slot">
                {slot ? <img src={tileAssetPath(slot.code)} alt={tileLabel(slot.code)} draggable={false} decoding="async" /> : <span />}
              </div>
            );
          })}
        </footer>

        {state.status === "won" ? (
          <YangResultDialog
            label="羊羊消结算"
            tone="胜利"
            title="全部清空"
            detail={`用时 ${formatElapsed(elapsedSeconds)}，共 ${state.moves} 步，${state.tileCount} 张 / ${state.maxLayer + 1} 层`}
            primaryLabel={state.endless ? "继续无尽" : "下一关"}
            onPrimary={nextLevel}
            onRestart={restart}
            onBackHome={onBackHome}
          />
        ) : null}

        {state.status === "failed" ? (
          <YangResultDialog
            label="羊羊消失败"
            tone="失败"
            title="槽位已满"
            detail="当前槽位没有可消除的三张同牌"
            primaryLabel="重开"
            onPrimary={restart}
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

type YangMainBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function getYangMainBounds(tiles: YangTile[]): YangMainBounds {
  if (tiles.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...tiles.map((tile) => tile.x)),
    maxX: Math.max(...tiles.map((tile) => tile.x)) + 6,
    minY: Math.min(...tiles.map((tile) => tile.y)),
    maxY: Math.max(...tiles.map((tile) => tile.y)) + 6,
  };
}

function yangTileStyle(tile: YangTile, bounds: YangMainBounds): CSSProperties {
  if (tile.zone === "main") {
    return {
      "--yang-x": tile.x - bounds.minX,
      "--yang-y": tile.y - bounds.minY,
      "--yang-columns": Math.max(1, (bounds.maxX - bounds.minX) / 6),
      "--yang-rows": Math.max(1, (bounds.maxY - bounds.minY) / 6),
      "--yang-layer": tile.layer,
    } as CSSProperties;
  }

  return {
    "--yang-left": `${4 + Math.min(80, (tile.x / 9.5) * 80)}%`,
    "--yang-layer": tile.layer,
  } as CSSProperties;
}

function YangLevelSelect({
  bestTimes,
  onBackHome,
  onStartLevel,
}: {
  bestTimes: YangBestTimes;
  onBackHome: () => void;
  onStartLevel: (level: YangLevelPreset) => void;
}) {
  const standardLevels = YANG_LEVEL_PRESETS.filter((level) => !level.endless);
  const endlessLevel = YANG_LEVEL_PRESETS.find((level) => level.endless);

  return (
    <section className="yang-level-select" aria-label="麻将羊羊消关卡选择">
      <header className="yang-level-select__top">
        <button className="casual-icon-button" type="button" onClick={onBackHome} aria-label="返回合集">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p>麻将羊羊消</p>
          <h1>选择难度</h1>
        </div>
      </header>

      <section className="yang-level-grid" aria-label="羊羊消关卡">
        {standardLevels.map((level) => (
          <YangLevelCard key={level.id} level={level} bestTime={bestTimes[level.id]} onStart={onStartLevel} />
        ))}
        {endlessLevel ? (
          <YangLevelCard level={endlessLevel} bestTime={bestTimes[endlessLevel.id]} onStart={onStartLevel} />
        ) : null}
      </section>
    </section>
  );
}

function YangLevelCard({
  level,
  bestTime,
  onStart,
}: {
  level: YangLevelPreset;
  bestTime?: number;
  onStart: (level: YangLevelPreset) => void;
}) {
  const actualTileCount = getYangPresetTileCount(level);
  return (
    <button type="button" className="yang-level-card" onClick={() => onStart(level)}>
      <span className={`yang-level-card__difficulty yang-level-card__difficulty--${level.difficulty}`}>
        {level.difficulty}
      </span>
      <strong>{level.name}</strong>
      <small>{level.subtitle}</small>
      <p>{level.description}</p>
      <span className="yang-level-card__best">
        {bestTime ? `最快 ${formatElapsed(bestTime)}` : "未完成"}
      </span>
      <Layers3 size={17} aria-hidden="true" />
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

function getYangPresetTileCount(level: YangLevelPreset): number {
  if (level.endless) {
    return level.tileCount;
  }
  return createYangLayoutPoints(resolveYangLevel(level, 1)).length;
}

function YangResultDialog({
  label,
  tone,
  title,
  detail,
  primaryLabel,
  onPrimary,
  onRestart,
  onBackHome,
}: {
  label: string;
  tone: string;
  title: string;
  detail: string;
  primaryLabel: string;
  onPrimary: () => void;
  onRestart: () => void;
  onBackHome: () => void;
}) {
  return (
    <div className="casual-result-backdrop" role="dialog" aria-modal="true" aria-label={label}>
      <section className="casual-result-card">
        <p>{tone}</p>
        <h2>{title}</h2>
        <span>{detail}</span>
        <div>
          <button type="button" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" onClick={onRestart}>
            再来一次
          </button>
          <button type="button" onClick={onBackHome}>
            返回合集
          </button>
        </div>
      </section>
    </div>
  );
}
