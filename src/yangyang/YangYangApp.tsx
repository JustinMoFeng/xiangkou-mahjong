import { ArrowLeft, Lightbulb, RotateCcw, Shuffle, Timer, Undo2 } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { tileAssetPath, tileLabel } from "../casual/tiles";
import {
  createYangGame,
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
  const seedParam = Number(params.get("seed"));
  const initialSeed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now();
  const [state, setState] = useState<YangGameState>(() =>
    params.get("level") === "triple" ? createYangTripleScenario(Date.now()) : createYangGame(initialSeed),
  );
  const now = useNowTick(state.status === "playing");
  const elapsedSeconds = Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
  const clickableIds = new Set(getClickableYangTiles(state.tiles).map((tile) => tile.id));
  const remainingCount = state.tiles.filter((tile) => !tile.removed).length;

  function restart() {
    setState(createYangGame(Date.now()));
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

  return (
    <main className="casual-shell yang-shell">
      <div className="rotate-device" aria-label="横屏提示">
        <div>
          <strong>请横屏游玩</strong>
          <span>麻将羊羊消需要横向桌面，旋转手机后继续当前关卡。</span>
        </div>
      </div>

      <section className="casual-frame yang-frame" aria-label="麻将羊羊消">
        <header className="casual-topbar">
          <button className="casual-icon-button" type="button" onClick={onBackHome} aria-label="返回合集">
            <ArrowLeft size={18} />
          </button>
          <div className="casual-title">
            <p>休闲消除</p>
            <h1>麻将羊羊消</h1>
          </div>
          <div className="casual-stats" aria-label="羊羊消计分">
            <span>
              <Timer size={15} />
              {formatElapsed(elapsedSeconds)}
            </span>
            <span>步数 {state.moves}</span>
            <span>剩余 {remainingCount}</span>
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
          <div className="yang-stack" aria-label="多层牌堆">
            {[...state.tiles]
              .sort((first, second) => first.layer - second.layer)
              .map((tile) => {
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
                    style={
                      {
                        "--yang-x": tile.x,
                        "--yang-y": tile.y,
                        "--yang-layer": tile.layer,
                      } as CSSProperties
                    }
                    disabled={tile.removed || !clickableIds.has(tile.id) || state.status !== "playing"}
                    onClick={() => pick(tile)}
                    aria-label={`${tileLabel(tile.code)} ${blocked ? "被压住" : "可点击"}`}
                    data-testid="yang-tile"
                    data-code={tile.code}
                    data-blocked={blocked ? "true" : "false"}
                  >
                    <img src={tileAssetPath(tile.code)} alt={tileLabel(tile.code)} draggable={false} />
                  </button>
                );
              })}
          </div>
        </section>

        <footer className="yang-slotbar" aria-label="羊羊消槽位">
          {Array.from({ length: YANG_SLOT_CAPACITY }).map((_, index) => {
            const slot = state.slots[index];
            return (
              <div key={index} className={`yang-slot ${slot ? "is-filled" : ""}`} data-testid="yang-slot">
                {slot ? <img src={tileAssetPath(slot.code)} alt={tileLabel(slot.code)} draggable={false} /> : <span />}
              </div>
            );
          })}
        </footer>

        {state.status === "won" ? (
          <YangResultDialog
            label="羊羊消结算"
            tone="胜利"
            title="全部清空"
            detail={`用时 ${formatElapsed(elapsedSeconds)}，共 ${state.moves} 步，槽位剩余 ${YANG_SLOT_CAPACITY - state.slots.length}`}
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
            onRestart={restart}
            onBackHome={onBackHome}
          />
        ) : null}
      </section>
    </main>
  );
}

function YangResultDialog({
  label,
  tone,
  title,
  detail,
  onRestart,
  onBackHome,
}: {
  label: string;
  tone: string;
  title: string;
  detail: string;
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
