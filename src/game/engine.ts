import { chooseBotDiscard } from "./bot";
import { createId } from "./id";
import { checkWinningHand, scoreWinningHand } from "./rules";
import { createWall, isFlowerTile, isNumberTile, shuffleTiles, sortTiles, tileRankNumber, tileSuitPrefix } from "./tiles";
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
  WinBonusEvent,
  WinKind,
  WinPattern,
  WinResult,
} from "./types";

export const DEFAULT_PLAYER_NAMES: PlayerNames = ["你", "阿南", "西门杠", "北风客"];
const WINDS = ["east", "south", "west", "north"] as const;
const STARTING_SCORE = 25000;
const HUMAN_SEAT: Seat = 0;
const MAX_FLOWER_REPLACEMENTS = 32;

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
    replaceFlowers(wall, player);
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
    player.flowers = [];
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
    player.flowers = [];
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
  const check = checkWinningHand([...winner.hand, tile]);

  if (!check.canWin || !check.pattern) {
    return state;
  }

  return finishWin(state, {
    winner: seat,
    from,
    tile,
    kind: "discard",
    pattern: check.pattern,
    bonusEvent: state.pendingClaim.robKong ? "rob-kong" : undefined,
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
    kongKind: option.action === "kong" ? "exposed" : undefined,
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

  if (option.action === "kong") {
    const drawResult = drawSupplementTile(next, seat);
    if (drawResult.drawnTile) {
      next.recentAction = `${player.name}明杠 ${tile.label}，补摸一张。`;
      next.logs = addLog(next.logs, next.recentAction);

      const check = checkWinningHand(player.hand);
      if (check.canWin && check.pattern && player.type === "bot") {
        return finishWin(next, {
          winner: seat,
          from: seat,
          tile: drawResult.drawnTile,
          kind: "self-draw",
          pattern: check.pattern,
          bonusEvent: "kong-draw",
        });
      }
    }
  }

  return next;
}

export function passClaim(state: GameState, seat: Seat): GameState {
  if (!state.pendingClaim || state.pendingClaim.seat !== seat) {
    return state;
  }

  const pending = state.pendingClaim;
  const next = cloneGameState(state);
  next.pendingClaim = undefined;

  if (pending.robKong) {
    const drawResult = drawSupplementTile(next, pending.from);
    if (drawResult.drawnTile) {
      next.currentSeat = pending.from;
      next.turn += 1;
      next.recentAction = `${next.players[seat].name}选择跳过抢杠，${next.players[pending.from].name}补摸一张。`;
      next.logs = addLog(next.logs, next.recentAction);
    }
    return next;
  }

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
  next.lastSupplementDraw = undefined;

  const drawResult = drawTileForPlayer(next, player.seat);

  if (drawResult.flowers.length > 0) {
    const flowerLabels = drawResult.flowers.map((tile) => tile.label).join("、");
    next.recentAction = `${player.name}补花 ${flowerLabels}。`;
    next.logs = addLog(next.logs, next.recentAction);
  }

  if (!drawResult.drawnTile) {
    return next;
  }

  const check = checkWinningHand(player.hand);
  if (check.canWin && check.pattern) {
    if (player.type === "bot") {
      return finishWin(next, {
        winner: player.seat,
        from: player.seat,
        tile: drawResult.drawnTile,
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

  const addedKong = addedKongCodes(player)[0];
  if (addedKong) {
    return declareAddedKong(state, player.seat, addedKong);
  }

  const concealedKong = concealedKongCodes(player)[0];
  if (concealedKong) {
    return declareConcealedKong(state, player.seat, concealedKong);
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
  return player.hand.length % 3 === 2 && checkWinningHand(player.hand).canWin;
}

export function canSeatAddedKong(state: GameState, seat: Seat): TileCode[] {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat) {
    return [];
  }

  return addedKongCodes(state.players[seat]);
}

export function canSeatConcealedKong(state: GameState, seat: Seat): TileCode[] {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat) {
    return [];
  }

  return concealedKongCodes(state.players[seat]);
}

export function claimSelfDraw(state: GameState, seat: Seat = HUMAN_SEAT): GameState {
  if (!canSeatSelfWin(state, seat)) {
    return state;
  }

  const player = state.players[seat];
  const check = checkWinningHand(player.hand);

  if (!check.canWin || !check.pattern) {
    return state;
  }

  return finishWin(state, {
    winner: seat,
    from: seat,
    tile: player.hand[player.hand.length - 1],
    kind: "self-draw",
    pattern: check.pattern,
    bonusEvent: state.lastSupplementDraw?.seat === seat ? "kong-draw" : undefined,
  });
}

export function declareAddedKong(state: GameState, seat: Seat, code: TileCode): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat) {
    return state;
  }

  const player = state.players[seat];
  const pong = player.melds.find((meld) => meld.kind === "pong" && meld.calledTile.code === code);
  const handTile = player.hand.find((tile) => tile.code === code);

  if (!pong || !handTile) {
    return state;
  }

  const next = cloneGameState(state);
  const nextPlayer = next.players[seat];
  const nextMeld = nextPlayer.melds.find((meld) => meld.kind === "pong" && meld.calledTile.code === code);
  const tileIndex = nextPlayer.hand.findIndex((tile) => tile.id === handTile.id);

  if (!nextMeld || tileIndex < 0) {
    return state;
  }

  const [moved] = nextPlayer.hand.splice(tileIndex, 1);
  nextMeld.kind = "kong";
  nextMeld.kongKind = "added";
  nextMeld.tiles = sortTiles([...nextMeld.tiles, moved]);
  nextPlayer.drawnTileId = undefined;
  nextPlayer.hand = sortTiles(nextPlayer.hand);

  const interactiveRobber = orderedSeatsAfter(seat).find(
    (otherSeat) => next.players[otherSeat].type !== "bot" && checkWinningHand([...next.players[otherSeat].hand, moved]).canWin,
  );
  if (interactiveRobber !== undefined) {
    next.pendingClaim = {
      id: createId("claim"),
      from: seat,
      tile: moved,
      seat: interactiveRobber,
      robKong: true,
      options: [
        {
          id: `rob-kong-win-${moved.id}`,
          action: "win",
          label: "抢杠胡",
          handTileIds: [],
          previewTileCodes: [moved.code],
        },
      ],
    };
    next.recentAction =
      interactiveRobber === HUMAN_SEAT
        ? `你可以抢 ${nextPlayer.name} 的 ${moved.label} 补杠`
        : `${next.players[interactiveRobber].name}可以抢 ${nextPlayer.name} 的 ${moved.label} 补杠`;
    next.logs = addLog(next.logs, next.recentAction);
    return next;
  }

  const robKongSeat = findBotRobKongWinner(next, seat, moved);
  if (robKongSeat !== undefined) {
    const winner = next.players[robKongSeat];
    const check = checkWinningHand([...winner.hand, moved]);
    if (check.canWin && check.pattern) {
      return finishWin(next, {
        winner: robKongSeat,
        from: seat,
        tile: moved,
        kind: "discard",
        pattern: check.pattern,
        bonusEvent: "rob-kong",
      });
    }
  }

  const drawResult = drawSupplementTile(next, seat);
  if (!drawResult.drawnTile) {
    return next;
  }

  next.recentAction = `${nextPlayer.name}补杠 ${moved.label}，补摸一张。`;
  next.logs = addLog(next.logs, next.recentAction);
  next.turn += 1;

  const check = checkWinningHand(nextPlayer.hand);
  if (check.canWin && check.pattern && nextPlayer.type === "bot") {
    return finishWin(next, {
      winner: seat,
      from: seat,
      tile: drawResult.drawnTile,
      kind: "self-draw",
      pattern: check.pattern,
      bonusEvent: "kong-draw",
    });
  }

  return next;
}

export function declareConcealedKong(state: GameState, seat: Seat, code: TileCode): GameState {
  if (state.phase !== "playing" || state.pendingClaim || state.currentSeat !== seat) {
    return state;
  }

  const player = state.players[seat];
  const matching = player.hand.filter((tile) => tile.code === code);
  if (matching.length < 4) {
    return state;
  }

  const next = cloneGameState(state);
  const nextPlayer = next.players[seat];
  const nextMatching = nextPlayer.hand.filter((tile) => tile.code === code).slice(0, 4);
  if (nextMatching.length < 4) {
    return state;
  }

  nextPlayer.hand = nextPlayer.hand.filter((tile) => !nextMatching.some((match) => match.id === tile.id));
  nextPlayer.melds.push({
    kind: "kong",
    kongKind: "concealed",
    from: seat,
    calledTile: nextMatching[0],
    tiles: sortTiles(nextMatching),
  });
  nextPlayer.drawnTileId = undefined;

  const drawResult = drawSupplementTile(next, seat);
  if (!drawResult.drawnTile) {
    return next;
  }

  next.recentAction = `${nextPlayer.name}暗杠 ${nextMatching[0].label}，补摸一张。`;
  next.logs = addLog(next.logs, next.recentAction);
  next.turn += 1;

  const check = checkWinningHand(nextPlayer.hand);
  if (check.canWin && check.pattern && nextPlayer.type === "bot") {
    return finishWin(next, {
      winner: seat,
      from: seat,
      tile: drawResult.drawnTile,
      kind: "self-draw",
      pattern: check.pattern,
      bonusEvent: "kong-draw",
    });
  }

  return next;
}

function resolveDiscard(state: GameState, from: Seat, tile: Tile): GameState {
  const seats = orderedSeatsAfter(from);
  const winSeats = seats.filter((seat) => checkWinningHand([...state.players[seat].hand, tile]).canWin);
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
    const check = checkWinningHand([...state.players[botWinner].hand, tile]);
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
    bonusEvent?: WinBonusEvent;
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
    melds: winner.melds,
    flowers: winner.flowers,
    bonusEvent: input.bonusEvent,
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
    bonusEvent: input.bonusEvent,
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
    flowers: [],
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

function drawTileFromEnd(wall: Tile[]): Tile {
  const tile = wall.pop();

  if (!tile) {
    throw new Error("Cannot draw from an empty wall.");
  }

  return tile;
}

function replaceFlowers(wall: Tile[], player: Player, fromEnd = false): Tile[] {
  const revealedFlowers: Tile[] = [];

  for (let replacementCount = 0; replacementCount < MAX_FLOWER_REPLACEMENTS; replacementCount += 1) {
    const flowers = player.hand.filter((tile) => isFlowerTile(tile.code));
    if (flowers.length === 0) {
      break;
    }

    revealedFlowers.push(...flowers);
    player.flowers.push(...flowers);
    player.hand = player.hand.filter((tile) => !isFlowerTile(tile.code));
    if (flowers.some((tile) => tile.id === player.drawnTileId)) {
      player.drawnTileId = undefined;
    }

    for (const flower of flowers) {
      if (wall.length === 0) {
        continue;
      }

      const replacement = fromEnd ? drawTileFromEnd(wall) : drawTile(wall);
      player.hand.push(replacement);
      player.drawnTileId = replacement.id;
    }
  }

  return revealedFlowers;
}

function drawTileForPlayer(state: GameState, seat: Seat, fromEnd = false): { drawnTile?: Tile; flowers: Tile[] } {
  const player = state.players[seat];

  if (state.wall.length === 0) {
    state.phase = "finished";
    state.recentAction = "牌山摸完，本局流局。";
    state.logs = addLog(state.logs, state.recentAction);
    return { flowers: [] };
  }

  const tile = fromEnd ? drawTileFromEnd(state.wall) : drawTile(state.wall);
  player.drawnTileId = tile.id;
  player.hand.push(tile);
  const flowers = replaceFlowers(state.wall, player, fromEnd);
  player.hand = sortHandWithDrawnTile(player.hand, player.drawnTileId);
  const drawnTile = player.drawnTileId ? player.hand.find((item) => item.id === player.drawnTileId) : undefined;

  return { drawnTile, flowers };
}

function drawSupplementTile(state: GameState, seat: Seat): { drawnTile?: Tile; flowers: Tile[] } {
  const result = drawTileForPlayer(state, seat, true);
  if (result.drawnTile) {
    state.lastSupplementDraw = {
      seat,
      tileId: result.drawnTile.id,
    };
  }

  return result;
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
      flowers: [...(player.flowers ?? [])],
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

function addedKongCodes(player: Player): TileCode[] {
  return player.melds
    .filter((meld) => meld.kind === "pong")
    .map((meld) => meld.calledTile.code)
    .filter((code, index, codes) => codes.indexOf(code) === index && player.hand.some((tile) => tile.code === code));
}

function concealedKongCodes(player: Player): TileCode[] {
  const counts = new Map<TileCode, number>();
  for (const tile of player.hand) {
    counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count >= 4).map(([code]) => code);
}

function findBotRobKongWinner(state: GameState, from: Seat, tile: Tile): Seat | undefined {
  return orderedSeatsAfter(from).find((seat) => {
    if (state.players[seat].type !== "bot") {
      return false;
    }

    return checkWinningHand([...state.players[seat].hand, tile]).canWin;
  });
}

export function getClaimOptionsForSeat(state: GameState, seat: Seat, from: Seat, tile: Tile): ClaimOption[] {
  if (seat === from) {
    return [];
  }

  const player = state.players[seat];
  const options: ClaimOption[] = [];

  if (checkWinningHand([...player.hand, tile]).canWin) {
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
  if (/^m[1-9]$/.test(code)) return `${code.slice(1)}万`;
  if (/^p[1-9]$/.test(code)) return `${code.slice(1)}筒`;
  if (/^s[1-9]$/.test(code)) return `${code.slice(1)}条`;
  return code;
}
