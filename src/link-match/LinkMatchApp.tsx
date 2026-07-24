import { ArrowLeft, Lightbulb, RotateCcw, Shuffle, Timer } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { tileAssetPath, tileLabel } from "../casual/tiles";
import {
  createLinkGame,
  LINK_COLUMNS,
  LINK_PAIR_COUNT,
  LINK_ROWS,
  revealLinkHint,
  selectLinkTile,
  shuffleRemainingLinkTiles,
  type LinkGameState,
  type LinkPoint,
  type LinkTile,
} from "./engine";
import "./link-match.css";

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
  const seedParam = Number(new URLSearchParams(window.location.search).get("seed"));
  const initialSeed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now();
  const [state, setState] = useState<LinkGameState>(() => createLinkGame(initialSeed));
  const now = useNowTick(state.status === "playing");
  const elapsedSeconds = Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
  const activeTiles = state.tiles.filter((tile) => !tile.removed).length;

  function restart() {
    setState(createLinkGame(Date.now()));
  }

  function pick(tile: LinkTile) {
    setState((current) => selectLinkTile(current, tile.id));
  }

  function hint() {
    setState((current) => revealLinkHint(current));
  }

  function shuffle() {
    setState((current) => shuffleRemainingLinkTiles(current));
  }

  return (
    <main className="casual-shell link-shell">
      <div className="rotate-device" aria-label="横屏提示">
        <div>
          <strong>请横屏游玩</strong>
          <span>休闲麻将消除需要横向空间，旋转手机后继续当前关卡。</span>
        </div>
      </div>

      <section className="casual-frame link-frame" aria-label="麻将连连看">
        <header className="casual-topbar">
          <button className="casual-icon-button" type="button" onClick={onBackHome} aria-label="返回合集">
            <ArrowLeft size={18} />
          </button>
          <div className="casual-title">
            <p>休闲消除</p>
            <h1>麻将连连看</h1>
          </div>
          <div className="casual-stats" aria-label="连连看计分">
            <span>
              <Timer size={15} />
              {formatElapsed(elapsedSeconds)}
            </span>
            <span>步数 {state.moves}</span>
            <span>
              {state.removedPairs}/{LINK_PAIR_COUNT} 对
            </span>
          </div>
          <div className="casual-actions" aria-label="连连看操作">
            <button type="button" onClick={restart}>
              <RotateCcw size={16} />
              重开
            </button>
            <button type="button" onClick={hint} disabled={state.status !== "playing"}>
              <Lightbulb size={16} />
              提示
            </button>
            <button type="button" onClick={shuffle} disabled={state.status !== "playing" || activeTiles <= 2}>
              <Shuffle size={16} />
              洗牌
            </button>
          </div>
        </header>

        <section className="link-playfield" aria-label="连连看棋盘">
          <div className="link-board" style={{ "--link-cols": LINK_COLUMNS, "--link-rows": LINK_ROWS } as CSSProperties}>
            <LinkPathOverlay path={state.lastPath} />
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
                data-code={tile.code}
              >
                <img src={tileAssetPath(tile.code)} alt={tileLabel(tile.code)} draggable={false} />
              </button>
            ))}
          </div>
        </section>

        <footer className="casual-footer">
          <span>相同麻将牌连线不超过两次转弯即可消除</span>
          <span>剩余 {activeTiles} 张</span>
        </footer>

        {state.status === "won" ? (
          <ResultDialog
            title="全部消除"
            detail={`用时 ${formatElapsed(elapsedSeconds)}，共 ${state.moves} 步`}
            onRestart={restart}
            onBackHome={onBackHome}
          />
        ) : null}
      </section>
    </main>
  );
}

function LinkPathOverlay({ path }: { path: LinkPoint[] }) {
  if (path.length < 2) {
    return <svg className="link-path" aria-hidden="true" />;
  }

  const points = path
    .map((point) => {
      const x = ((point.col + 0.5) / LINK_COLUMNS) * 100;
      const y = ((point.row + 0.5) / LINK_ROWS) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="link-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="连接路径" data-testid="link-path">
      <polyline points={points} pathLength={1} />
    </svg>
  );
}

function ResultDialog({
  title,
  detail,
  onRestart,
  onBackHome,
}: {
  title: string;
  detail: string;
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
