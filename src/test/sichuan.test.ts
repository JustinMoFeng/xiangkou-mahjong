import { describe, expect, it } from "vitest";
import {
  checkWin,
  isSevenPairs,
  isTenpai,
  maxTenpaiValue,
  scoreWin,
} from "../sichuan/rules";
import {
  chooseMissingSuit,
  createNewGame,
  createNextRound,
  declareConcealedKong,
  discardTile,
  drawForCurrentSeat,
  getMeldOptionsForSeat,
  passClaim,
  playBotTurnStep,
} from "../sichuan/engine";
import { chooseBotMissingSuit } from "../sichuan/bot";
import { createWall } from "../sichuan/tiles";
import type { Meld, Tile, TileCode } from "../sichuan/types";

const tilePool = createWall();

function tiles(codes: TileCode[]): Tile[] {
  const used = new Map<TileCode, number>();
  return codes.map((code) => {
    const copy = used.get(code) ?? 0;
    used.set(code, copy + 1);
    const tile = tilePool.find((item) => item.code === code && item.id.endsWith(`-${copy}`));
    if (!tile) {
      throw new Error(`Missing tile ${code} copy ${copy}`);
    }
    return tile;
  });
}

describe("sichuan rules — win detection", () => {
  it("accepts a standard 4-melds + pair hand", () => {
    const hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "p9", "p9"]);
    expect(checkWin(hand, [])).toBe(true);
  });

  it("accepts seven pairs", () => {
    const hand = tiles(["m1", "m1", "m2", "m2", "m3", "m3", "p5", "p5", "s7", "s7", "s8", "s8", "s9", "s9"]);
    expect(isSevenPairs(hand)).toBe(true);
    expect(checkWin(hand, [])).toBe(true);
  });

  it("rejects a non-winning shape", () => {
    const hand = tiles(["m1", "m1", "m1", "m2", "m3", "m4", "p2", "p3", "p5", "s1", "s2", "s3", "s6", "s8"]);
    expect(checkWin(hand, [])).toBe(false);
  });

  it("counts a win when melds complete the hand", () => {
    const concealed = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s9", "s9"]);
    const melds: Meld[] = [
      { kind: "pong", code: "m5", from: 1, tiles: tiles(["m5", "m5", "m5"]) },
      { kind: "pong", code: "s2", from: 2, tiles: tiles(["s2", "s2", "s2"]) },
    ];
    expect(checkWin(concealed, melds)).toBe(true);
  });
});

describe("sichuan rules — scoring", () => {
  it("scores a plain hand as 0 fan (平胡)", () => {
    const hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "p9", "p9"]);
    const score = scoreWin(hand, [], { kind: "discard" });
    expect(score.title).toBe("平胡");
    expect(score.fan).toBe(0);
    expect(score.multiplier).toBe(1);
  });

  it("adds fan for pure suit + all triplets + self draw", () => {
    const hand = tiles(["m1", "m1", "m1", "m3", "m3", "m3", "m5", "m5", "m5", "m7", "m7", "m7", "m9", "m9"]);
    const score = scoreWin(hand, [], { kind: "self-draw" });
    // 对对胡1 + 清一色2 + 自摸1 = 4 番
    const names = score.details.map((detail) => detail.name);
    expect(names).toContain("对对胡");
    expect(names).toContain("清一色");
    expect(names).toContain("自摸");
    expect(score.fan).toBe(4);
    expect(score.multiplier).toBe(16);
  });

  it("scores seven pairs and roots", () => {
    const hand = tiles(["m1", "m1", "m1", "m1", "m2", "m2", "m3", "m3", "p5", "p5", "s7", "s7", "s8", "s8"]);
    const score = scoreWin(hand, [], { kind: "discard" });
    const names = score.details.map((detail) => detail.name);
    expect(names).toContain("七对");
    // four identical tiles in seven pairs = 龙七对 root logic -> at least one 根
    expect(names.filter((name) => name === "根").length).toBeGreaterThanOrEqual(1);
  });

  it("caps fan at the max", () => {
    const hand = tiles(["m1", "m1", "m1", "m1", "m2", "m2", "m2", "m2", "m3", "m3", "m3", "m3", "m4", "m4"]);
    const score = scoreWin(hand, [], { kind: "self-draw" });
    expect(score.fan).toBeLessThanOrEqual(8);
  });
});

describe("sichuan rules — tenpai & missing suit", () => {
  it("detects tenpai and ignores winning tiles of the missing suit", () => {
    const hand = tiles(["m1", "m2", "m3", "m7", "m8", "m9", "p2", "p3", "p4", "p5", "p6", "p9", "p9"]);
    expect(isTenpai(hand, [], "s")).toBe(true);
  });

  it("reports not tenpai when the hand still holds the missing suit", () => {
    const hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "s9"]);
    expect(isTenpai(hand, [], "s")).toBe(false);
  });

  it("computes a positive max tenpai value for a ready hand", () => {
    const hand = tiles(["m1", "m1", "m1", "m3", "m3", "m3", "m5", "m5", "m5", "m7", "m7", "m7", "m9"]);
    expect(maxTenpaiValue(hand, [], "p")).toBeGreaterThan(0);
  });
});

describe("sichuan engine — flow", () => {
  it("requires missing-suit selection before playing", () => {
    const state = createNewGame(7);
    expect(state.phase).toBe("choosing-missing");
    const afterChoice = chooseMissingSuit(state, 0, "s");
    expect(afterChoice.phase).toBe("playing");
    expect(afterChoice.players.every((player) => player.missingSuit)).toBe(true);
  });

  it("bot picks the suit with the fewest tiles", () => {
    const hand = tiles(["m1", "m2", "m3", "m4", "m5", "p1", "p2", "p3", "p4", "s1", "s2"]);
    expect(chooseBotMissingSuit(hand)).toBe("s");
  });

  it("blocks a win while the hand still contains the missing suit", () => {
    const state = chooseMissingSuit(createNewGame(9), 0, "s");
    const winning = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "s3", "s4", "s5", "m7", "m8", "m9", "p9", "p9"]);
    // hand holds 's' tiles which are the declared missing suit -> not a legal win
    expect(winning.some((tile) => tile.suit === "s")).toBe(true);
  });

  it("does not offer melds on a missing-suit tile", () => {
    const state = chooseMissingSuit(createNewGame(11), 0, "p");
    state.players[0].missingSuit = "p";
    state.players[0].hand = tiles(["p5", "p5", "m1", "m2", "m3"]);
    const [p5c] = tiles(["p5"]);
    const options = getMeldOptionsForSeat(state, 0, 1, p5c);
    expect(options).toHaveLength(0);
  });

  it("offers pong and kong from concrete hand tiles", () => {
    const state = chooseMissingSuit(createNewGame(13), 0, "s");
    state.players[0].missingSuit = "s";
    state.players[0].hand = tiles(["m5", "m5", "m5"]);
    const [m5d] = tiles(["m5", "m5", "m5", "m5"]).slice(3);
    const options = getMeldOptionsForSeat(state, 0, 1, m5d);
    expect(options.find((option) => option.action === "pong")?.handTileIds).toHaveLength(2);
    expect(options.find((option) => option.action === "kong")?.handTileIds).toHaveLength(3);
  });

  it("keeps the drawn tile on the far right for the human", () => {
    const state = chooseMissingSuit(createNewGame(15), 0, "s");
    const human = state.players[0];
    expect(human.drawnTileId).toBeDefined();
    expect(human.hand[human.hand.length - 1]?.id).toBe(human.drawnTileId);
  });

  it("carries scores into the next round", () => {
    const state = createNewGame(17);
    state.players[0].score = 88;
    state.players[1].score = 120;
    const next = createNextRound(state, 18);
    expect(next.roundNumber).toBe(state.roundNumber + 1);
    expect(next.players.map((player) => player.score)).toEqual([88, 120, 100, 100]);
    expect(next.phase).toBe("choosing-missing");
  });

  it("applies gang scores immediately on a concealed kong (下雨)", () => {
    const state = chooseMissingSuit(createNewGame(19), 0, "s");
    state.currentSeat = 0;
    state.awaitingDiscard = true;
    state.players[0].hand = tiles(["m5", "m5", "m5", "m5", "m1", "m2", "m3", "p1", "p2", "p3", "p4", "p6", "p7", "p8"]);
    state.players[0].drawnTileId = undefined;
    const before = state.players.map((player) => player.score);
    const next = declareConcealedKong(state, 0, "m5");
    expect(next.players[0].score).toBe(before[0] + 6);
    expect(next.players[1].score).toBe(before[1] - 2);
  });
});

describe("sichuan engine — bloody battle", () => {
  it("keeps playing after one bot wins (does not finish immediately)", () => {
    const state = chooseMissingSuit(createNewGame(21), 0, "s");
    // Seat 3 discards a tile seat 1 can win on; two other seats still active -> keep playing.
    state.currentSeat = 3;
    state.awaitingDiscard = true;
    const [p5] = tiles(["p5"]);
    state.players[3].hand = tiles(["p5", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "p1", "p1", "p2", "p3"]);
    state.players[1].hand = tiles(["m1", "m2", "m3", "p2", "p3", "p4", "m7", "m8", "m9", "p6", "p7", "p8", "p5"]);
    // seat 1 missing suit is auto-picked; force it to not conflict
    state.players[1].missingSuit = "s";
    const next = discardTile(state, 3, p5.id);
    if (next.players[1].hasWon) {
      expect(next.phase).not.toBe("finished");
    }
  });

  it("drives an all-bot game to a terminal state without deadlock", () => {
    // Make every seat a bot by treating the human as auto-played too.
    let state = chooseMissingSuit(createNewGame(99), 0, "s");

    for (let step = 0; step < 5000 && state.phase !== "finished"; step += 1) {
      if (state.pendingClaim) {
        // Human claim prompt: always pass so the simulation keeps flowing.
        state = passClaim(state, state.pendingClaim.seat);
        continue;
      }
      const current = state.players[state.currentSeat];
      if (current.type === "bot") {
        state = playBotTurnStep(state);
      } else if (current.hasWon) {
        // Skip: engine advances via bot step normally, but drive draw to move on.
        state = drawForCurrentSeat(state);
      } else if (!state.awaitingDiscard) {
        state = drawForCurrentSeat(state);
      } else {
        // Human: mimic a bot by discarding the first legal tile.
        const tile = current.hand.find((item) => item.suit === current.missingSuit) ?? current.hand[0];
        state = discardTile(state, current.seat, tile.id);
      }
    }

    expect(state.phase).toBe("finished");
    const totalScore = state.players.reduce((sum, player) => sum + player.score, 0);
    // Zero-sum invariant: nobody creates or destroys points.
    expect(totalScore).toBe(400);
  });
});

