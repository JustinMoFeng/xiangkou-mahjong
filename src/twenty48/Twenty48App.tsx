import { ArrowLeft, RotateCcw, Timer, Trophy, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { AudioControl } from "../casual/AudioControl";
import { useCasualAudio } from "../casual/useCasualAudio";
import {
  continueTwenty48Game,
  createTwenty48Game,
  filledTwenty48Cells,
  highestTwenty48Tile,
  moveTwenty48,
  previewTwenty48Move,
  TWENTY48_SIZE,
  TWENTY48_TARGET,
  undoTwenty48Move,
  type Twenty48Direction,
  type Twenty48GameState,
  type Twenty48MoveTile,
} from "./engine";
import {
  clearTwenty48Game,
  loadTwenty48BestScore,
  loadTwenty48Game,
  saveTwenty48BestScore,
  saveTwenty48Game,
} from "./storage";
import "./twenty48.css";

type TouchPoint = {
  x: number;
  y: number;
};

type MotionState = {
  tiles: Twenty48MoveTile[];
  mergedIndexes: number[];
  spawnIndex?: number;
};

type RevealState = {
  id: number;
  mergedIndexes: number[];
  spawnIndex?: number;
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

function directionFromKey(key: string): Twenty48Direction | undefined {
  if (key === "ArrowUp" || key.toLowerCase() === "w") return "up";
  if (key === "ArrowRight" || key.toLowerCase() === "d") return "right";
  if (key === "ArrowDown" || key.toLowerCase() === "s") return "down";
  if (key === "ArrowLeft" || key.toLowerCase() === "a") return "left";
  return undefined;
}

function directionFromSwipe(start: TouchPoint, end: TouchPoint): Twenty48Direction | undefined {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  if (distance < 28) {
    return undefined;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "down" : "up";
}

function tileClass(value: number): string {
  if (value === 0) return "tile-empty";
  if (value >= 4096) return "tile-super";
  return `tile-${value}`;
}

function tilePositionStyle(index: number, fromIndex?: number): CSSProperties {
  const row = Math.floor(index / TWENTY48_SIZE);
  const col = index % TWENTY48_SIZE;
  const fromRow = fromIndex === undefined ? row : Math.floor(fromIndex / TWENTY48_SIZE);
  const fromCol = fromIndex === undefined ? col : fromIndex % TWENTY48_SIZE;
  const offsetExpression = (delta: number) => {
    if (delta === 0) return "0px";
    const operator = delta > 0 ? "+" : "-";
    const gaps = Array.from({ length: Math.abs(delta) }, () => "var(--twenty48-gap)").join(` ${operator} `);
    return `calc(${delta * 100}% ${operator} ${gaps})`;
  };
  return {
    gridColumnStart: col + 1,
    gridRowStart: row + 1,
    "--move-x": offsetExpression(fromCol - col),
    "--move-y": offsetExpression(fromRow - row),
  } as CSSProperties;
}

export default function Twenty48App({ onBackHome }: { onBackHome: () => void }) {
  const [state, setState] = useState<Twenty48GameState>(() => loadTwenty48Game() ?? createTwenty48Game());
  const [bestScore, setBestScore] = useState(() => loadTwenty48BestScore());
  const [motion, setMotion] = useState<MotionState>();
  const [reveal, setReveal] = useState<RevealState>();
  const touchStartRef = useRef<TouchPoint>();
  const animatingRef = useRef(false);
  const motionTimerRef = useRef<number>();
  const revealTimerRef = useRef<number>();
  const { audioEnabled, settings, playAudio, toggleAudio, updateAudioSettings } = useCasualAudio("twenty48");
  const now = useNowTick(state.status === "playing");
  const elapsedSeconds = Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
  const highestTile = highestTwenty48Tile(state.board);
  const filledCells = filledTwenty48Cells(state.board);

  const move = useCallback(
    (direction: Twenty48Direction) => {
      if (animatingRef.current || state.status !== "playing") {
        return;
      }

      const preview = previewTwenty48Move(state.board, direction);
      if (!preview.moved) {
        return;
      }

      const next = moveTwenty48(state, direction);
      if (next === state) {
        return;
      }

      const spawnIndex = next.board.findIndex((value, index) => value > 0 && preview.board[index] === 0);
      window.clearTimeout(motionTimerRef.current);
      window.clearTimeout(revealTimerRef.current);
      animatingRef.current = true;
      setReveal(undefined);
      setMotion({
        tiles: preview.tiles,
        mergedIndexes: preview.mergedIndexes,
        spawnIndex: spawnIndex >= 0 ? spawnIndex : undefined,
      });
      setState(next);
      playAudio(next.score > state.score ? "match" : "select");

      motionTimerRef.current = window.setTimeout(() => {
        setMotion(undefined);
        setReveal({
          id: Date.now(),
          mergedIndexes: preview.mergedIndexes,
          spawnIndex: spawnIndex >= 0 ? spawnIndex : undefined,
        });
        animatingRef.current = false;
        revealTimerRef.current = window.setTimeout(() => setReveal(undefined), 240);
      }, 170);
    },
    [playAudio, state],
  );

  useEffect(
    () => () => {
      window.clearTimeout(motionTimerRef.current);
      window.clearTimeout(revealTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    saveTwenty48Game(state);
    if (state.score > bestScore) {
      setBestScore(saveTwenty48BestScore(state.score));
    }
  }, [bestScore, state]);

  useEffect(() => {
    if (state.status === "won") {
      playAudio("win");
    } else if (state.status === "lost") {
      playAudio("fail");
    }
  }, [playAudio, state.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      const direction = directionFromKey(event.key);
      if (!direction) {
        return;
      }
      event.preventDefault();
      move(direction);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  function restart() {
    window.clearTimeout(motionTimerRef.current);
    window.clearTimeout(revealTimerRef.current);
    animatingRef.current = false;
    clearTwenty48Game();
    playAudio("restart");
    setMotion(undefined);
    setReveal(undefined);
    setState(createTwenty48Game(Date.now(), Date.now()));
  }

  function undo() {
    if (animatingRef.current) {
      return;
    }
    setState((current) => {
      const next = undoTwenty48Move(current);
      if (next !== current) {
        playAudio("undo");
        setReveal(undefined);
      }
      return next;
    });
  }

  function continueGame() {
    playAudio("level-start");
    setState((current) => continueTwenty48Game(current));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = undefined;
    if (!start) {
      return;
    }
    const touch = event.changedTouches[0];
    const direction = directionFromSwipe(start, { x: touch.clientX, y: touch.clientY });
    if (direction) {
      move(direction);
    }
  }

  return (
    <main className="twenty48-shell" aria-label="2048">
      <section className="twenty48-frame">
        <header className="twenty48-topbar">
          <button className="twenty48-icon-button" type="button" onClick={onBackHome} aria-label="返回合集">
            <ArrowLeft size={18} />
          </button>
          <div className="twenty48-title">
            <p>普通数字合成</p>
            <h1>2048</h1>
          </div>
          <div className="twenty48-stats" aria-label="2048计分">
            <span>分数 {state.score}</span>
            <span>
              <Trophy size={15} />
              最高 {Math.max(bestScore, state.score)}
            </span>
            <span>
              <Timer size={15} />
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>
          <div className="twenty48-actions" aria-label="2048操作">
            <AudioControl
              audioEnabled={audioEnabled}
              settings={settings}
              buttonClassName="twenty48-icon-button"
              panelClassName="twenty48-audio-panel"
              onToggleAudio={toggleAudio}
              onUpdateSettings={updateAudioSettings}
            />
            <button className="twenty48-icon-button" type="button" onClick={undo} disabled={state.history.length === 0} aria-label="撤销">
              <Undo2 size={18} />
            </button>
            <button className="twenty48-command" type="button" onClick={restart}>
              <RotateCcw size={17} />
              重开
            </button>
          </div>
        </header>

        <section className="twenty48-play">
          <div className="twenty48-side twenty48-side--left" aria-label="2048状态">
            <span>目标</span>
            <strong>{TWENTY48_TARGET}</strong>
            <small>本局目标</small>
          </div>

          <div
            className="twenty48-board-wrap"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            aria-label="2048棋盘"
          >
            <div className="twenty48-board" style={{ "--twenty48-size": TWENTY48_SIZE } as CSSProperties}>
              {state.board.map((_, index) => (
                <div key={`cell-${index}`} className="twenty48-cell" aria-hidden="true" />
              ))}
              <div className="twenty48-tile-layer">
                {motion
                  ? motion.tiles.map((tile, index) => (
                      <div
                        key={`motion-${index}-${tile.fromIndex}-${tile.toIndex}`}
                        className={["twenty48-tile", tileClass(tile.value), "is-moving", tile.merged ? "is-merging" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        style={tilePositionStyle(tile.toIndex, tile.fromIndex)}
                        data-testid="twenty48-tile"
                        data-value={tile.value}
                        aria-hidden="true"
                      >
                        {tile.value}
                      </div>
                    ))
                  : state.board.map((value, index) =>
                      value > 0 ? (
                        <div
                          key={`tile-${index}-${value}-${reveal?.id ?? 0}`}
                          className={[
                            "twenty48-tile",
                            tileClass(value),
                            reveal?.spawnIndex === index ? "is-new" : "",
                            reveal?.mergedIndexes.includes(index) ? "is-merged" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={tilePositionStyle(index)}
                          data-testid="twenty48-tile"
                          data-value={value}
                          aria-label={String(value)}
                        >
                          {value}
                        </div>
                      ) : null,
                    )}
              </div>
            </div>
          </div>

          <div className="twenty48-side twenty48-side--right" aria-label="2048进度">
            <span>进度</span>
            <strong>{highestTile || 2}</strong>
            <small>
              {filledCells}/{TWENTY48_SIZE * TWENTY48_SIZE} 格 · {state.moves} 步
            </small>
          </div>
        </section>

        {state.status !== "playing" ? (
          <div className="twenty48-result" role="dialog" aria-modal="true" aria-label={state.status === "won" ? "2048达成" : "2048结束"}>
            <section>
              <p>{state.status === "won" ? "目标达成" : "没有可移动格子"}</p>
              <h2>{state.status === "won" ? "合成 2048" : "本局结束"}</h2>
              <span>
                分数 {state.score} · 最高 {Math.max(bestScore, state.score)}
              </span>
              <div className="twenty48-result__actions">
                {state.status === "won" ? (
                  <button className="twenty48-secondary" type="button" onClick={continueGame}>
                    继续
                  </button>
                ) : null}
                <button className="twenty48-primary" type="button" onClick={restart}>
                  新局
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
