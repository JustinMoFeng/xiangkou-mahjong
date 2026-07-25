import { AlignJustify, Bot, Copy, Home as HomeIcon, House, Play, RotateCcw, Settings, Sparkles, Users, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  arrangeHand,
  canCurrentHumanSelfWin,
  claimMeld,
  claimSelfDraw,
  claimWin,
  createBotPongScenario,
  createMeldLayoutScenario,
  createMultiChowScenario,
  createNewGame,
  createNextRound,
  createRiverLayoutScenario,
  DEFAULT_PLAYER_NAMES,
  normalizePlayerNames,
  discardTile,
  drawForCurrentSeat,
  passClaim,
  playBotTurnStep,
} from "./game/engine";
import { getAudioEvents, MahjongAudio } from "./game/audio";
import { checkStandardWin } from "./game/rules";
import { clearSavedGame, loadSavedGame, loadTableProfile, saveGame, saveTableProfile } from "./game/storage";
import { sortTiles, tileAssetPath, tileColorClass } from "./game/tiles";
import type { ClaimOption, GameState, Meld, Player, PlayerNames, Tile } from "./game/types";

const windLabels = {
  east: "东",
  south: "南",
  west: "西",
  north: "北",
};

const relationLabels = ["本家", "下家", "对家", "上家"] as const;

function App({ onBackHome }: { onBackHome?: () => void } = {}) {
  const scenario = new URLSearchParams(window.location.search).get("scenario");
  const [playerNames, setPlayerNames] = useState<PlayerNames>(() => loadTableProfile().names);
  const [state, setState] = useState<GameState>(() => {
    if (scenario === "multi-chow") return createMultiChowScenario();
    if (scenario === "bot-pong") return createBotPongScenario();
    if (scenario === "river-layout") return createRiverLayoutScenario();
    if (scenario === "meld-layout") return createMeldLayoutScenario();
    return loadSavedGame() ?? createNewGame(Date.now(), undefined, 1, playerNames);
  });
  const [highlightedTileIds, setHighlightedTileIds] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<MahjongAudio>();
  const previousStateRef = useRef<GameState>();
  const human = state.players[0];
  const humanCanSelfWin = canCurrentHumanSelfWin(state);
  const humanPendingClaim = state.pendingClaim?.seat === 0 ? state.pendingClaim : undefined;
  const currentPlayer = state.players[state.currentSeat];

  useEffect(() => {
    if (scenario) {
      return;
    }

    saveGame(state);
  }, [scenario, state]);

  useEffect(() => {
    if (scenario) {
      return undefined;
    }

    const saveBeforeUnload = () => saveGame(state);
    window.addEventListener("pagehide", saveBeforeUnload);
    return () => window.removeEventListener("pagehide", saveBeforeUnload);
  }, [scenario, state]);

  useEffect(() => {
    if (isSettingsOpen || state.phase !== "playing" || state.pendingClaim || currentPlayer.type !== "bot") {
      return;
    }

    const delay = currentPlayer.hand.length % 3 === 1 ? 950 : 1350;
    const timer = window.setTimeout(() => {
      setState((current) => playBotTurnStep(current));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentPlayer.hand.length, currentPlayer.type, isSettingsOpen, state.phase, state.pendingClaim, state.turn]);

  useEffect(() => {
    if (isSettingsOpen || state.phase !== "playing" || state.pendingClaim || state.currentSeat !== 0 || human.hand.length % 3 !== 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setState((current) => drawForCurrentSeat(current));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [human.hand.length, isSettingsOpen, state.currentSeat, state.pendingClaim, state.phase, state.turn]);

  useEffect(() => {
    setHighlightedTileIds([]);
  }, [humanPendingClaim?.id, isSettingsOpen]);

  useEffect(() => {
    const events = getAudioEvents(previousStateRef.current, state);
    previousStateRef.current = state;
    audioRef.current?.playEvents(events);
  }, [state]);

  function restart() {
    const next = createNewGame(Date.now(), undefined, 1, playerNames);
    clearSavedGame();
    setIsSettingsOpen(false);
    setState(next);
  }

  function nextRound() {
    const next = createNextRound(state);
    setIsSettingsOpen(false);
    setState(next);
  }

  function resume() {
    setIsSettingsOpen(false);
  }

  function openSettings() {
    setIsSettingsOpen(true);
  }

  function renamePlayers(names: readonly string[]) {
    const profile = saveTableProfile(names);
    setPlayerNames(profile.names);
    setState((current) => ({
      ...current,
      players: current.players.map((player) => ({
        ...player,
        name: profile.names[player.seat],
      })),
    }));
  }

  async function toggleAudio() {
    const audio = audioRef.current ?? new MahjongAudio();
    audioRef.current = audio;

    if (audio.isEnabled()) {
      audio.disable();
      setAudioEnabled(false);
      return;
    }

    await audio.enable();
    setAudioEnabled(true);
  }

  function onArrangeHand() {
    setState((current) => arrangeHand(current, 0));
  }

  function onDiscard(tile: Tile) {
    if (state.phase !== "playing" || state.currentSeat !== 0 || state.pendingClaim) {
      return;
    }

    setState((current) => discardTile(current, 0, tile.id));
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

  function onSelfDraw() {
    setState((current) => claimSelfDraw(current));
  }

  return (
    <main className="app-shell">
      <div className="rotate-device" aria-label="横屏提示">
        <div>
          <strong>请横屏游玩</strong>
          <span>麻将桌面需要横向空间，旋转手机后继续当前牌局。</span>
        </div>
      </div>
      <section className="game-frame" aria-label="巷口麻将牌桌">
        <Header
          state={state}
          audioEnabled={audioEnabled}
          onOpenSettings={openSettings}
          onToggleAudio={toggleAudio}
          onBackHome={onBackHome}
        />

        <section className="mahjong-table" aria-label="四人麻将桌">
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
              <House size={18} />
              <span>余牌 {state.wall.length}</span>
            </div>
            <div className="recent-action" aria-live="polite">
              <span>{state.recentAction}</span>
            </div>
          </section>

          <section className={`human-area ${state.currentSeat === 0 ? "is-active" : ""}`} aria-label="你的手牌">
            <PlayerStatus player={human} active={state.currentSeat === 0} />
            <div className="hand-row">
              <MeldRow melds={human.melds} />
              {human.hand.map((tile) => (
                <button
                  key={tile.id}
                  className={`tile-button ${human.drawnTileId === tile.id ? "tile-button--drawn" : ""}`}
                  disabled={isSettingsOpen || state.phase !== "playing" || state.currentSeat !== 0 || Boolean(state.pendingClaim)}
                  onClick={() => onDiscard(tile)}
                  title={`打出${tile.label}`}
                  data-testid={human.drawnTileId === tile.id ? "drawn-tile" : "hand-tile"}
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
                  <button className="primary-command" onClick={onClaimWin}>
                    <Sparkles size={18} />
                    胡
                  </button>
                ) : null}
                <ClaimOptions
                  options={humanPendingClaim.options.filter((option) => option.action !== "win")}
                  onSelect={onClaimMeld}
                  onPreview={setHighlightedTileIds}
                />
                <button className="secondary-command" onClick={onPassClaim}>
                  跳过
                </button>
              </>
            ) : (
              <>
                <button className="primary-command" disabled={!humanCanSelfWin} onClick={onSelfDraw}>
                  <Sparkles size={18} />
                  自摸
                </button>
                <button className="secondary-command" disabled>
                  吃
                </button>
                <button className="secondary-command" disabled>
                  碰
                </button>
                <button className="secondary-command" disabled>
                  杠
                </button>
              </>
            )}
            <button className="secondary-command" onClick={onArrangeHand}>
              <AlignJustify size={18} />
              整理牌
            </button>
          </div>
        </section>

        {state.winner ? <ResultOverlay state={state} onRestart={restart} onNextRound={nextRound} /> : null}
        {isSettingsOpen ? (
          <SettingsOverlay
            state={state}
            onRenamePlayers={renamePlayers}
            onResetNames={() => renamePlayers(DEFAULT_PLAYER_NAMES)}
            onResume={resume}
            onRestart={restart}
          />
        ) : null}
      </section>
    </main>
  );
}

function Header({
  state,
  audioEnabled,
  onOpenSettings,
  onToggleAudio,
  onBackHome,
}: {
  state: GameState;
  audioEnabled: boolean;
  onOpenSettings: () => void;
  onToggleAudio: () => void;
  onBackHome?: () => void;
}) {
  const human = state.players[0];

  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">本地四人桌 · 第 {state.roundNumber} 局</p>
        <h1>巷口麻将</h1>
      </div>

      <div className="table-chips">
        <div className="score-chip" aria-label="你的点数">
          {human.name} {human.score.toLocaleString()} 点
        </div>
        <div className="rule-chip">
          <Sparkles size={16} />
          垃圾胡 1 倍起胡
        </div>
      </div>

      <div className="mode-actions">
        <button className="mode-button mode-button--active">
          <Bot size={17} />
          人机练习
        </button>
        <button className="mode-button" disabled title="第二阶段接入实时房间">
          <Users size={17} />
          朋友房间
        </button>
        <button
          className={`icon-command ${audioEnabled ? "icon-command--active" : ""}`}
          onClick={onToggleAudio}
          title={audioEnabled ? "关闭声音" : "开启声音"}
          aria-label={audioEnabled ? "关闭声音" : "开启声音"}
        >
          {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {onBackHome ? (
          <button className="icon-command" onClick={onBackHome} title="返回首页" aria-label="返回首页">
            <HomeIcon size={18} />
          </button>
        ) : null}
        <button className="icon-command" onClick={onOpenSettings} title="设置" aria-label="设置">
          <Settings size={18} />
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
      className={`table-seat table-seat--${position} ${active ? "is-active" : ""}`}
      aria-label={`${player.name}区域`}
    >
      <PlayerStatus player={player} active={active} />
      <div className="table-seat__rack">
        <MeldRow melds={player.melds} compact />
        <div className="concealed-hand" aria-label={`${player.name}手牌`}>
          {player.hand.map((tile) => (
            <span key={tile.id} className="tile-back" />
          ))}
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
  const discards =
    position === "top" || position === "right" ? [...player.discards].reverse() : player.discards;

  return (
    <section className={`river-zone river-zone--${position}`} aria-label={`${player.name}河牌`}>
      <span className="river-zone__name">
        {relationLabels[player.seat]} · {player.name}
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
        <span>{windLabels[player.wind]}风</span>
      </div>
      <small>
        {player.score.toLocaleString()} 点 · {player.hand.length} 张
      </small>
    </div>
  );
}

function MeldRow({ melds, compact = false }: { melds: Meld[]; compact?: boolean }) {
  if (melds.length === 0) {
    return <div className="meld-row meld-row--empty">无副露</div>;
  }

  return (
    <div className={`meld-row ${compact ? "meld-row--compact" : ""}`} aria-label="副露">
      {melds.map((meld, meldIndex) => (
        <div className="meld-set" key={`${meld.calledTile.id}-${meldIndex}`}>
          <span className="meld-label">{meld.kind === "kong" ? "杠" : meld.kind === "chow" ? "吃" : "碰"}</span>
          {meld.tiles.map((tile) => (
            <TileFace key={tile.id} tile={tile} compact={compact} />
          ))}
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
          data-testid={`claim-option-${option.action}`}
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
  muted = false,
  fresh = false,
  highlighted = false,
}: {
  tile: Tile;
  compact?: boolean;
  muted?: boolean;
  fresh?: boolean;
  highlighted?: boolean;
}) {
  return (
    <span
      className={`tile-face ${tileColorClass(tile.code)} ${compact ? "tile-face--compact" : ""} ${muted ? "is-muted" : ""} ${
        fresh ? "is-fresh" : ""
      } ${highlighted ? "is-highlighted" : ""}`}
    >
      <img className="tile-face__image" src={tileAssetPath(tile.code)} alt={tile.label} draggable={false} />
    </span>
  );
}

function ResultOverlay({
  state,
  onRestart,
  onNextRound,
}: {
  state: GameState;
  onRestart: () => void;
  onNextRound: () => void;
}) {
  const result = state.winner!;
  const winner = state.players[result.winner];
  const from = state.players[result.from];
  const winningTiles = result.kind === "discard" ? [...winner.hand, result.tile] : winner.hand;
  const canStillReadPattern = checkStandardWin(winningTiles);

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-label="本局结算">
      <section className="result-card">
        <p className="eyebrow">{result.kind === "self-draw" ? "自摸" : `${from.name}点炮`}</p>
        <h2>{state.gameOverReason ? "整场结束" : `${winner.name}胡牌`}</h2>
        <div className="result-title">{result.title}</div>
        <div className="result-score">{result.multiplier} 倍</div>
        <div className="result-details">
          {result.details.map((detail, index) => (
            <span key={`${detail.name}-${index}`}>
              {detail.name} +{detail.multiplier}
            </span>
          ))}
        </div>
        <div className="result-hand">
          {sortTiles(winningTiles).map((tile) => (
            <TileFace key={tile.id} tile={tile} compact />
          ))}
        </div>
        {canStillReadPattern.pattern ? (
          <p className="pattern-note">将牌：{canStillReadPattern.pattern.pair}，标准 4 面子 1 将。</p>
        ) : null}
        {state.gameOverReason ? <p className="pattern-note">有人点数归零，本场结束。</p> : null}
        <div className="result-actions">
          {!state.gameOverReason ? (
            <button className="primary-command" onClick={onNextRound}>
              <Play size={18} />
              下一局
            </button>
          ) : null}
          <button className="secondary-command" onClick={onRestart}>
            <RotateCcw size={18} />
            重开本场
          </button>
          <button
            className="secondary-command"
            onClick={() => navigator.clipboard?.writeText(`巷口麻将 ${winner.name}${result.title}${result.multiplier}倍`)}
          >
            <Copy size={16} />
            复制战绩
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsOverlay({
  state,
  onRenamePlayers,
  onResetNames,
  onResume,
  onRestart,
}: {
  state: GameState;
  onRenamePlayers: (names: readonly string[]) => void;
  onResetNames: () => void;
  onResume: () => void;
  onRestart: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"general" | "names">("general");
  const [draftNames, setDraftNames] = useState<PlayerNames>(() => state.players.map((player) => player.name) as PlayerNames);
  const hasNameChanges = draftNames.some((name, index) => name.trim() !== state.players[index].name);

  function updateDraftName(index: number, value: string) {
    setDraftNames((current) => current.map((name, nameIndex) => (nameIndex === index ? value : name)) as PlayerNames);
  }

  function saveNames() {
    const normalized = normalizePlayerNames(draftNames);
    setDraftNames(normalized);
    onRenamePlayers(normalized);
  }

  function resetNames() {
    const defaults = [...DEFAULT_PLAYER_NAMES] as PlayerNames;
    setDraftNames(defaults);
    onResetNames();
  }

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-label="牌桌设置">
      <section className="result-card settings-card">
        <p className="eyebrow">牌桌设置</p>
        <h2>第 {state.roundNumber} 局</h2>
        <div className="settings-tabs" role="tablist" aria-label="设置页">
          <button
            className={activeTab === "general" ? "is-active" : ""}
            role="tab"
            aria-selected={activeTab === "general"}
            onClick={() => setActiveTab("general")}
          >
            通用
          </button>
          <button
            className={activeTab === "names" ? "is-active" : ""}
            role="tab"
            aria-selected={activeTab === "names"}
            onClick={() => setActiveTab("names")}
          >
            改名
          </button>
        </div>

        {activeTab === "general" ? (
          <div className="settings-page" role="tabpanel" aria-label="通用设置">
            <div className="pause-scoreboard">
              {state.players.map((player) => (
                <div key={player.seat}>
                  <span>
                    {relationLabels[player.seat]} · {player.name}
                  </span>
                  <strong>{player.score.toLocaleString()} 点</strong>
                </div>
              ))}
            </div>
            <p className="pattern-note">
              刷新页面会恢复当前局。整场暂按 25000 点起算，任意一家点数归零或以下时结束；未归零时每局结算后可进入下一局。
            </p>
            <div className="result-actions">
              <button className="primary-command" onClick={onResume}>
                <Play size={18} />
                继续
              </button>
              <button className="secondary-command" onClick={onRestart}>
                <RotateCcw size={18} />
                重开本场
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-page" role="tabpanel" aria-label="改名设置">
            <div className="name-editor" aria-label="改名">
              {state.players.map((player) => (
                <label key={player.seat} className="name-editor-row">
                  <span>
                    {relationLabels[player.seat]} · {windLabels[player.wind]}风
                  </span>
                  <input
                    value={draftNames[player.seat]}
                    maxLength={16}
                    onChange={(event) => updateDraftName(player.seat, event.target.value)}
                    aria-label={`${relationLabels[player.seat]}名字`}
                  />
                </label>
              ))}
            </div>
            <div className="name-editor-actions">
              <button className="primary-command" disabled={!hasNameChanges} onClick={saveNames}>
                保存名字
              </button>
              <button className="secondary-command" onClick={resetNames}>
                恢复默认
              </button>
            </div>
            <p className="pattern-note">名字会保存在本机，刷新、下一局和重开本场都会继续使用。</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
