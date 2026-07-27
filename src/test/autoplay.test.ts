import { describe, expect, it } from "vitest";
import { createNewGame } from "../game/engine";
import type { GameState, Seat, SeatType } from "../game/types";
import { nextAutoplayStep, nextSichuanAutoplayStep } from "../online/autoplay";
import { createNewGame as createSichuanGame, chooseMissingSuit } from "../sichuan/engine";
import type { GameState as SichuanState } from "../sichuan/types";

function newRoomGame(seatTypes: Partial<Record<Seat, SeatType>>): GameState {
  const state = createNewGame(20260727, undefined, 1, ["房主", "东东", "西西", "北北"], seatTypes);
  state.roomId = "123456";
  return state;
}

describe("autoplay loop", () => {
  it("pauses while it is a human/remote seat's turn to discard", () => {
    // Seat 0 is the dealer holding 14 tiles (needs to discard, not draw).
    const state = newRoomGame({ 0: "human", 1: "remote", 2: "bot", 3: "bot" });
    expect(state.currentSeat).toBe<Seat>(0);
    expect(state.players[0].hand.length % 3).toBe(2);
    expect(nextAutoplayStep(state)).toBeNull();
  });

  it("auto-draws for a remote seat that still needs a tile", () => {
    const state = newRoomGame({ 0: "human", 1: "remote", 2: "bot", 3: "bot" });
    state.currentSeat = 1; // remote seat starts with 13 tiles → needs a draw
    expect(state.players[1].hand.length % 3).toBe(1);

    const step = nextAutoplayStep(state);
    expect(step).not.toBeNull();
    expect(step!.state.players[1].hand.length % 3).toBe(2);
    // After drawing, the remote client must act, so the loop stops.
    expect(nextAutoplayStep(step!.state)).toBeNull();
  });

  it("steps a bot seat forward (draw then discard)", () => {
    const state = newRoomGame({ 0: "human", 1: "bot", 2: "bot", 3: "bot" });
    state.currentSeat = 1;
    const wallBefore = state.wall.length;

    const drawStep = nextAutoplayStep(state);
    expect(drawStep).not.toBeNull();
    expect(drawStep!.state.wall.length).toBe(wallBefore - 1);
    expect(drawStep!.state.players[1].hand.length % 3).toBe(2);

    const discardStep = nextAutoplayStep(drawStep!.state);
    expect(discardStep).not.toBeNull();
    // Bot acted → state advanced. (The discarded tile may be immediately
    // claimed by another bot, so we assert progress rather than a discard count.)
    expect(discardStep!.state).not.toBe(drawStep!.state);
    expect(drawStep!.state.players[1].hand.length % 3).toBe(2);
  });

  it("pauses when a pending claim awaits an interactive seat", () => {
    const state = newRoomGame({ 0: "human", 1: "remote", 2: "bot", 3: "bot" });
    state.pendingClaim = {
      id: "claim-x",
      from: 2,
      tile: state.players[2].hand[0],
      seat: 0,
      options: [],
    };
    expect(nextAutoplayStep(state)).toBeNull();
  });

  it("does nothing once the game is finished", () => {
    const state = newRoomGame({ 0: "human", 1: "bot", 2: "bot", 3: "bot" });
    state.phase = "finished";
    expect(nextAutoplayStep(state)).toBeNull();
  });
});

function newSichuanRoomGame(seatTypes: Partial<Record<Seat, SeatType>>): SichuanState {
  const state = createSichuanGame(20260727, undefined, 1, ["房主", "阿蜀", "幺鸡", "老川"], seatTypes);
  state.roomId = "123456";
  return state;
}

describe("sichuan autoplay loop", () => {
  it("waits during the choosing-missing phase (action-driven)", () => {
    const state = newSichuanRoomGame({ 0: "human", 1: "remote", 2: "bot", 3: "bot" });
    expect(state.phase).toBe("choosing-missing");
    expect(nextSichuanAutoplayStep(state)).toBeNull();
  });

  it("steps a bot seat once play has started", () => {
    // Host + 3 bots: once the host picks a missing suit, bots auto-pick and play begins.
    const start = newSichuanRoomGame({ 0: "human", 1: "bot", 2: "bot", 3: "bot" });
    const playing = chooseMissingSuit(start, 0, "s");
    expect(playing.phase).toBe("playing");
    expect(playing.currentSeat).toBe(playing.dealerSeat);

    // Dealer (seat 0, human) must discard first → loop waits.
    expect(nextSichuanAutoplayStep(playing)).toBeNull();

    // Move the turn to a bot seat that needs to draw.
    const botTurn: SichuanState = { ...playing, currentSeat: 1, awaitingDiscard: false };
    const step = nextSichuanAutoplayStep(botTurn);
    expect(step).not.toBeNull();
    expect(step!.state).not.toBe(botTurn);
  });

  it("pauses when a pending claim awaits a seat", () => {
    const start = newSichuanRoomGame({ 0: "human", 1: "remote", 2: "bot", 3: "bot" });
    const playing = chooseMissingSuit(start, 0, "s");
    const withClaim: SichuanState = {
      ...playing,
      pendingClaim: { id: "c", from: 2, tile: playing.players[2].hand[0], seat: 0, options: [] },
    };
    expect(nextSichuanAutoplayStep(withClaim)).toBeNull();
  });
});
