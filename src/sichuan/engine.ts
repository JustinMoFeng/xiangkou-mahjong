import { chooseBotDiscard, chooseBotMissingSuit } from "./bot";
import {
  BASE_POINTS,
  checkWin,
  isTenpai,
  maxTenpaiValue,
  scoreWin,
  type ScoreContext,
} from "./rules";
import { createWall, shuffleTiles, sortTiles, tileSortValue, tileSuitPrefix } from "./tiles";
import type {
  ClaimOption,
  GameState,
  GangLogEntry,
  Meld,
  MeldKind,
  Player,
  Seat,
  Settlement,
  SettlementRow,
  SuitPrefix,
  Tile,
  TileCode,
  WinInfo,
  WinKind,
} from "./types";

const PLAYER_NAMES = ["你", "下家阿蜀", "对家幺鸡", "上家老川"] as const;
const STARTING_SCORE = 100;
const HUMAN_SEAT: Seat = 0;

const KONG_EXPOSED = 2;
const KONG_CONCEALED = 2;
const KONG_ADDED = 1;
const HUAZHU_PENALTY = BASE_POINTS * 2 ** 4;

let idCounter = 0;
function createId(prefix = "id"): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${idCounter}-${random}`;
}

export function createNewGame(seed = Date.now(), carriedScores?: number[], roundNumber = 1): GameState {
  const wall = shuffleTiles(createWall(), seed);
  const players = createPlayers();

  if (carriedScores) {
    for (const player of players) {
      player.score = carriedScores[player.seat] ?? STARTING_SCORE;
    }
  }

  for (let round = 0; round < 13; round += 1) {
    for (const player of players) {
      player.hand.push(drawFront(wall));
    }
  }

  const dealerDraw = drawFront(wall);
  players[HUMAN_SEAT].hand.push(dealerDraw);
  players[HUMAN_SEAT].drawnTileId = dealerDraw.id;

  for (const player of players) {
    player.hand = sortHandWithDrawn(player.hand, player.drawnTileId);
  }

  return {
    players,
    wall,
    currentSeat: HUMAN_SEAT,
    dealerSeat: HUMAN_SEAT,
    roundNumber,
    phase: "choosing-missing",
    missingChosen: false,
    awaitingDiscard: false,
    gangLog: [],
    drawReplacement: false,
    recentAction: `第 ${roundNumber} 局开局。请先定缺：选择一门不要的花色。`,
    logs: [
      {
        id: createId("log"),
        text: `第 ${roundNumber} 局开局。血战到底：定缺后开打，胡牌亮牌离场，直到只剩一家或摸完牌墙。`,
      },
    ],
    turn: 1,
    roomId: "LOCAL-SICHUAN",
  };
}

export function createNextRound(state: GameState, seed = Date.now()): GameState {
  return createNewGame(seed, state.players.map((player) => player.score), state.roundNumber + 1);
}

export function chooseMissingSuit(state: GameState, seat: Seat, suit: SuitPrefix): GameState {
  if (state.phase !== "choosing-missing") {
    return state;
  }

  const next = cloneGameState(state);
  next.players[seat].missingSuit = suit;
  next.recentAction = `${next.players[seat].name}定缺${suitLabel(suit)}`;

  const bots = next.players.filter((player) => player.type === "bot" && !player.missingSuit);
  for (const bot of bots) {
    bot.missingSuit = chooseBotMissingSuit(bot.hand);
  }

  if (next.players.every((player) => player.missingSuit)) {
    next.missingChosen = true;
    next.phase = "playing";
    next.currentSeat = next.dealerSeat;
    next.awaitingDiscard = true;
    next.recentAction = `定缺完成，${next.players[next.dealerSeat].name}先出牌。`;
    next.logs = addLog(next.logs, "四家定缺完成，开始对局。");
  }

  return next;
}

export function discardTile(state: GameState, seat: Seat, tileId: string): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat || !state.awaitingDiscard) {
    return state;
  }

  const player = state.players[seat];
  const tile = player.hand.find((item) => item.id === tileId);
  if (!tile) {
    return state;
  }
  if (!canDiscardFromMissingSuit(player, tile)) {
    return state;
  }

  const fromKong = state.drawReplacement;
  const next = cloneGameState(state);
  const nextPlayer = next.players[seat];
  const index = nextPlayer.hand.findIndex((item) => item.id === tileId);
  const [discarded] = nextPlayer.hand.splice(index, 1);
  nextPlayer.drawnTileId = undefined;
  nextPlayer.hand = sortTiles(nextPlayer.hand);
  nextPlayer.discards.push(discarded);
  next.lastDiscard = { tile: discarded, seat, fromKong };
  next.awaitingDiscard = false;
  next.drawReplacement = false;
  next.recentAction = `${nextPlayer.name}打出 ${discarded.label}`;
  next.logs = addLog(next.logs, next.recentAction);

  return resolveDiscard(next, seat, discarded, fromKong);
}

export function arrangeHand(state: GameState, seat: Seat): GameState {
  const next = cloneGameState(state);
  const player = next.players[seat];
  player.drawnTileId = undefined;
  player.hand = sortTiles(player.hand);
  return next;
}

export function drawForCurrentSeat(state: GameState): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.awaitingDiscard) {
    return state;
  }

  const next = cloneGameState(state);
  const player = next.players[next.currentSeat];

  if (player.hasWon) {
    return advanceToNextActive(next, player.seat);
  }

  if (next.wall.length === 0) {
    return finishByDraw(next);
  }

  const tile = drawFront(next.wall);
  player.drawnTileId = tile.id;
  player.hand = sortHandWithDrawn([...player.hand, tile], player.drawnTileId);
  next.awaitingDiscard = true;
  next.drawReplacement = false;

  if (isCleanOfMissing(player) && checkWin(player.hand, player.melds)) {
    if (player.type === "bot") {
      return finishWin(next, {
        winner: player.seat,
        from: player.seat,
        tile,
        kind: "self-draw",
      });
    }
    return next;
  }

  return next;
}

function drawReplacementForSeat(state: GameState, seat: Seat): GameState {
  const next = state;
  const player = next.players[seat];

  if (next.wall.length === 0) {
    return finishByDraw(next);
  }

  const tile = drawBack(next.wall);
  player.drawnTileId = tile.id;
  player.hand = sortHandWithDrawn([...player.hand, tile], player.drawnTileId);
  next.currentSeat = seat;
  next.awaitingDiscard = true;
  next.drawReplacement = true;

  if (isCleanOfMissing(player) && checkWin(player.hand, player.melds)) {
    if (player.type === "bot") {
      return finishWin(next, {
        winner: seat,
        from: seat,
        tile,
        kind: "self-draw",
      });
    }
  }

  return next;
}

export function playBotTurnStep(state: GameState): GameState {
  if (state.phase !== "playing" || state.pendingClaim) {
    return state;
  }

  const player = state.players[state.currentSeat];
  if (player.type !== "bot") {
    return state;
  }

  if (player.hasWon) {
    return advanceToNextActive(cloneGameState(state), player.seat);
  }

  if (!state.awaitingDiscard) {
    return drawForCurrentSeat(state);
  }

  return discardTile(state, player.seat, chooseBotDiscard(player.hand, player.missingSuit).id);
}

export function canCurrentHumanSelfWin(state: GameState): boolean {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== HUMAN_SEAT || !state.awaitingDiscard) {
    return false;
  }
  const player = state.players[HUMAN_SEAT];
  if (player.hasWon || !isCleanOfMissing(player)) {
    return false;
  }
  return checkWin(player.hand, player.melds);
}

export function claimSelfDraw(state: GameState): GameState {
  if (!canCurrentHumanSelfWin(state)) {
    return state;
  }
  const player = state.players[HUMAN_SEAT];
  const drawn = player.hand.find((tile) => tile.id === player.drawnTileId) ?? player.hand[player.hand.length - 1];
  return finishWin(state, {
    winner: HUMAN_SEAT,
    from: HUMAN_SEAT,
    tile: drawn,
    kind: "self-draw",
  });
}

export function canHumanConcealedKong(state: GameState): TileCode[] {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== HUMAN_SEAT || !state.awaitingDiscard) {
    return [];
  }
  return concealedKongCodes(state.players[HUMAN_SEAT]);
}

export function canHumanAddedKong(state: GameState): TileCode[] {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== HUMAN_SEAT || !state.awaitingDiscard) {
    return [];
  }
  return addedKongCodes(state.players[HUMAN_SEAT]);
}

export function declareConcealedKong(state: GameState, seat: Seat, code: TileCode): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat || !state.awaitingDiscard) {
    return state;
  }
  const player = state.players[seat];
  if (isMissingSuitCode(player, code)) {
    return state;
  }
  if (player.hand.filter((tile) => tile.code === code).length < 4) {
    return state;
  }

  const next = cloneGameState(state);
  const konger = next.players[seat];
  const tiles = konger.hand.filter((tile) => tile.code === code).slice(0, 4);
  konger.hand = konger.hand.filter((tile) => !tiles.some((match) => match.id === tile.id));
  konger.hand = sortTiles(konger.hand);
  konger.drawnTileId = undefined;
  konger.melds.push({ kind: "kong-concealed", tiles, code, from: seat });

  applyKongScore(next, seat, "kong-concealed", tiles[0].label);
  next.awaitingDiscard = false;

  if (next.phase === "finished") {
    return next;
  }
  return drawReplacementForSeat(next, seat);
}

export function declareAddedKong(state: GameState, seat: Seat, code: TileCode): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat || !state.awaitingDiscard) {
    return state;
  }
  const player = state.players[seat];
  if (isMissingSuitCode(player, code)) {
    return state;
  }
  const pong = player.melds.find((meld) => meld.kind === "pong" && meld.code === code);
  const handTile = player.hand.find((tile) => tile.code === code);
  if (!pong || !handTile) {
    return state;
  }

  const robbers = orderedSeatsAfter(seat).filter(
    (other) => !state.players[other].hasWon && canWinOn(state.players[other], handTile),
  );
  const humanRob = robbers.includes(HUMAN_SEAT);

  if (humanRob) {
    const next = cloneGameState(state);
    next.pendingClaim = {
      id: createId("claim"),
      from: seat,
      tile: handTile,
      seat: HUMAN_SEAT,
      options: [
        {
          id: `robkong-${handTile.id}`,
          action: "win",
          label: "抢杠胡",
          handTileIds: [],
          previewTileCodes: [handTile.code],
        },
      ],
    };
    next.recentAction = `你可以抢杠胡 ${state.players[seat].name} 的 ${handTile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  const botRobber = robbers.find((other) => state.players[other].type === "bot");
  if (botRobber !== undefined) {
    return finishWin(state, {
      winner: botRobber,
      from: seat,
      tile: handTile,
      kind: "discard",
      isRobKong: true,
    });
  }

  return completeAddedKong(cloneGameState(state), seat, code);
}

function completeAddedKong(next: GameState, seat: Seat, code: TileCode): GameState {
  const konger = next.players[seat];
  const meld = konger.melds.find((item) => item.kind === "pong" && item.code === code);
  const moved = konger.hand.find((tile) => tile.code === code);
  if (!meld || !moved) {
    return next;
  }
  konger.hand = konger.hand.filter((tile) => tile.id !== moved.id);
  konger.hand = sortTiles(konger.hand);
  konger.drawnTileId = undefined;
  meld.kind = "kong-added";
  meld.tiles = sortTiles([...meld.tiles, moved]);

  applyKongScore(next, seat, "kong-added", moved.label);
  next.awaitingDiscard = false;

  if (next.phase === "finished") {
    return next;
  }
  return drawReplacementForSeat(next, seat);
}

export function claimWin(state: GameState, seat: Seat): GameState {
  if (!state.pendingClaim || state.pendingClaim.seat !== seat) {
    return state;
  }
  const winOption = state.pendingClaim.options.find((option) => option.action === "win");
  if (!winOption) {
    return state;
  }

  const { tile, from } = state.pendingClaim;
  const isRob = winOption.id.startsWith("robkong");
  const botCoWinners = orderedSeatsAfter(from).filter(
    (other) => other !== seat && !state.players[other].hasWon && state.players[other].type === "bot" && canWinOn(state.players[other], tile),
  );

  return finishWin(state, {
    winner: seat,
    coWinners: botCoWinners,
    from,
    tile,
    kind: "discard",
    isRobKong: isRob,
    isGangPao: Boolean(state.lastDiscard?.fromKong),
  });
}

export function claimMeld(state: GameState, seat: Seat, optionId: string): GameState {
  if (!state.pendingClaim || state.pendingClaim.seat !== seat) {
    return state;
  }
  const option = state.pendingClaim.options.find((item) => item.id === optionId);
  if (!option || option.action === "win") {
    return state;
  }
  return applyMeldOption(state, seat, state.pendingClaim.from, state.pendingClaim.tile, option);
}

export function passClaim(state: GameState, seat: Seat): GameState {
  if (!state.pendingClaim || state.pendingClaim.seat !== seat) {
    return state;
  }

  const pending = state.pendingClaim;
  const wasWinPrompt = pending.options.some((option) => option.action === "win");
  const isRobKongPrompt = pending.options.some((option) => option.id.startsWith("robkong"));
  const next = cloneGameState(state);
  next.pendingClaim = undefined;

  if (isRobKongPrompt) {
    // 抢杠被放弃：补杠正常完成。
    return completeAddedKong(next, pending.from, pending.tile.code);
  }

  if (wasWinPrompt) {
    // 放弃胡：同一张牌上的机器人仍可胡（一炮多响），否则继续副露判定。
    const fromKong = Boolean(next.lastDiscard?.fromKong);
    const botWinners = orderedSeatsAfter(pending.from).filter(
      (other) => other !== seat && !next.players[other].hasWon && canWinOn(next.players[other], pending.tile),
    );
    if (botWinners.length > 0) {
      return finishWin(next, {
        winner: botWinners[0],
        coWinners: botWinners.slice(1),
        from: pending.from,
        tile: pending.tile,
        kind: "discard",
        isGangPao: fromKong,
      });
    }
    return advanceToNextActive(next, pending.from);
  }

  // 副露提示被跳过。
  return advanceToNextActive(next, pending.from);
}

function applyMeldOption(state: GameState, seat: Seat, from: Seat, tile: Tile, option: ClaimOption): GameState {
  const next = cloneGameState(state);
  const player = next.players[seat];
  const matching = option.handTileIds
    .map((id) => player.hand.find((item) => item.id === id))
    .filter((item): item is Tile => Boolean(item));

  if (matching.length !== option.handTileIds.length) {
    return state;
  }

  const fromPlayer = next.players[from];
  fromPlayer.discards = fromPlayer.discards.filter((discard) => discard.id !== tile.id);
  player.hand = player.hand.filter((item) => !matching.some((match) => match.id === item.id));

  if (option.action === "pong") {
    player.melds.push({ kind: "pong", from, code: tile.code, tiles: sortTiles([...matching, tile]) });
    player.hand = sortTiles(player.hand);
    player.drawnTileId = undefined;
    next.pendingClaim = undefined;
    next.currentSeat = seat;
    next.awaitingDiscard = true;
    next.drawReplacement = false;
    next.lastDiscard = undefined;
    next.turn += 1;
    next.recentAction = `${player.name}碰了 ${next.players[from].name} 的 ${tile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  // kong-exposed (直杠)
  player.melds.push({ kind: "kong-exposed", from, code: tile.code, tiles: sortTiles([...matching, tile]) });
  player.hand = sortTiles(player.hand);
  player.drawnTileId = undefined;
  next.pendingClaim = undefined;
  next.lastDiscard = undefined;
  next.recentAction = `${player.name}杠了 ${next.players[from].name} 的 ${tile.label}`;
  next.logs = addLog(next.logs, next.recentAction);
  applyKongScore(next, seat, "kong-exposed", tile.label, from);
  next.awaitingDiscard = false;

  if (next.phase === "finished") {
    return next;
  }
  return drawReplacementForSeat(next, seat);
}

function resolveDiscard(state: GameState, from: Seat, tile: Tile, fromKong: boolean): GameState {
  const others = orderedSeatsAfter(from).filter((seat) => !state.players[seat].hasWon);
  const winnableSeats = others.filter((seat) => canWinOn(state.players[seat], tile));
  const humanCanWin = winnableSeats.includes(HUMAN_SEAT);
  const botWinners = winnableSeats.filter((seat) => state.players[seat].type === "bot");
  const humanMeld = getMeldOptionsForSeat(state, HUMAN_SEAT, from, tile);

  if (humanCanWin) {
    const options: ClaimOption[] = [
      {
        id: `win-${tile.id}`,
        action: "win",
        label: "胡",
        handTileIds: [],
        previewTileCodes: [tile.code],
      },
    ];
    if (botWinners.length === 0) {
      options.push(...humanMeld);
    }

    const next = cloneGameState(state);
    next.pendingClaim = {
      id: createId("claim"),
      from,
      tile,
      seat: HUMAN_SEAT,
      options,
    };
    next.recentAction = `你可以胡 ${state.players[from].name} 的 ${tile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  if (botWinners.length > 0) {
    return finishWin(state, {
      winner: botWinners[0],
      coWinners: botWinners.slice(1),
      from,
      tile,
      kind: "discard",
      isGangPao: fromKong,
    });
  }

  if (humanMeld.length > 0) {
    const next = cloneGameState(state);
    next.pendingClaim = { id: createId("claim"), from, tile, seat: HUMAN_SEAT, options: humanMeld };
    next.recentAction = `你可以操作 ${state.players[from].name} 打出的 ${tile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  return continueAfterClaims(state, from, tile, fromKong);
}

function continueAfterClaims(state: GameState, from: Seat, tile: Tile, fromKong: boolean): GameState {
  const botWinners = orderedSeatsAfter(from)
    .filter((seat) => !state.players[seat].hasWon)
    .filter((seat) => state.players[seat].type === "bot" && canWinOn(state.players[seat], tile));
  if (botWinners.length > 0) {
    return finishWin(state, {
      winner: botWinners[0],
      coWinners: botWinners.slice(1),
      from,
      tile,
      kind: "discard",
      isGangPao: fromKong,
    });
  }

  const botMeld = orderedSeatsAfter(from)
    .filter((seat) => state.players[seat].type === "bot" && !state.players[seat].hasWon)
    .map((seat) => {
      const options = getMeldOptionsForSeat(state, seat, from, tile);
      const option = options.find((item) => item.action === "kong") ?? options.find((item) => item.action === "pong");
      return option ? { seat, option } : undefined;
    })
    .find((item): item is { seat: Seat; option: ClaimOption } => Boolean(item));

  if (botMeld) {
    return applyMeldOption(state, botMeld.seat, from, tile, botMeld.option);
  }

  const next = cloneGameState(state);
  return advanceToNextActive(next, from);
}

function advanceToNextActive(state: GameState, from: Seat): GameState {
  const activeCount = state.players.filter((player) => !player.hasWon).length;
  if (activeCount <= 1) {
    return finishByLastStanding(state);
  }

  let seat = nextSeat(from);
  while (state.players[seat].hasWon) {
    seat = nextSeat(seat);
  }
  state.currentSeat = seat;
  state.awaitingDiscard = false;
  state.drawReplacement = false;
  state.turn += 1;
  return state;
}

type FinishInput = {
  winner: Seat;
  coWinners?: Seat[];
  from: Seat;
  tile: Tile;
  kind: WinKind;
  isGangPao?: boolean;
  isRobKong?: boolean;
};

function finishWin(state: GameState, input: FinishInput): GameState {
  const next = cloneGameState(state);
  const allWinners = [input.winner, ...(input.coWinners ?? [])];

  for (const winnerSeat of allWinners) {
    settleSingleWin(next, {
      ...input,
      winner: winnerSeat,
    });
  }

  next.pendingClaim = undefined;
  next.lastDiscard = undefined;
  next.drawReplacement = false;

  const activeCount = next.players.filter((player) => !player.hasWon).length;
  if (activeCount <= 1) {
    finalizeLastStanding(next);
    next.phase = "finished";
    return next;
  }

  if (input.kind === "self-draw") {
    next.currentSeat = input.winner;
    next.awaitingDiscard = false;
    return advanceToNextActive(next, input.winner);
  }

  next.awaitingDiscard = false;
  return advanceToNextActive(next, input.from);
}

function settleSingleWin(state: GameState, input: FinishInput): void {
  const winner = state.players[input.winner];
  const concealed = input.kind === "discard" ? [...winner.hand, input.tile] : winner.hand;
  const context: ScoreContext = {
    kind: input.kind,
    isRobKong: input.isRobKong,
    isGangPao: input.kind === "discard" ? input.isGangPao : undefined,
    isGangFlower: input.kind === "self-draw" ? state.drawReplacement : undefined,
    isLastTile: state.wall.length === 0,
    isHeavenly: input.kind === "self-draw" && input.winner === state.dealerSeat && isFirstDraw(state),
    isEarthly: input.kind === "discard" && input.winner !== state.dealerSeat && isFirstDiscard(state),
  };

  const score = scoreWin(concealed, winner.melds, context);
  const points = BASE_POINTS * score.multiplier;

  if (input.kind === "self-draw") {
    for (const player of state.players) {
      if (player.seat === input.winner || player.hasWon) {
        continue;
      }
      player.score -= points;
      winner.score += points;
    }
  } else {
    const payer = state.players[input.from];
    payer.score -= points;
    winner.score += points;
  }

  const info: WinInfo = {
    kind: input.kind,
    from: input.from,
    tile: input.tile,
    fan: score.fan,
    title: score.title,
    details: score.details,
    turn: state.turn,
  };
  winner.hasWon = true;
  winner.winInfo = info;
  if (winner.drawnTileId) {
    winner.drawnTileId = undefined;
  }

  state.recentAction = `${winner.name}${input.kind === "self-draw" ? "自摸" : "胡"}：${score.title}，${score.fan} 番。`;
  state.logs = addLog(state.logs, state.recentAction);
}

function applyKongScore(state: GameState, seat: Seat, kind: MeldKind, label: string, from?: Seat): void {
  const konger = state.players[seat];
  const entry: GangLogEntry = { seat, kind, from: [] };

  if (kind === "kong-exposed" && from !== undefined) {
    const payer = state.players[from];
    payer.score -= KONG_EXPOSED;
    konger.score += KONG_EXPOSED;
    entry.from.push({ seat: from, amount: KONG_EXPOSED });
    state.recentAction = `刮风：${konger.name}直杠 ${label}，${payer.name}付 ${KONG_EXPOSED}`;
  } else {
    const amount = kind === "kong-concealed" ? KONG_CONCEALED : KONG_ADDED;
    for (const player of state.players) {
      if (player.seat === seat || player.hasWon) {
        continue;
      }
      player.score -= amount;
      konger.score += amount;
      entry.from.push({ seat: player.seat, amount });
    }
    const rain = kind === "kong-concealed" ? "下雨(暗杠)" : "补杠";
    state.recentAction = `${rain}：${konger.name}杠 ${label}，每家付 ${amount}`;
  }

  state.gangLog.push(entry);
  state.logs = addLog(state.logs, state.recentAction);
}

function finishByLastStanding(state: GameState): GameState {
  finalizeLastStanding(state);
  state.phase = "finished";
  return state;
}

function finalizeLastStanding(state: GameState): void {
  for (const player of state.players) {
    if (!player.hasWon) {
      player.isTenpai = isTenpai(player.hand, player.melds, player.missingSuit);
      player.isHuazhu = isHuazhuHand(player);
    }
  }
}

function finishByDraw(state: GameState): GameState {
  for (const player of state.players) {
    if (!player.hasWon) {
      player.isTenpai = isTenpai(player.hand, player.melds, player.missingSuit);
      player.isHuazhu = isHuazhuHand(player);
    }
  }

  const rows: SettlementRow[] = state.players.map((player) => ({
    seat: player.seat,
    name: player.name,
    reason: player.hasWon ? "已胡" : player.isHuazhu ? "花猪" : player.isTenpai ? "听牌" : "未听",
    delta: 0,
  }));
  const apply = (seat: Seat, amount: number) => {
    rows[seat].delta += amount;
    state.players[seat].score += amount;
  };

  // 退税：未听或花猪者退还本局收取的杠分
  for (const entry of state.gangLog) {
    const konger = state.players[entry.seat];
    if (konger.hasWon || (konger.isTenpai && !konger.isHuazhu)) {
      continue;
    }
    for (const payment of entry.from) {
      apply(entry.seat, -payment.amount);
      apply(payment.seat, payment.amount);
    }
  }

  const active = state.players.filter((player) => !player.hasWon);
  const huazhus = active.filter((player) => player.isHuazhu);
  const tenpais = active.filter((player) => player.isTenpai && !player.isHuazhu);

  // 查花猪：花猪赔付每一位未花猪的在场家
  for (const huazhu of huazhus) {
    for (const player of active) {
      if (player.seat === huazhu.seat || player.isHuazhu) {
        continue;
      }
      apply(huazhu.seat, -HUAZHU_PENALTY);
      apply(player.seat, HUAZHU_PENALTY);
    }
  }

  // 查大叫：未听(非花猪)赔付每一位听牌家其最大叫的番值
  const notTenpai = active.filter((player) => !player.isTenpai && !player.isHuazhu);
  for (const ting of tenpais) {
    const value = BASE_POINTS * Math.max(1, maxTenpaiValue(ting.hand, ting.melds, ting.missingSuit));
    for (const loser of notTenpai) {
      apply(loser.seat, -value);
      apply(ting.seat, value);
    }
  }

  const settlement: Settlement = { reason: "drain", rows };
  state.phase = "finished";
  state.settlement = settlement;
  state.recentAction = "牌墙摸完，流局结算：查大叫、查花猪、退税。";
  state.logs = addLog(state.logs, state.recentAction);
  return state;
}

export function getMeldOptionsForSeat(state: GameState, seat: Seat, from: Seat, tile: Tile): ClaimOption[] {
  if (seat === from) {
    return [];
  }
  const player = state.players[seat];
  if (player.hasWon || tile.suit === player.missingSuit) {
    return [];
  }

  const options: ClaimOption[] = [];
  const sameTiles = player.hand.filter((item) => item.code === tile.code);

  if (sameTiles.length >= 2) {
    const handTileIds = sameTiles.slice(0, 2).map((item) => item.id);
    options.push({
      id: `pong-${tile.id}-${handTileIds.join("-")}`,
      action: "pong",
      label: "碰",
      handTileIds,
      previewTileCodes: [tile.code, tile.code, tile.code],
    });
  }

  if (sameTiles.length >= 3) {
    const handTileIds = sameTiles.slice(0, 3).map((item) => item.id);
    options.push({
      id: `kong-${tile.id}-${handTileIds.join("-")}`,
      action: "kong",
      label: "杠",
      handTileIds,
      previewTileCodes: [tile.code, tile.code, tile.code, tile.code],
    });
  }

  return options;
}

function canWinOn(player: Player, tile: Tile): boolean {
  if (player.hasWon || tile.suit === player.missingSuit) {
    return false;
  }
  if (!isCleanOfMissing(player)) {
    return false;
  }
  return checkWin([...player.hand, tile], player.melds);
}

function canDiscardFromMissingSuit(player: Player, tile: Tile): boolean {
  return isCleanOfMissing(player) || tile.suit === player.missingSuit;
}

function isCleanOfMissing(player: Player): boolean {
  if (!player.missingSuit) {
    return true;
  }
  return !player.hand.some((tile) => tile.suit === player.missingSuit);
}

function isMissingSuitCode(player: Player, code: TileCode): boolean {
  return Boolean(player.missingSuit && tileSuitPrefix(code) === player.missingSuit);
}

function isHuazhuHand(player: Player): boolean {
  const suits = new Set<SuitPrefix>();
  for (const tile of player.hand) {
    suits.add(tile.suit);
  }
  for (const meld of player.melds) {
    suits.add(meld.tiles[0].suit);
  }
  return suits.size >= 3;
}

function concealedKongCodes(player: Player): TileCode[] {
  if (player.hasWon) {
    return [];
  }
  const counts = new Map<TileCode, number>();
  for (const tile of player.hand) {
    counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([code, value]) => value === 4 && !isMissingSuitCode(player, code))
    .map(([code]) => code);
}

function addedKongCodes(player: Player): TileCode[] {
  if (player.hasWon) {
    return [];
  }
  return player.melds
    .filter((meld) => meld.kind === "pong")
    .map((meld) => meld.code)
    .filter((code) => !isMissingSuitCode(player, code))
    .filter((code) => player.hand.some((tile) => tile.code === code));
}

function isFirstDraw(state: GameState): boolean {
  return state.players.every((player) => player.discards.length === 0) && state.turn === 1;
}

function isFirstDiscard(state: GameState): boolean {
  const totalDiscards = state.players.reduce((sum, player) => sum + player.discards.length, 0);
  return totalDiscards === 1;
}

function createPlayers(): Player[] {
  return PLAYER_NAMES.map((name, index) => ({
    seat: index as Seat,
    name,
    type: index === HUMAN_SEAT ? "human" : "bot",
    hand: [],
    drawnTileId: undefined,
    melds: [],
    discards: [],
    score: STARTING_SCORE,
    missingSuit: undefined,
    hasWon: false,
    winInfo: undefined,
    isTenpai: false,
    isHuazhu: false,
  }));
}

function drawFront(wall: Tile[]): Tile {
  const tile = wall.shift();
  if (!tile) {
    throw new Error("Cannot draw from an empty wall.");
  }
  return tile;
}

function drawBack(wall: Tile[]): Tile {
  const tile = wall.pop();
  if (!tile) {
    throw new Error("Cannot draw replacement from an empty wall.");
  }
  return tile;
}

function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      discards: [...player.discards],
      winInfo: player.winInfo
        ? { ...player.winInfo, details: player.winInfo.details.map((detail) => ({ ...detail })) }
        : undefined,
    })),
    wall: [...state.wall],
    logs: [...state.logs],
    gangLog: state.gangLog.map((entry) => ({ ...entry, from: entry.from.map((item) => ({ ...item })) })),
    lastDiscard: state.lastDiscard ? { ...state.lastDiscard } : undefined,
    lastKong: state.lastKong ? { ...state.lastKong } : undefined,
    settlement: state.settlement
      ? { ...state.settlement, rows: state.settlement.rows.map((row) => ({ ...row })) }
      : undefined,
    pendingClaim: state.pendingClaim
      ? {
          ...state.pendingClaim,
          options: state.pendingClaim.options.map((option) => ({
            ...option,
            handTileIds: [...option.handTileIds],
            previewTileCodes: [...option.previewTileCodes],
          })),
        }
      : undefined,
  };
}

function addLog(logs: GameState["logs"], text: string): GameState["logs"] {
  return [{ id: createId("log"), text }, ...logs].slice(0, 8);
}

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

function orderedSeatsAfter(seat: Seat): Seat[] {
  return [nextSeat(seat), nextSeat(nextSeat(seat)), nextSeat(nextSeat(nextSeat(seat)))];
}

function sortHandWithDrawn(hand: Tile[], drawnTileId?: string): Tile[] {
  if (!drawnTileId) {
    return sortTiles(hand);
  }
  const drawn = hand.find((tile) => tile.id === drawnTileId);
  const rest = hand.filter((tile) => tile.id !== drawnTileId);
  return drawn ? [...sortTiles(rest), drawn] : sortTiles(hand);
}

function suitLabel(suit: SuitPrefix): string {
  return suit === "m" ? "万" : suit === "p" ? "筒" : "条";
}

// Re-export for consumers that only import from engine.
export { tileSortValue };
