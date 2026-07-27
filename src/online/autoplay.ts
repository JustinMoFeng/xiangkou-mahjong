import { drawForCurrentSeat, playBotTurnStep } from "../game/engine";
import type { GameState } from "../game/types";
import {
  drawForCurrentSeat as sichuanDrawForCurrentSeat,
  playBotTurnStep as sichuanPlayBotTurnStep,
} from "../sichuan/engine";
import type { GameState as SichuanGameState } from "../sichuan/types";

/**
 * A single automatic advance of the authoritative game loop.
 *
 * `delayMs` mirrors the pacing the browser used in App.tsx so the server
 * feels identical: it is the time to wait *before* committing `state`.
 */
export type AutoplayStep<TState = GameState> = {
  state: TState;
  delayMs: number;
};

// Pacing constants extracted verbatim from the three setTimeout effects in
// src/App.tsx so the Durable Object drives bots/draws at the same rhythm.
const BOT_DRAW_DELAY_MS = 950;
const BOT_DISCARD_DELAY_MS = 1350;
const AUTO_DRAW_DELAY_MS = 650;

/**
 * Compute the next automatic step of the game, or `null` when the loop must
 * pause and wait for an interactive (human/remote) player to act.
 *
 * The engine already auto-resolves bot melds/wins inside `resolveDiscard`, and
 * only sets `pendingClaim` for non-bot seats. So whenever `pendingClaim` is
 * present we must wait for that client. Otherwise:
 *  - a bot seat is stepped via `playBotTurnStep` (draw or discard);
 *  - a non-bot seat that still needs a tile is auto-drawn, then we wait for the
 *    client to discard/claim.
 */
export function nextAutoplayStep(state: GameState): AutoplayStep<GameState> | null {
  if (state.phase !== "playing" || state.pendingClaim) {
    return null;
  }

  const player = state.players[state.currentSeat];
  const needsDraw = player.hand.length % 3 === 1;

  if (player.type === "bot") {
    return {
      state: playBotTurnStep(state),
      delayMs: needsDraw ? BOT_DRAW_DELAY_MS : BOT_DISCARD_DELAY_MS,
    };
  }

  if (needsDraw) {
    return {
      state: drawForCurrentSeat(state),
      delayMs: AUTO_DRAW_DELAY_MS,
    };
  }

  return null;
}

// Sichuan pacing, extracted from the setTimeout effects in src/sichuan/SichuanApp.tsx.
const SICHUAN_BOT_DRAW_DELAY_MS = 850;
const SICHUAN_BOT_DISCARD_DELAY_MS = 1150;
const SICHUAN_AUTO_DRAW_DELAY_MS = 550;

/**
 * Sichuan (血战到底) autoplay step. Differences from Xiangkou:
 *  - draw vs discard is tracked by `awaitingDiscard`, not hand length;
 *  - a seat that has already won (`hasWon`) is skipped forward, since play
 *    continues until the round ends;
 *  - the "choosing-missing" phase is fully action-driven (bots auto-pick their
 *    missing suit inside `chooseMissingSuit` when any player chooses), so this
 *    loop only advances the "playing" phase.
 */
export function nextSichuanAutoplayStep(state: SichuanGameState): AutoplayStep<SichuanGameState> | null {
  if (state.phase !== "playing" || state.pendingClaim) {
    return null;
  }

  const player = state.players[state.currentSeat];

  if (player.hasWon) {
    // The engine advances past a finished seat via draw/bot step.
    return {
      state: player.type === "bot" ? sichuanPlayBotTurnStep(state) : sichuanDrawForCurrentSeat(state),
      delayMs: SICHUAN_AUTO_DRAW_DELAY_MS,
    };
  }

  if (player.type === "bot") {
    return {
      state: sichuanPlayBotTurnStep(state),
      delayMs: state.awaitingDiscard ? SICHUAN_BOT_DISCARD_DELAY_MS : SICHUAN_BOT_DRAW_DELAY_MS,
    };
  }

  if (!state.awaitingDiscard) {
    return {
      state: sichuanDrawForCurrentSeat(state),
      delayMs: SICHUAN_AUTO_DRAW_DELAY_MS,
    };
  }

  return null;
}
