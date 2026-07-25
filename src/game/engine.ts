import { chooseBotDiscard } from "./bot";
import { createId } from "./id";
import { checkStandardWin, scoreWinningHand } from "./rules";
import { createWall, isNumberTile, shuffleTiles, sortTiles, tileRankNumber, tileSuitPrefix } from "./tiles";
import type {
  ClaimOption,
  GameState,
  MeldKind,
  Player,
  PlayerNames,
  Seat,
  SeatType,
  Tile,
  TileCode,
  WinKind,
  WinPattern,
  WinResult,
} from "./types";

export const DEFAULT_PLAYER_NAMES: PlayerNames = ["你", "阿南", "西门杠", "北风客"];
const WINDS = ["east", "south", "west", "north"] as const;
const STARTING_SCORE = 25000;
const HUMAN_SEAT: Seat = 0;

export function normalizePlayerNames(names?: readonly string[]): PlayerNames {
  return DEFAULT_PLAYER_NAMES.map((fallback, index) => {
    const trimmed = names?.[index]?.trim();
    return trimmed ? trimmed.slice(0, 16) : fallback;
  }) as PlayerNames;
}

export function createNewGame(
  seed = Date.now(),
  carriedScores?: number[],
  roundNumber = 1,
  names?: readonly string[],
  seatTypes?: Partial<Record<Seat, SeatType>>,
): GameState {
  const wall = shuffleTiles(createWall(), seed);
  const players = createPlayers(normalizePlayerNames(names), seatTypes);

  if (carriedScores) {
    for (const player of players) {
      player.score = carriedScores[player.seat] ?? STARTING_SCORE;
    }
  }

  for (let round = 0; round < 13; round += 1) {
    for (const player of players) {
      player.hand.push(drawTile(wall));
    }
  }

  const dealerDraw = drawTile(wall);
  players[0].hand.push(dealerDraw);
  players[0].drawnTileId = dealerDraw.id;

  for (const player of players) {
    player.hand = sortHandWithDrawnTile(player.hand, player.drawnTileId);
  }

  return {
    players,
    wall,
    currentSeat: HUMAN_SEAT,
    dealerSeat: HUMAN_SEAT,
    roundWind: "east",
    roundNumber,
    phase: "playing",
    recentAction: `第 ${roundNumber} 局开局。垃圾胡已开启，任何合法胡牌都能胡。`,
    logs: [
      {
        id: createId("log"),
        text: `第 ${roundNumber} 局开局。垃圾胡已开启：任何合法胡牌都能胡，低番按 1 倍结算。`,
      },
    ],
    turn: 1,
    roomId: "LOCAL-BOT",
  };
}

export function createNextRound(state: GameState, seed = Date.now()): GameState {
  return createNewGame(
    seed,
    state.players.map((player) => player.score),
    state.roundNumber + 1,
    state.players.map((player) => player.name),
    Object.fromEntries(state.players.map((player) => [player.seat, player.type])) as Partial<Record<Seat, SeatType>>,
  );
}

export function createMultiChowScenario(): GameState {
  const state = createNewGame(20260720);
  const wall = createWall();
  const take = (code: TileCode, copy = 0) => {
    const tile = wall.find((item) => item.code === code && item.id.endsWith(`-${copy}`));
    if (!tile) {
      throw new Error(`Missing scenario tile ${code}-${copy}`);
    }
    return tile;
  };
  const discard = take("p5", 0);

  state.players[0].hand = sortTiles([
    take("m1", 0),
    take("m1", 1),
    take("m2", 0),
    take("m3", 0),
    take("p3", 0),
    take("p4", 0),
    take("p6", 0),
    take("p7", 0),
    take("s2", 0),
    take("s3", 0),
    take("s4", 0),
    take("east", 0),
    take("red", 0),
  ]);
  state.players[0].drawnTileId = undefined;
  state.players[3].discards = [discard];
  state.lastDiscard = { tile: discard, seat: 3 };
  state.currentSeat = 3;
  state.pendingClaim = {
    id: "scenario-multi-chow",
    from: 3,
    tile: discard,
    seat: 0,
    options: getClaimOptionsForSeat(state, 0, 3, discard),
  };
  state.recentAction = "测试局面：你可以选择多种吃法";
  return state;
}

export function createBotPongScenario(): GameState {
  const state = createNewGame(20260721);
  const wall = createWall();
  const take = (code: TileCode, copy = 0) => {
    const tile = wall.find((item) => item.code === code && item.id.endsWith(`-${copy}`));
    if (!tile) {
      throw new Error(`Missing scenario tile ${code}-${copy}`);
    }
    return tile;
  };
  const [red0, red1, red2] = [take("red", 0), take("red", 1), take("red", 2)];

  state.currentSeat = 0;
  state.players[0].hand = [
    red2,
    ...sortTiles([
      take("m1", 0),
      take("m2", 0),
      take("m3", 0),
      take("p1", 0),
      take("p2", 0),
      take("p3", 0),
      take("s1", 0),
      take("s2", 0),
      take("s3", 0),
      take("m7", 0),
      take("m8", 0),
      take("m9", 0),
      take("east", 0),
    ]),
  ];
  state.players[1].hand = sortTiles([
    red0,
    red1,
    take("m4", 0),
    take("m5", 0),
    take("m6", 0),
    take("p4", 0),
    take("p5", 0),
    take("p6", 0),
    take("s4", 0),
    take("s5", 0),
    take("s6", 0),
    take("south", 0),
    take("west", 0),
  ]);
  state.players.forEach((player) => {
    player.drawnTileId = undefined;
    player.melds = [];
    player.discards = [];
  });
  state.pendingClaim = undefined;
  state.recentAction = "测试局面：你打红中后，下家机器人会碰";
  return state;
}

export function createRiverLayoutScenario(): GameState {
  const state = createNewGame(20260722);
  const wall = createWall();
  const used = new Set<string>();
  const take = (code: TileCode) => {
    const tile = wall.find((item) => item.code === code && !used.has(item.id));
    if (!tile) {
      throw new Error(`Missing river layout tile ${code}`);
    }
    used.add(tile.id);
    return tile;
  };
  const riverCodes: TileCode[] = ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2"];

  state.players.forEach((player) => {
    player.discards = riverCodes.map((code) => take(code));
    player.drawnTileId = undefined;
  });
  state.lastDiscard = undefined;
  state.pendingClaim = undefined;
  state.currentSeat = 0;
  state.recentAction = "测试局面：四家河牌排列检查";
  return state;
}

export function createMeldLayoutScenario(): GameState {
  const state = createNewGame(20260723);
  const wall = createWall();
  const used = new Set<string>();
  const take = (code: TileCode) => {
    const tile = wall.find((item) => item.code === code && !used.has(item.id));
    if (!tile) {
      throw new Error(`Missing meld layout tile ${code}`);
    }
    used.add(tile.id);
    return tile;
  };
  const meldCodes: TileCode[][] = [
    ["m1", "m1", "m1"],
    ["p2", "p2", "p2"],
    ["s3", "s3", "s3"],
    ["red", "red", "red"],
  ];

  state.players.forEach((player) => {
    const tiles = meldCodes[player.seat].map((code) => take(code));
    player.melds = [
      {
        kind: "pong",
        tiles,
        from: ((player.seat + 3) % 4) as Seat,
        calledTile: tiles[0],
      },
    ];
    player.hand = player.hand.slice(0, 10);
    player.drawnTileId = undefined;
  });
  state.pendingClaim = undefined;
  state.currentSeat = 0;
  state.recentAction = "测试局面：四家副露尺寸检查";
  return state;
}

export function discardTile(state: GameState, seat: Seat, tileId: string): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat) {
    return state;
  }

  const player = state.players[seat];
  const tile = player.hand.find((item) => item.id === tileId);

  if (!tile) {
    return state;
  }

  const next = cloneGameState(state);
  const nextPlayer = next.players[seat];
  const tileIndex = nextPlayer.hand.findIndex((item) => item.id === tileId);
  const [discarded] = nextPlayer.hand.splice(tileIndex, 1);
  nextPlayer.drawnTileId = undefined;
  nextPlayer.hand = sortTiles(nextPlayer.hand);
  nextPlayer.discards.push(discarded);
  next.lastDiscard = { tile: discarded, seat };
  next.recentAction = `${nextPlayer.name}打出 ${discarded.label}`;
  next.logs = addLog(next.logs, next.recentAction);

  return resolveDiscard(next, seat, discarded);
}

export function arrangeHand(state: GameState, seat: Seat): GameState {
  const next = cloneGameState(state);
  const player = next.players[seat];
  player.drawnTileId = undefined;
  player.hand = sortTiles(player.hand);
  return next;
}

export function claimWin(state: GameState, seat: Seat): GameState {
  if (
    !state.pendingClaim ||
    state.pendingClaim.seat !== seat ||
    !state.pendingClaim.options.some((option) => option.action === "win")
  ) {
    return state;
  }

  const { tile, from } = state.pendingClaim;
  const winner = state.players[seat];
  const check = checkStandardWin([...winner.hand, tile]);

  if (!check.canWin || !check.pattern) {
    return state;
  }

  return finishWin(state, {
    winner: seat,
    from,
    tile,
    kind: "discard",
    pattern: check.pattern,
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

function applyMeldOption(state: GameState, seat: Seat, from: Seat, tile: Tile, option: ClaimOption): GameState {
  if (option.action === "win") {
    return state;
  }

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
  player.melds.push({
    kind: option.action,
    from,
    calledTile: tile,
    tiles: sortTiles([...matching, tile]),
  });
  player.hand = sortTiles(player.hand);
  player.drawnTileId = undefined;
  next.pendingClaim = undefined;
  next.currentSeat = seat;
  next.turn += 1;
  next.recentAction = `${player.name}${meldActionLabel(option.action)}了 ${next.players[from].name} 的 ${tile.label}`;
  next.logs = addLog(next.logs, next.recentAction);
  return next;
}

export function passClaim(state: GameState, seat: Seat): GameState {
  if (!state.pendingClaim || state.pendingClaim.seat !== seat) {
    return state;
  }

  const pending = state.pendingClaim;
  const next = cloneGameState(state);
  next.pendingClaim = undefined;
  next.currentSeat = nextSeat(pending.from);
  next.turn += 1;
  next.recentAction = `${next.players[seat].name}选择跳过，轮到${next.players[next.currentSeat].name}`;
  next.logs = addLog(next.logs, next.recentAction);
  return next;
}

export function drawForCurrentSeat(state: GameState): GameState {
  if (state.phase !== "playing" || state.pendingClaim) {
    return state;
  }

  const next = cloneGameState(state);
  const player = next.players[next.currentSeat];

  if (next.wall.length === 0) {
    next.phase = "finished";
    next.recentAction = "牌山摸完，本局流局。";
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  const tile = drawTile(next.wall);
  player.drawnTileId = tile.id;
  player.hand = sortHandWithDrawnTile([...player.hand, tile], player.drawnTileId);

  const check = checkStandardWin(player.hand);
  if (check.canWin && check.pattern) {
    if (player.type === "bot") {
      return finishWin(next, {
        winner: player.seat,
        from: player.seat,
        tile,
        kind: "self-draw",
        pattern: check.pattern,
      });
    }

    return next;
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

  if (player.hand.length % 3 === 1) {
    return drawForCurrentSeat(state);
  }

  return discardTile(state, player.seat, chooseBotDiscard(player.hand).id);
}

export function canCurrentHumanSelfWin(state: GameState): boolean {
  return canSeatSelfWin(state, HUMAN_SEAT);
}

export function canSeatSelfWin(state: GameState, seat: Seat): boolean {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat) {
    return false;
  }

  const player = state.players[seat];
  return player.hand.length % 3 === 2 && checkStandardWin(player.hand).canWin;
}

export function claimSelfDraw(state: GameState, seat: Seat = HUMAN_SEAT): GameState {
  if (!canSeatSelfWin(state, seat)) {
    return state;
  }

  const player = state.players[seat];
  const check = checkStandardWin(player.hand);

  if (!check.canWin || !check.pattern) {
    return state;
  }

  return finishWin(state, {
    winner: seat,
    from: seat,
    tile: player.hand[player.hand.length - 1],
    kind: "self-draw",
    pattern: check.pattern,
  });
}

function resolveDiscard(state: GameState, from: Seat, tile: Tile): GameState {
  const seats = orderedSeatsAfter(from);
  const winSeats = seats.filter((seat) => checkStandardWin([...state.players[seat].hand, tile]).canWin);
  const interactiveWinner = winSeats.find((seat) => state.players[seat].type !== "bot");

  if (interactiveWinner !== undefined) {
    const next = cloneGameState(state);
    next.pendingClaim = {
      id: createId("claim"),
      from,
      tile,
      seat: interactiveWinner,
      options: getClaimOptionsForSeat(state, interactiveWinner, from, tile).filter((option) => option.action === "win"),
    };
    next.recentAction =
      interactiveWinner === HUMAN_SEAT
        ? `你可以操作 ${state.players[from].name} 打出的 ${tile.label}`
        : `${state.players[interactiveWinner].name}可以操作 ${state.players[from].name} 打出的 ${tile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  const botWinner = winSeats.find((seat) => state.players[seat].type === "bot");

  if (botWinner !== undefined) {
    const check = checkStandardWin([...state.players[botWinner].hand, tile]);
    if (check.canWin && check.pattern) {
      return finishWin(state, {
        winner: botWinner,
        from,
        tile,
        kind: "discard",
        pattern: check.pattern,
      });
    }
  }

  const interactiveMeld = seats
    .filter((seat) => state.players[seat].type !== "bot")
    .map((seat) => {
      const options = getClaimOptionsForSeat(state, seat, from, tile).filter(
        (option) => option.action === "pong" || option.action === "kong",
      );
      return options.length > 0 ? { seat, options } : undefined;
    })
    .find((item): item is { seat: Seat; options: ClaimOption[] } => Boolean(item));

  if (interactiveMeld) {
    const next = cloneGameState(state);
    next.pendingClaim = {
      id: createId("claim"),
      from,
      tile,
      seat: interactiveMeld.seat,
      options: interactiveMeld.options,
    };
    next.recentAction =
      interactiveMeld.seat === HUMAN_SEAT
        ? `你可以操作 ${state.players[from].name} 打出的 ${tile.label}`
        : `${state.players[interactiveMeld.seat].name}可以操作 ${state.players[from].name} 打出的 ${tile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  const botMeld = seats
    .filter((seat) => state.players[seat].type === "bot")
    .map((seat) => {
      const options = getClaimOptionsForSeat(state, seat, from, tile).filter(
        (option) => option.action === "pong" || option.action === "kong",
      );
      const option = options.find((item) => item.action === "kong") ?? options.find((item) => item.action === "pong");
      return option ? { seat, option } : undefined;
    })
    .find((item): item is { seat: Seat; option: ClaimOption } => Boolean(item));

  if (botMeld) {
    return applyMeldOption(state, botMeld.seat, from, tile, botMeld.option);
  }

  const interactiveChow = seats
    .filter((seat) => state.players[seat].type !== "bot")
    .map((seat) => {
      const options = getClaimOptionsForSeat(state, seat, from, tile).filter((option) => option.action === "chow");
      return options.length > 0 ? { seat, options } : undefined;
    })
    .find((item): item is { seat: Seat; options: ClaimOption[] } => Boolean(item));

  if (interactiveChow) {
    const next = cloneGameState(state);
    next.pendingClaim = {
      id: createId("claim"),
      from,
      tile,
      seat: interactiveChow.seat,
      options: interactiveChow.options,
    };
    next.recentAction =
      interactiveChow.seat === HUMAN_SEAT
        ? `你可以操作 ${state.players[from].name} 打出的 ${tile.label}`
        : `${state.players[interactiveChow.seat].name}可以操作 ${state.players[from].name} 打出的 ${tile.label}`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  const next = cloneGameState(state);
  next.currentSeat = nextSeat(from);
  next.turn += 1;
  return next;
}

function finishWin(
  state: GameState,
  input: {
    winner: Seat;
    from: Seat;
    tile: Tile;
    kind: WinKind;
    pattern: WinPattern;
  },
): GameState {
  const next = cloneGameState(state);
  const winner = next.players[input.winner];
  const tiles = input.kind === "discard" ? [...winner.hand, input.tile] : winner.hand;
  const score = scoreWinningHand({
    tiles,
    winningTile: input.tile,
    kind: input.kind,
    pattern: input.pattern,
  });
  const basePoints = score.multiplier * 1000;

  if (input.kind === "self-draw") {
    for (const player of next.players) {
      if (player.seat === input.winner) {
        player.score += basePoints * 3;
      } else {
        player.score -= basePoints;
      }
    }
  } else {
    next.players[input.winner].score += basePoints;
    next.players[input.from].score -= basePoints;
  }

  const result: WinResult = {
    winner: input.winner,
    from: input.from,
    tile: input.tile,
    kind: input.kind,
    multiplier: score.multiplier,
    title: score.title,
    details: score.details,
    pattern: input.pattern,
  };

  next.phase = "finished";
  next.pendingClaim = undefined;
  next.winner = result;
  next.gameOverReason = next.players.some((player) => player.score <= 0) ? "bankrupt" : undefined;
  next.recentAction = `${winner.name}${input.kind === "self-draw" ? "自摸" : "点炮"}胡牌：${score.title}，${score.multiplier} 倍。`;
  next.logs = addLog(
    next.logs,
    next.recentAction,
  );
  return next;
}

function createPlayers(names: PlayerNames, seatTypes?: Partial<Record<Seat, SeatType>>): Player[] {
  return names.map((name, index) => ({
    seat: index as Seat,
    name,
    wind: WINDS[index],
    type: seatTypes?.[index as Seat] ?? (index === HUMAN_SEAT ? "human" : "bot"),
    hand: [],
    drawnTileId: undefined,
    melds: [],
    discards: [],
    score: STARTING_SCORE,
    isDealer: index === HUMAN_SEAT,
  }));
}

function drawTile(wall: Tile[]): Tile {
  const tile = wall.shift();

  if (!tile) {
    throw new Error("Cannot draw from an empty wall.");
  }

  return tile;
}

function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      drawnTileId: player.drawnTileId,
      melds: player.melds.map((meld) => ({
        ...meld,
        tiles: [...meld.tiles],
      })),
      discards: [...player.discards],
    })),
    wall: [...state.wall],
    logs: [...state.logs],
    lastDiscard: state.lastDiscard ? { ...state.lastDiscard } : undefined,
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
  return (((seat + 1) % 4) as Seat);
}

function orderedSeatsAfter(seat: Seat): Seat[] {
  return [nextSeat(seat), nextSeat(nextSeat(seat)), nextSeat(nextSeat(nextSeat(seat)))];
}

export function getClaimOptionsForSeat(state: GameState, seat: Seat, from: Seat, tile: Tile): ClaimOption[] {
  if (seat === from) {
    return [];
  }

  const player = state.players[seat];
  const options: ClaimOption[] = [];

  if (checkStandardWin([...player.hand, tile]).canWin) {
    options.push({
      id: `win-${tile.id}`,
      action: "win",
      label: "胡",
      handTileIds: [],
      previewTileCodes: [tile.code],
    });
  }

  const chowOptions = getChowOptions(player.hand, tile, from, seat);
  options.push(...chowOptions);

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

function getChowOptions(hand: Tile[], tile: Tile, from: Seat, seat: Seat): ClaimOption[] {
  if (nextSeat(from) !== seat || !isNumberTile(tile.code)) {
    return [];
  }

  const prefix = tileSuitPrefix(tile.code);
  const rank = tileRankNumber(tile.code);
  const candidates: Array<[number, number]> = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];

  return candidates.flatMap(([first, second]) => {
    if (first < 1 || second > 9) {
      return [];
    }

    const firstCode = `${prefix}${first}` as TileCode;
    const secondCode = `${prefix}${second}` as TileCode;
    const firstTile = hand.find((item) => item.code === firstCode);
    const secondTile = hand.find((item) => item.code === secondCode);

    if (!firstTile || !secondTile) {
      return [];
    }

    const previewTileCodes = [tile.code, firstCode, secondCode].sort((a, b) => {
      const firstRank = tileRankNumber(a);
      const secondRank = tileRankNumber(b);
      return firstRank - secondRank;
    });

    return [
      {
        id: `chow-${tile.id}-${firstTile.id}-${secondTile.id}`,
        action: "chow" as const,
        label: `吃 ${previewTileCodes.map(tileCodeLabel).join("")}`,
        handTileIds: [firstTile.id, secondTile.id],
        previewTileCodes,
      },
    ];
  });
}

function sortHandWithDrawnTile(hand: Tile[], drawnTileId?: string): Tile[] {
  if (!drawnTileId) {
    return sortTiles(hand);
  }

  const drawnTile = hand.find((tile) => tile.id === drawnTileId);
  const rest = hand.filter((tile) => tile.id !== drawnTileId);
  return drawnTile ? [...sortTiles(rest), drawnTile] : sortTiles(hand);
}

function meldActionLabel(kind: MeldKind): string {
  if (kind === "chow") return "吃";
  if (kind === "kong") return "杠";
  return "碰";
}

function tileCodeLabel(code: TileCode): string {
  if (code.startsWith("m")) return `${code.slice(1)}万`;
  if (code.startsWith("p")) return `${code.slice(1)}筒`;
  if (code.startsWith("s")) return `${code.slice(1)}条`;
  return code;
}
