import { describe, expect, it } from "vitest";
import type { CasualTileCode } from "../casual/tiles";
import {
  createLinkGame,
  findAnyLink,
  findLinkPath,
  selectLinkTile,
  shuffleRemainingLinkTiles,
  type LinkGameState,
  type LinkTile,
} from "../link-match/engine";
import { createLinkLevelCells, getLinkLevelPreset, LINK_LEVEL_PRESETS } from "../link-match/levels";
import { LINK_TILE_CODES } from "../link-match/patterns";
import {
  createYangGame,
  createYangStateForTest,
  isYangTileBlocked,
  selectYangTile,
  undoYangMove,
  type YangTile,
} from "../yangyang/engine";

function linkTile(id: string, code: CasualTileCode, row: number, col: number, removed = false): LinkTile {
  return { id, code, row, col, removed };
}

function yangTile(id: string, code: CasualTileCode, x: number, y: number, layer: number, removed = false): YangTile {
  return { id, code, x, y, layer, removed };
}

describe("mahjong link match rules", () => {
  it("defines five level presets with even playable cells", () => {
    expect(LINK_LEVEL_PRESETS).toHaveLength(6);
    expect(LINK_LEVEL_PRESETS.map((level) => level.id)).toEqual(["wall", "courtyard", "diamond", "stairs", "expert", "endless"]);
    expect(LINK_LEVEL_PRESETS.every((level) => createLinkLevelCells(level, 7).cells.length % 2 === 0)).toBe(true);
    expect(
      LINK_LEVEL_PRESETS.every((level) =>
        createLinkLevelCells(level, 7).cells.every(
          (cell) => cell.row >= 0 && cell.row < level.rows && cell.col >= 0 && cell.col < level.columns,
        ),
      ),
    ).toBe(true);
  });

  it("uses a visually mixed link tile palette for early difficulties", () => {
    expect(LINK_TILE_CODES.slice(0, 8)).toEqual(["m1", "p5", "s1", "east", "red", "green", "m9", "p1"]);
    expect(new Set(LINK_TILE_CODES.slice(0, 8).map((code) => code[0]))).toHaveLength(6);
  });

  it("creates a shaped level from preset cells instead of a full rectangle", () => {
    const level = getLinkLevelPreset("courtyard");
    const state = createLinkGame(17, 0, level);

    expect(state.columns).toBe(8);
    expect(state.rows).toBe(8);
    expect(state.tiles.length % 2).toBe(0);
    expect(state.tiles.length).toBeLessThanOrEqual(64);
    expect(new Set(state.tiles.map((tile) => tile.code)).size).toBeLessThanOrEqual(8);
    expect(state.pairCount).toBe(state.tiles.length / 2);
    expect(state.timeLimitSeconds).toBe(12 * 60);
    expect(state.hintsRemaining).toBe(5);
    expect(state.shufflesRemaining).toBe(3);
  });

  it("connects matching tiles on a straight line", () => {
    const first = linkTile("a", "m1", 0, 0);
    const second = linkTile("b", "m1", 0, 3);
    const path = findLinkPath([first, second], first, second);

    expect(path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 3 },
    ]);
  });

  it("connects matching tiles with one turn", () => {
    const first = linkTile("a", "m1", 0, 0);
    const second = linkTile("b", "m1", 2, 2);
    const blockers = [linkTile("x", "p1", 0, 1), linkTile("y", "p2", 1, 0)];
    const path = findLinkPath([first, second, ...blockers], first, second);

    expect(path).toEqual([
      { row: 0, col: 0 },
      { row: -1, col: 0 },
      { row: -1, col: 2 },
      { row: 2, col: 2 },
    ]);
  });

  it("connects matching tiles with two turns", () => {
    const first = linkTile("a", "m1", 1, 1);
    const second = linkTile("b", "m1", 3, 3);
    const blockers = [linkTile("x", "p1", 1, 2), linkTile("y", "p2", 2, 1)];
    const path = findLinkPath([first, second, ...blockers], first, second);

    expect(path).toEqual([
      { row: 1, col: 1 },
      { row: 0, col: 1 },
      { row: 0, col: 3 },
      { row: 3, col: 3 },
    ]);
  });

  it("rejects a connection that needs three turns", () => {
    const first = linkTile("a", "m1", 1, 1);
    const second = linkTile("b", "m1", 3, 3);
    const blockers = [
      linkTile("c1", "p1", 1, 2),
      linkTile("c2", "p2", 2, 1),
      linkTile("c3", "p3", 0, 1),
      linkTile("c4", "p4", 0, 3),
      linkTile("c5", "p5", 3, 0),
      linkTile("c6", "p6", 3, 2),
      linkTile("c7", "p7", 2, 3),
      linkTile("c8", "p8", 4, 1),
      linkTile("c9", "p9", 4, 3),
    ];

    expect(findLinkPath([first, second, ...blockers], first, second, 5, 5)).toBeUndefined();
  });

  it("rejects a blocked straight path", () => {
    const first = linkTile("a", "m1", 1, 1);
    const second = linkTile("b", "m1", 1, 3);
    const blockers = [
      linkTile("x1", "p1", 1, 2),
      linkTile("x2", "p2", 0, 1),
      linkTile("x3", "p3", 0, 3),
      linkTile("x4", "p4", 2, 1),
      linkTile("x5", "p5", 2, 3),
    ];

    expect(findLinkPath([first, second, ...blockers], first, second, 4, 5)).toBeUndefined();
  });

  it("uses the outer ring as a walkable path", () => {
    const first = linkTile("a", "m1", 0, 0);
    const second = linkTile("b", "m1", 0, 2);
    const blocker = linkTile("x", "p1", 0, 1);
    const path = findLinkPath([first, second, blocker], first, second);

    expect(path).toEqual([
      { row: 0, col: 0 },
      { row: -1, col: 0 },
      { row: -1, col: 2 },
      { row: 0, col: 2 },
    ]);
  });

  it("removes a valid matching pair and ignores non-matching pairs", () => {
    const state = createLinkGame(3, 0);
    const first = state.tiles.find((tile) => tile.code === "m1")!;
    const second = state.tiles.find((tile) => tile.code !== first.code)!;
    const mismatch = selectLinkTile(selectLinkTile(state, first.id, 10), second.id, 10);

    expect(mismatch.removedPairs).toBe(0);
    expect(mismatch.selectedId).toBe(second.id);

    const hint = findAnyLink(state.tiles)!;
    const matched = selectLinkTile(selectLinkTile(state, hint.firstId, 20), hint.secondId, 20);

    expect(matched.removedPairs).toBe(1);
    expect(matched.tiles.filter((tile) => tile.removed)).toHaveLength(2);
    expect(matched.lastPath.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the remaining tile multiset after shuffle and preserves a solution", () => {
    const state = createLinkGame(5, 0);
    const hint = findAnyLink(state.tiles)!;
    const afterMatch = selectLinkTile(selectLinkTile(state, hint.firstId, 20), hint.secondId, 20);
    const beforeCodes = afterMatch.tiles
      .filter((tile) => !tile.removed)
      .map((tile) => tile.code)
      .sort();
    const shuffled = shuffleRemainingLinkTiles(afterMatch, 99);
    const afterCodes = shuffled.tiles
      .filter((tile) => !tile.removed)
      .map((tile) => tile.code)
      .sort();

    expect(afterCodes).toEqual(beforeCodes);
    expect(findAnyLink(shuffled.tiles)).toBeDefined();
  });

  it("auto-shuffles after a successful match when the remaining board has no links", () => {
    const state: LinkGameState = {
      ...createLinkGame(1, 0),
      rows: 4,
      columns: 5,
      cells: [
        { row: 3, col: 0 },
        { row: 3, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 3 },
      ],
      pairCount: 2,
      tiles: [
        linkTile("match-a", "m1", 3, 0),
        linkTile("match-b", "m1", 3, 1),
        linkTile("left", "p1", 1, 1),
        linkTile("right", "p1", 1, 3),
        linkTile("block-mid", "s1", 1, 2),
        linkTile("block-top-left", "s2", 0, 1),
        linkTile("block-top-right", "s3", 0, 3),
        linkTile("block-bottom-left", "s4", 2, 1),
        linkTile("block-bottom-right", "s5", 2, 3),
      ],
      removedPairs: 0,
      shuffleCount: 0,
    };
    const remainingBefore = state.tiles
      .filter((tile) => tile.id !== "match-a" && tile.id !== "match-b")
      .map((tile) => tile.code)
      .sort();

    const after = selectLinkTile(selectLinkTile(state, "match-a", 10), "match-b", 11, 99);

    expect(after.removedPairs).toBe(1);
    expect(after.shuffleCount).toBe(1);
    expect(after.tiles.filter((tile) => !tile.removed).map((tile) => tile.code).sort()).toEqual(remainingBefore);
    expect(findAnyLink(after.tiles, after.rows, after.columns)).toBeDefined();
  });
});

describe("mahjong yangyang rules", () => {
  it("blocks a lower tile while an upper tile overlaps it, then unlocks it after removal", () => {
    const lower = yangTile("low", "m1", 1, 1, 0);
    const upper = yangTile("up", "m2", 1.2, 1.2, 1);
    const state = createYangStateForTest([lower, upper]);

    expect(isYangTileBlocked(state.tiles, "low")).toBe(true);
    const afterUpper = selectYangTile(state, "up", 10);
    expect(isYangTileBlocked(afterUpper.tiles, "low")).toBe(false);
  });

  it("clears three matching slot tiles", () => {
    const state = createYangStateForTest([
      yangTile("a", "m1", 0, 0, 0),
      yangTile("b", "m1", 2, 0, 0),
      yangTile("c", "m1", 4, 0, 0),
      yangTile("d", "p1", 6, 0, 0),
    ]);
    const after = ["a", "b", "c"].reduce((current, id) => selectYangTile(current, id, 10), state);

    expect(after.slots).toHaveLength(0);
    expect(after.status).toBe("playing");
  });

  it("undoes the previous move including slot and tile state", () => {
    const state = createYangStateForTest([yangTile("a", "m1", 0, 0, 0)]);
    const after = selectYangTile(state, "a", 10);
    const undone = undoYangMove(after);

    expect(undone.tiles[0].removed).toBe(false);
    expect(undone.slots).toHaveLength(0);
    expect(undone.moves).toBe(0);
  });

  it("fails when the slot is full without a triple", () => {
    const state = createYangStateForTest([
      yangTile("a", "m1", 0, 0, 0),
      yangTile("b", "m2", 2, 0, 0),
      yangTile("c", "m3", 4, 0, 0),
      yangTile("d", "m4", 6, 0, 0),
      yangTile("e", "m5", 8, 0, 0),
      yangTile("f", "p1", 10, 0, 0),
      yangTile("g", "p2", 12, 0, 0),
    ]);
    const after = ["a", "b", "c", "d", "e", "f", "g"].reduce((current, id) => selectYangTile(current, id, 10), state);

    expect(after.status).toBe("failed");
    expect(after.slots).toHaveLength(7);
  });

  it("wins when all tiles are cleared by triples", () => {
    const state = createYangStateForTest([
      yangTile("a", "m1", 0, 0, 0),
      yangTile("b", "m1", 2, 0, 0),
      yangTile("c", "m1", 4, 0, 0),
    ]);
    const after = ["a", "b", "c"].reduce((current, id) => selectYangTile(current, id, 10), state);

    expect(after.status).toBe("won");
    expect(after.slots).toHaveLength(0);
  });

  it("creates a fixed first level with fifteen triples", () => {
    const state = createYangGame(7, 0);
    const counts = new Map<CasualTileCode, number>();
    for (const tile of state.tiles) {
      counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
    }

    expect(state.tiles).toHaveLength(45);
    expect([...counts.values()].sort()).toEqual(Array.from({ length: 15 }, () => 3));
  });
});
