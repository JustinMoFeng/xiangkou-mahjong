import { AlignJustify, Bot, CircleHelp, Home as HomeIcon, Pause, Play, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  arrangeHand,
  canCurrentHumanSelfWin,
  canHumanAddedKong,
  canHumanConcealedKong,
  chooseMissingSuit,
  claimMeld,
  claimSelfDraw,
  claimWin,
  createNewGame,
  createNextRound,
  declareAddedKong,
  declareConcealedKong,
  discardTile,
  drawForCurrentSeat,
  passClaim,
  playBotTurnStep,
} from "./engine";
import { BASE_POINTS, MAX_FAN } from "./rules";
import { clearSavedGame, loadSavedGame, saveGame } from "./storage";
import { SUIT_LABELS, tileAssetPath, tileColorClass } from "./tiles";
import type { ClaimOption, GameState, Meld, Player, SuitPrefix, Tile, TileCode } from "./types";

const relationLabels = ["本家", "下家", "对家", "上家"] as const;
const suitOrder: SuitPrefix[] = ["m", "p", "s"];

function meldLabel(kind: Meld["kind"]): string {
  if (kind === "pong") return "碰";
  if (kind === "kong-concealed") return "暗杠";
  if (kind === "kong-added") return "补杠";
  return "杠";
}

export default function SichuanApp({ onBackHome }: { onBackHome?: () => void }) {
  const [state, setState] = useState<GameState>(() => loadSavedGame() ?? createNewGame());
  const [highlightedTileIds, setHighlightedTileIds] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isRulesHelpOpen, setIsRulesHelpOpen] = useState(false);
  const [kongMenuOpen, setKongMenuOpen] = useState(false);

  const human = state.players[0];
  const currentPlayer = state.players[state.currentSeat];
  const humanPendingClaim = state.pendingClaim?.seat === 0 ? state.pendingClaim : undefined;
  const humanCanSelfWin = canCurrentHumanSelfWin(state);
  const concealedKongs = canHumanConcealedKong(state);
  const addedKongs = canHumanAddedKong(state);
  const kongCodes = [...concealedKongs, ...addedKongs];
  const isChoosingMissing = state.phase === "choosing-missing";
  const humanMustDiscardMissing = hasMissingSuitTiles(human);

  useEffect(() => {
    saveGame(state);
  }, [state]);

  useEffect(() => {
    if (isPaused || state.phase !== "playing" || state.pendingClaim || currentPlayer.type !== "bot" || currentPlayer.hasWon) {
      return;
    }
    const delay = state.awaitingDiscard ? 1150 : 850;
    const timer = window.setTimeout(() => {
      setState((current) => playBotTurnStep(current));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    currentPlayer.type,
    currentPlayer.hasWon,
    isPaused,
    state.awaitingDiscard,
    state.currentSeat,
    state.drawReplacement,
    state.pendingClaim,
    state.phase,
    state.turn,
  ]);

  useEffect(() => {
    if (
      isPaused ||
      state.phase !== "playing" ||
      state.pendingClaim ||
      state.currentSeat !== 0 ||
      state.awaitingDiscard ||
      human.hasWon
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setState((current) => drawForCurrentSeat(current));
    }, 550);
    return () => window.clearTimeout(timer);
  }, [human.hasWon, isPaused, state.awaitingDiscard, state.currentSeat, state.pendingClaim, state.phase, state.turn]);

  useEffect(() => {
    setHighlightedTileIds([]);
    setKongMenuOpen(false);
  }, [humanPendingClaim?.id, isPaused, state.turn]);

  function restart() {
    clearSavedGame();
    setIsPaused(false);
    setState(createNewGame());
  }

  function nextRound() {
    setIsPaused(false);
    setState(createNextRound(state));
  }

  function onChooseMissing(suit: SuitPrefix) {
    setState((current) => chooseMissingSuit(current, 0, suit));
  }

  function onDiscard(tile: Tile) {
    if (state.phase !== "playing" || state.currentSeat !== 0 || state.pendingClaim || !state.awaitingDiscard) {
      return;
    }
    setState((current) => discardTile(current, 0, tile.id));
  }

  function onSelfDraw() {
    setState((current) => claimSelfDraw(current));
  }

  function onKong(code: TileCode) {
    setKongMenuOpen(false);
    if (concealedKongs.includes(code)) {
      setState((current) => declareConcealedKong(current, 0, code));
    } else {
      setState((current) => declareAddedKong(current, 0, code));
    }
  }

  function onClaimWin() {
    setState((current) => claimWin(current, 0));
  }

  function onClaimMeld(optionId: string) {
    setState((current) => claimMeld(current, 0, optionId));
    setHighlightedTileIds([]);
  }

  function onPassClaim() {
    setState((current) => passClaim(current, 0));
  }

  const winnerCount = state.players.filter((player) => player.hasWon).length;

  return (
    <main className="app-shell sc-theme">
      <div className="rotate-device" aria-label="横屏提示">
        <div>
          <strong>请横屏游玩</strong>
          <span>川麻牌桌需要横向空间，旋转手机后继续当前牌局。</span>
        </div>
      </div>
      <section className="game-frame" aria-label="川麻牌桌">
        <Header state={state} onPause={() => setIsPaused(true)} onOpenHelp={() => setIsRulesHelpOpen(true)} onBackHome={onBackHome} />

        <section className="mahjong-table" aria-label="四人川麻桌">
          <div className="table-felt" aria-hidden="true" />
          <TableSeat player={state.players[2]} position="top" active={state.currentSeat === 2} />
          <TableSeat player={state.players[3]} position="left" active={state.currentSeat === 3} />
          <TableSeat player={state.players[1]} position="right" active={state.currentSeat === 1} />

          <section className="river-board" aria-label="四家河牌">
            <RiverZone player={state.players[2]} position="top" lastDiscard={state.lastDiscard} />
            <RiverZone player={state.players[3]} position="left" lastDiscard={state.lastDiscard} />
            <RiverZone player={state.players[1]} position="right" lastDiscard={state.lastDiscard} />
            <RiverZone player={state.players[0]} position="bottom" lastDiscard={state.lastDiscard} />
            <div className="wall-counter">
              <span>余牌 {state.wall.length}</span>
            </div>
            {winnerCount > 0 ? <div className="sc-winners-chip">已胡 {winnerCount} 家 · 血战继续</div> : null}
            <div className="recent-action" aria-live="polite">
              <span>{state.recentAction}</span>
            </div>
          </section>

          <section className={`human-area ${state.currentSeat === 0 && !human.hasWon ? "is-active" : ""}`} aria-label="你的手牌">
            <PlayerStatus player={human} active={state.currentSeat === 0} />
            <div className="hand-row">
              <MeldRow melds={human.melds} />
              {human.hand.map((tile) => (
                <button
                  key={tile.id}
                  className={`tile-button ${human.drawnTileId === tile.id ? "tile-button--drawn" : ""} ${
                    tile.suit === human.missingSuit ? "tile-button--missing" : ""
                  }`}
                  disabled={
                    isPaused ||
                    state.phase !== "playing" ||
                    state.currentSeat !== 0 ||
                    Boolean(state.pendingClaim) ||
                    !state.awaitingDiscard ||
                    human.hasWon ||
                    (humanMustDiscardMissing && tile.suit !== human.missingSuit)
                  }
                  onClick={() => onDiscard(tile)}
                  title={humanMustDiscardMissing && tile.suit !== human.missingSuit ? "先打完定缺花色" : `打出${tile.label}`}
                  data-testid={human.drawnTileId === tile.id ? "sc-drawn-tile" : "sc-hand-tile"}
                >
                  <TileFace tile={tile} highlighted={highlightedTileIds.includes(tile.id)} />
                </button>
              ))}
            </div>
          </section>

          <div className="command-bar" aria-label="操作区">
            {humanPendingClaim ? (
              <>
                {humanPendingClaim.options.some((option) => option.action === "win") ? (
                  <button className="primary-command" onClick={onClaimWin} data-testid="sc-claim-win">
                    <Sparkles size={18} />
                    {humanPendingClaim.options.find((option) => option.action === "win")?.label ?? "胡"}
                  </button>
                ) : null}
                <ClaimOptions
                  options={humanPendingClaim.options.filter((option) => option.action !== "win")}
                  onSelect={onClaimMeld}
                  onPreview={setHighlightedTileIds}
                />
                <button className="secondary-command" onClick={onPassClaim} data-testid="sc-pass">
                  跳过
                </button>
              </>
            ) : (
              <>
                <button className="primary-command" disabled={!humanCanSelfWin} onClick={onSelfDraw}>
                  <Sparkles size={18} />
                  自摸
                </button>
                <div className="sc-kong-wrap">
                  <button
                    className="secondary-command"
                    disabled={kongCodes.length === 0}
                    onClick={() => setKongMenuOpen((open) => !open)}
                  >
                    杠
                  </button>
                  {kongMenuOpen && kongCodes.length > 0 ? (
                    <div className="sc-kong-menu">
                      {kongCodes.map((code) => (
                        <button key={code} className="sc-kong-item" onClick={() => onKong(code)}>
                          <img src={tileAssetPath(code)} alt="" draggable={false} />
                          <span>{concealedKongs.includes(code) ? "暗杠" : "补杠"}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="secondary-command" onClick={() => setState((current) => arrangeHand(current, 0))}>
                  <AlignJustify size={18} />
                  整理牌
                </button>
              </>
            )}
          </div>
        </section>

        {isChoosingMissing ? <MissingSuitOverlay human={human} onChoose={onChooseMissing} /> : null}
        {state.phase === "finished" ? (
          <ResultOverlay state={state} onRestart={restart} onNextRound={nextRound} onBackHome={onBackHome} />
        ) : null}
        {isPaused ? <PauseOverlay state={state} onResume={() => setIsPaused(false)} onRestart={restart} /> : null}
        {isRulesHelpOpen ? <SichuanRulesHelpOverlay onClose={() => setIsRulesHelpOpen(false)} /> : null}
      </section>
    </main>
  );
}

function Header({
  state,
  onPause,
  onOpenHelp,
  onBackHome,
}: {
  state: GameState;
  onPause: () => void;
  onOpenHelp: () => void;
  onBackHome?: () => void;
}) {
  const human = state.players[0];
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">血战到底 · 第 {state.roundNumber} 局</p>
        <h1>川麻</h1>
      </div>

      <div className="table-chips">
        <div className="score-chip" aria-label="你的点数">
          你 {human.score} 分
        </div>
        <div className="rule-chip">
          <Sparkles size={16} />
          缺一门 · 番数封顶 8
        </div>
      </div>

      <div className="mode-actions">
        <button className="mode-button mode-button--active">
          <Bot size={17} />
          人机血战
        </button>
        {onBackHome ? (
          <button className="icon-command" onClick={onBackHome} title="返回首页" aria-label="返回首页">
            <HomeIcon size={18} />
          </button>
        ) : null}
        <button className="icon-command" onClick={onOpenHelp} title="查看川麻帮助" aria-label="查看川麻帮助">
          <CircleHelp size={18} />
        </button>
        <button className="icon-command" onClick={onPause} title="暂停" aria-label="暂停">
          <Pause size={18} />
        </button>
      </div>
    </header>
  );
}

function TableSeat({
  player,
  position,
  active,
}: {
  player: Player;
  position: "top" | "left" | "right";
  active: boolean;
}) {
  return (
    <section
      className={`table-seat table-seat--${position} ${active ? "is-active" : ""} ${player.hasWon ? "sc-seat-won" : ""}`}
      aria-label={`${player.name}区域`}
    >
      <PlayerStatus player={player} active={active} />
      <div className="table-seat__rack">
        <MeldRow melds={player.melds} compact />
        <div className="concealed-hand" aria-label={`${player.name}手牌`}>
          {player.hasWon ? (
            <span className="sc-won-badge">
              <Trophy size={13} /> 已胡
            </span>
          ) : (
            player.hand.map((tile) => <span key={tile.id} className="tile-back" />)
          )}
        </div>
      </div>
    </section>
  );
}

function RiverZone({
  player,
  position,
  lastDiscard,
}: {
  player: Player;
  position: "top" | "left" | "right" | "bottom";
  lastDiscard?: GameState["lastDiscard"];
}) {
  const discards = position === "top" || position === "right" ? [...player.discards].reverse() : player.discards;

  return (
    <section className={`river-zone river-zone--${position}`} aria-label={`${player.name}河牌`}>
      <span className="river-zone__name">
        {relationLabels[player.seat]} · {player.name}
        {player.missingSuit ? <em className="sc-miss">缺{SUIT_LABELS[player.missingSuit]}</em> : null}
      </span>
      <div className="river-zone__tiles">
        {discards.length === 0 ? (
          <span className="river-zone__empty">未出牌</span>
        ) : (
          discards.map((tile) => (
            <TileFace
              key={tile.id}
              tile={tile}
              compact
              fresh={lastDiscard?.seat === player.seat && lastDiscard.tile.id === tile.id}
            />
          ))
        )}
      </div>
    </section>
  );
}

function PlayerStatus({ player, active }: { player: Player; active: boolean }) {
  return (
    <div className={`player-status ${active ? "is-active" : ""}`}>
      <div>
        <strong>
          <span className="relation-badge">{relationLabels[player.seat]}</span>
          {player.name}
        </strong>
        <span>{player.missingSuit ? `缺${SUIT_LABELS[player.missingSuit]}` : "未定缺"}</span>
      </div>
      <small>
        {player.score} 分 · {player.hasWon ? "已胡" : `${player.hand.length} 张`}
      </small>
    </div>
  );
}

function hasMissingSuitTiles(player: Player): boolean {
  return Boolean(player.missingSuit && player.hand.some((tile) => tile.suit === player.missingSuit));
}

function MeldRow({ melds, compact = false }: { melds: Meld[]; compact?: boolean }) {
  if (melds.length === 0) {
    return <div className="meld-row meld-row--empty">无副露</div>;
  }

  return (
    <div className={`meld-row ${compact ? "meld-row--compact" : ""}`} aria-label="副露">
      {melds.map((meld, meldIndex) => (
        <div className="meld-set" key={`${meld.code}-${meldIndex}`}>
          <span className="meld-label">{meldLabel(meld.kind)}</span>
          {meld.tiles.map((tile, tileIndex) =>
            meld.kind === "kong-concealed" && (tileIndex === 0 || tileIndex === 3) ? (
              <span key={tile.id} className="tile-back tile-back--meld" />
            ) : (
              <TileFace key={tile.id} tile={tile} compact={compact} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function ClaimOptions({
  options,
  onSelect,
  onPreview,
}: {
  options: ClaimOption[];
  onSelect: (optionId: string) => void;
  onPreview: (tileIds: string[]) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="claim-options" aria-label="可选组合">
      {options.map((option) => (
        <button
          className={`claim-option claim-option--${option.action}`}
          key={option.id}
          onClick={() => onSelect(option.id)}
          onFocus={() => onPreview(option.handTileIds)}
          onBlur={() => onPreview([])}
          onMouseEnter={() => onPreview(option.handTileIds)}
          onMouseLeave={() => onPreview([])}
          data-testid={`sc-claim-${option.action}`}
        >
          <span>{option.label}</span>
          <span className="claim-option__tiles">
            {option.previewTileCodes.map((code, index) => (
              <img key={`${option.id}-${code}-${index}`} src={tileAssetPath(code)} alt="" draggable={false} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

function TileFace({
  tile,
  compact = false,
  fresh = false,
  highlighted = false,
}: {
  tile: Tile;
  compact?: boolean;
  fresh?: boolean;
  highlighted?: boolean;
}) {
  return (
    <span
      className={`tile-face ${tileColorClass(tile.code)} ${compact ? "tile-face--compact" : ""} ${
        fresh ? "is-fresh" : ""
      } ${highlighted ? "is-highlighted" : ""}`}
    >
      <img className="tile-face__image" src={tileAssetPath(tile.code)} alt={tile.label} draggable={false} />
    </span>
  );
}

function MissingSuitOverlay({ human, onChoose }: { human: Player; onChoose: (suit: SuitPrefix) => void }) {
  const counts: Record<SuitPrefix, number> = { m: 0, p: 0, s: 0 };
  for (const tile of human.hand) {
    counts[tile.suit] += 1;
  }

  return (
    <aside className="sc-missing-panel" aria-label="定缺">
      <div>
        <p className="eyebrow">开局定缺</p>
        <h2>选择一门要缺的花色</h2>
        <p>看清手牌后再选；缺门花色不能留在手里，否则不能胡牌。</p>
      </div>
      <div className="sc-missing-grid">
        {suitOrder.map((suit) => (
          <button key={suit} className="sc-missing-option" onClick={() => onChoose(suit)} data-testid={`sc-missing-${suit}`}>
            <span className="sc-missing-suit">{SUIT_LABELS[suit]}</span>
            <small>{counts[suit]} 张</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function SichuanRulesHelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="result-backdrop rules-help-backdrop" role="dialog" aria-modal="true" aria-label="川麻帮助">
      <section className="result-card rules-help-card">
        <div className="rules-help-header">
          <div>
            <p className="eyebrow">川麻帮助</p>
            <h2>胡法与番型</h2>
          </div>
          <button className="icon-command" onClick={onClose} title="关闭帮助" aria-label="关闭帮助">
            <X size={18} />
          </button>
        </div>

        <div className="rules-help-scroll">
          <div className="rules-help-section">
            <h3>基本规则</h3>
            <div className="rules-help-list">
              <SichuanRuleRow name="开局定缺" value="必选" description="每家选择一门缺门。手里仍有缺门牌时不能胡牌。" />
              <SichuanRuleRow name="只碰杠不吃" value="川麻" description="支持碰、直杠、暗杠、补杠；不提供吃牌。" />
              <SichuanRuleRow name="血战到底" value="续局" description="胡牌者亮牌离场，其余玩家继续，直到只剩一家或牌墙摸完。" />
            </div>
          </div>

          <div className="rules-help-section">
            <h3>番型</h3>
            <div className="rules-help-list">
              <SichuanRuleRow name="平胡" value="0 番" description="标准 4 面子 1 将，无额外番型。" />
              <SichuanRuleRow name="对对胡" value="+1 番" description="全部面子都是刻子或杠子。" />
              <SichuanRuleRow name="七对" value="+2 番" description="14 张牌组成 7 个对子。" />
              <SichuanRuleRow name="清一色" value="+2 番" description="所有牌来自同一种花色。" />
              <SichuanRuleRow name="将对" value="+2 番" description="对对胡且所有牌都是 2、5、8。" />
              <SichuanRuleRow name="金钩钓" value="+1 番" description="四组副露后单吊胡牌。" />
              <SichuanRuleRow name="根" value="每根 +1" description="同一张牌出现 4 张计一根，七对中四张也计根。" />
            </div>
          </div>

          <div className="rules-help-section">
            <h3>结算项</h3>
            <div className="rules-help-list">
              <SichuanRuleRow name="自摸" value="+1 番" description="自己摸到胡牌张。" />
              <SichuanRuleRow name="杠上开花 / 杠上炮" value="+1 番" description="杠后补摸胡牌，或杠后打出的牌点炮。" />
              <SichuanRuleRow name="抢杠胡" value="+1 番" description="别人补杠时用那张牌胡。" />
              <SichuanRuleRow name="海底" value="+1 番" description="最后一张牌自摸或点炮。" />
              <SichuanRuleRow name="天胡 / 地胡" value="+6 番" description="开局极早阶段形成的高番胡牌。" />
            </div>
          </div>

          <div className="rules-help-note">
            分数 = 底分 <strong>{BASE_POINTS}</strong> x 2^番，最高 <strong>{MAX_FAN} 番</strong>。流局会查大叫、查花猪，并退还未听/花猪相关杠分。
          </div>
        </div>
      </section>
    </div>
  );
}

function SichuanRuleRow({ name, value, description }: { name: string; value: string; description: string }) {
  return (
    <div className="rules-help-row">
      <div>
        <strong>{name}</strong>
        <p>{description}</p>
      </div>
      <span>{value}</span>
    </div>
  );
}

function ResultOverlay({
  state,
  onRestart,
  onNextRound,
  onBackHome,
}: {
  state: GameState;
  onRestart: () => void;
  onNextRound: () => void;
  onBackHome?: () => void;
}) {
  const winners = state.players.filter((player) => player.hasWon);

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-label="本局结算">
      <section className="result-card">
        <p className="eyebrow">{state.settlement ? "流局结算" : "本局结束"}</p>
        <h2>{winners.length > 0 ? `${winners.length} 家胡牌` : "荒庄"}</h2>

        {winners.length > 0 ? (
          <div className="sc-winner-list">
            {winners.map((player) => (
              <div key={player.seat} className="sc-winner-row">
                <strong>
                  {relationLabels[player.seat]} · {player.name}
                </strong>
                <span className="sc-winner-title">{player.winInfo?.title}</span>
                <span className="sc-winner-fan">{player.winInfo?.fan} 番</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="sc-settle-table">
          {state.players.map((player) => (
            <div key={player.seat} className="sc-settle-row">
              <span>
                {relationLabels[player.seat]}
                {player.hasWon ? " · 已胡" : player.isHuazhu ? " · 花猪" : player.isTenpai ? " · 听牌" : ""}
              </span>
              <strong className={player.score < 0 ? "is-negative" : ""}>{player.score} 分</strong>
            </div>
          ))}
        </div>

        <div className="result-actions">
          <button className="primary-command" onClick={onNextRound}>
            <Play size={18} />
            下一局
          </button>
          <button className="secondary-command" onClick={onRestart}>
            <RotateCcw size={18} />
            重开
          </button>
          {onBackHome ? (
            <button className="secondary-command" onClick={onBackHome}>
              <HomeIcon size={16} />
              首页
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PauseOverlay({
  state,
  onResume,
  onRestart,
}: {
  state: GameState;
  onResume: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-label="暂停面板">
      <section className="result-card pause-card">
        <p className="eyebrow">牌局已暂停</p>
        <h2>第 {state.roundNumber} 局</h2>
        <div className="pause-scoreboard">
          {state.players.map((player) => (
            <div key={player.seat}>
              <span>{relationLabels[player.seat]}</span>
              <strong>{player.score} 分</strong>
            </div>
          ))}
        </div>
        <p className="pattern-note">
          刷新页面会恢复当前局。川麻血战到底：胡牌者亮牌离场，其余继续，直到只剩一家或牌墙摸完。
        </p>
        <div className="result-actions">
          <button className="primary-command" onClick={onResume}>
            <Play size={18} />
            继续
          </button>
          <button className="secondary-command" onClick={onRestart}>
            <RotateCcw size={18} />
            重开
          </button>
        </div>
      </section>
    </div>
  );
}
