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
  createYangGameForLevel,
  getYangOpeningClearPlan,
  createYangStateForTest,
  isYangTileBlocked,
  selectYangTile,
  undoYangMove,
  type YangTile,
} from "../yangyang/engine";
import { getYangLevelPreset, YANG_LEVEL_PRESETS } from "../yangyang/levels";
import {
  canLineExit,
  clearLine,
  createParkingGame,
  getExitReadyLineIds,
  lineCells,
  revealParkingHint,
} from "../parking/engine";
import { createLineLevel, LINE_LEVEL_PRESETS, LINE_LEVELS } from "../parking/levels";

function linkTile(id: string, code: CasualTileCode, row: number, col: number, removed = false): LinkTile {
  return { id, code, row, col, removed };
}

function yangTile(
  id: string,
  code: CasualTileCode,
  x: number,
  y: number,
  layer: number,
  removed = false,
  zone: YangTile["zone"] = "main",
): YangTile {
  return { id, code, x, y, layer, zone, removed };
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
  it("defines difficulty levels with growing tile counts and multiple stack templates", () => {
    const standardLevels = YANG_LEVEL_PRESETS.filter((level) => !level.endless);
    expect(standardLevels.map((level) => level.id)).toEqual(["easy", "normal", "hard", "nightmare", "hell"]);
    expect(standardLevels.map((level) => level.difficulty)).toEqual(["简单", "中等", "困难", "噩梦", "地狱"]);
    expect(standardLevels.map((level) => level.tileCount)).toEqual([36, 54, 72, 90, 108]);
    expect(standardLevels.map((level) => level.maxLayer)).toEqual([2, 3, 4, 5, 6]);
    expect(new Set(standardLevels.flatMap((level) => level.layoutKinds))).toEqual(
      new Set(["castle", "pyramid", "twin-towers", "corridor"]),
    );
  });

  it("blocks a lower tile while an upper tile overlaps it, then unlocks it after removal", () => {
    const lower = yangTile("low", "m1", 12, 12, 0);
    const upper = yangTile("up", "m2", 15, 15, 1);
    const state = createYangStateForTest([lower, upper]);

    expect(isYangTileBlocked(state.tiles, "low")).toBe(true);
    const afterUpper = selectYangTile(state, "up", 10);
    expect(isYangTileBlocked(afterUpper.tiles, "low")).toBe(false);
  });

  it("keeps the central castle and bottom support piles independent", () => {
    const main = yangTile("main", "m1", 0, 0, 0, false, "main");
    const support = yangTile("support", "m2", 0, 0, 8, false, "support-left");
    const state = createYangStateForTest([main, support]);

    expect(isYangTileBlocked(state.tiles, "main")).toBe(false);
    expect(isYangTileBlocked(state.tiles, "support")).toBe(false);
  });

  it("keeps same-layer preset tiles on separate full-tile slots", () => {
    const state = createYangGame(7, 0);
    const sameLayerPairs = state.tiles.flatMap((tile, index) =>
      state.tiles
        .slice(index + 1)
        .filter((other) => other.zone === tile.zone && other.layer === tile.layer)
        .map((other) => [tile, other] as const),
    );

    expect(sameLayerPairs.every(([first, second]) => Math.abs(first.x - second.x) >= 6 || Math.abs(first.y - second.y) >= 6)).toBe(true);
  });

  it("keeps the two folded bottom stacks below and separate from the center pile", () => {
    const state = createYangGameForLevel(10, 0, getYangLevelPreset("easy"));
    const centerTiles = state.tiles.filter((tile) => tile.zone === "main");
    const leftSupportTiles = state.tiles.filter((tile) => tile.zone === "support-left");
    const rightSupportTiles = state.tiles.filter((tile) => tile.zone === "support-right");

    expect(["castle", "pyramid", "twin-towers", "corridor"]).toContain(state.layoutKind);
    expect(centerTiles.length).toBeGreaterThan(0);
    expect(leftSupportTiles.length).toBeGreaterThanOrEqual(6);
    expect(Math.abs(rightSupportTiles.length - leftSupportTiles.length)).toBeLessThanOrEqual(1);
    expect(centerTiles.every((tile) => tile.zone === "main")).toBe(true);
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

  it("creates the default simple level in complete triples", () => {
    const state = createYangGame(7, 0);
    const counts = new Map<CasualTileCode, number>();
    for (const tile of state.tiles) {
      counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
    }

    expect(state.tiles).toHaveLength(27);
    expect([...counts.values()].sort()).toEqual(Array.from({ length: 9 }, () => 3));
  });

  it("creates a first level with at least one complete winning branch", () => {
    let state = createYangGameForLevel(7, 0, getYangLevelPreset("hell"));

    for (const group of getYangOpeningClearPlan(getYangLevelPreset("hell"), 7)) {
      expect(group.every((index) => !isYangTileBlocked(state.tiles, state.tiles[index].id))).toBe(true);
      state = group.reduce((current, index) => selectYangTile(current, current.tiles[index].id, 10), state);
    }

    expect(state.status).toBe("won");
    expect(state.slots).toHaveLength(0);
    expect(state.tiles.every((tile) => tile.removed)).toBe(true);
  });

  it("keeps all difficulty presets solvable", () => {
    for (const level of YANG_LEVEL_PRESETS.filter((preset) => !preset.endless)) {
      let state = createYangGameForLevel(17, 0, level);
      for (const group of getYangOpeningClearPlan(level, 17)) {
        expect(group.every((index) => !isYangTileBlocked(state.tiles, state.tiles[index].id)), level.id).toBe(true);
        state = group.reduce((current, index) => selectYangTile(current, current.tiles[index].id, 10), state);
      }
      expect(state.status, level.id).toBe("won");
    }
  });

  it("randomizes internal layouts across seeds for the same difficulty", () => {
    const layouts = new Set(
      Array.from({ length: 8 }).map((_, index) =>
        createYangGameForLevel(30 + index, 0, getYangLevelPreset("normal")).layoutKind,
      ),
    );

    expect(layouts.size).toBeGreaterThan(1);
  });
});

describe("line clearing puzzle engine", () => {
  function levelSignature(level: (typeof LINE_LEVELS)[number]): string {
    return level.lines
      .map((line) => `${line.direction}:${line.points.map((point) => `${point.row},${point.col}`).join("|")}`)
      .join(";");
  }

  function expectValidLineLevel(level: (typeof LINE_LEVELS)[number]) {
    const occupied = new Map<string, string>();
    const playable = new Set((level.cells ?? []).map((point) => `${point.row}:${point.col}`));
    const expectedCells = level.cells?.length ?? level.rows * level.columns;

    for (const line of level.lines) {
      expect(line.points.length, `${level.id}/${line.id} should not be a 1-cell line`).toBeGreaterThanOrEqual(2);
      const head = line.points[0];
      const firstBody = line.points[1];
      const firstSegment = {
        row: head.row - firstBody.row,
        col: head.col - firstBody.col,
      };
      const expectedFirstSegment =
        line.direction === "up"
          ? { row: -1, col: 0 }
          : line.direction === "right"
            ? { row: 0, col: 1 }
            : line.direction === "down"
              ? { row: 1, col: 0 }
              : { row: 0, col: -1 };

      expect(firstSegment, `${level.id}/${line.id} must point straight out from its arrow cell`).toEqual(expectedFirstSegment);

      for (let index = 1; index < line.points.length; index += 1) {
        const previous = line.points[index - 1];
        const current = line.points[index];
        const distance = Math.abs(previous.row - current.row) + Math.abs(previous.col - current.col);

        expect(distance, `${level.id}/${line.id} gap between ${index - 1} and ${index}`).toBe(1);
      }

      for (const point of line.points) {
        const key = `${point.row}:${point.col}`;
        if (level.cells) {
          expect(playable.has(key), `${level.id} ${line.id} uses non-playable cell ${key}`).toBe(true);
        }
        expect(occupied.has(key), `${level.id} ${line.id} overlaps ${occupied.get(key)} at ${key}`).toBe(false);
        occupied.set(key, line.id);
      }
    }

    expect(occupied.size, level.id).toBe(expectedCells);
  }

  function expectSolvableLineLevel(level: (typeof LINE_LEVELS)[number]) {
    let state = createParkingGame(level, 1);

    for (let step = 0; step < level.lines.length && state.status !== "won"; step += 1) {
      const ready = getExitReadyLineIds(state);
      expect(ready.length, `${level.id} seed ${level.seed} has no available line at step ${step}`).toBeGreaterThan(0);
      state = clearLine(state, ready[0], step + 2);
    }

    expect(state.status, `${level.id} seed ${level.seed}`).toBe("won");
  }

  it("does not overlap line nodes within a level", () => {
    for (const level of LINE_LEVELS) {
      expectValidLineLevel(level);
    }
  });

  it("covers every authored board point with exactly one line", () => {
    for (const level of LINE_LEVELS) {
      const occupied = new Set<string>();
      for (const line of level.lines) {
        const state = createParkingGame(level, 1);
        const activeLine = state.lines.find((item) => item.id === line.id)!;
        expect(lineCells(activeLine)).toEqual(line.points);

        for (const point of line.points) {
          occupied.add(`${point.row}:${point.col}`);
        }
      }

      expect(occupied.size, level.id).toBe(level.cells?.length ?? level.rows * level.columns);
    }
  });

  it("keeps every authored line point connected to the next point", () => {
    for (const level of LINE_LEVELS) {
      for (const line of level.lines) {
        for (let index = 1; index < line.points.length; index += 1) {
          const previous = line.points[index - 1];
          const current = line.points[index];
          const distance = Math.abs(previous.row - current.row) + Math.abs(previous.col - current.col);

          expect(distance, `${level.id}/${line.id} gap between ${index - 1} and ${index}`).toBe(1);
        }
      }
    }
  });

  it("allows only lines with a clear head path to exit", () => {
    const state = createParkingGame(LINE_LEVELS[0], 1);
    const ready = getExitReadyLineIds(state);

    expect(ready.length).toBeGreaterThan(0);
    expect(ready.every((id) => canLineExit(state, id))).toBe(true);
  });

  it("marks a blocked line without increasing moves", () => {
    const state = createParkingGame(
      {
        id: "blocked-test",
        name: "阻挡测试",
        rows: 5,
        columns: 5,
        lines: [
          {
            id: "a",
            label: "A",
            points: [
              { row: 2, col: 2 },
              { row: 2, col: 1 },
            ],
            direction: "right",
            color: "jade",
          },
          {
            id: "b",
            label: "B",
            points: [{ row: 2, col: 3 }],
            direction: "up",
            color: "gold",
          },
        ],
      },
      1,
    );
    const next = clearLine(state, "a", 2);

    expect(next.moves).toBe(0);
    expect(next.blockedId).toBe("a");
    expect(next.lines.find((line) => line.id === "a")?.exited).toBe(false);
  });

  it("clears a ready line and increments progress", () => {
    const state = createParkingGame(LINE_LEVELS[0], 1);
    const readyId = getExitReadyLineIds(state)[0];
    const next = clearLine(state, readyId, 2);

    expect(next.moves).toBe(1);
    expect(next.exitedCount).toBe(1);
    expect(next.lines.find((line) => line.id === readyId)?.exited).toBe(true);
  });

  it("reveals a ready hint and consumes limited hint counts", () => {
    const state = createParkingGame(LINE_LEVELS[0], 1);
    const ready = getExitReadyLineIds(state);
    const hinted = revealParkingHint(state);

    expect(state.hintsRemaining).toBe(3);
    expect(hinted.hintsRemaining).toBe(2);
    expect(hinted.hintIds).toHaveLength(1);
    expect(ready).toContain(hinted.hintIds[0]);

    const cleared = clearLine(hinted, hinted.hintIds[0], 3);
    expect(cleared.hintIds).toEqual([]);

    const emptyHints = { ...state, hintsRemaining: 0 };
    expect(revealParkingHint(emptyHints)).toBe(emptyHints);
  });

  it("uses varied line lengths without single-cell fragments", () => {
    const sampleSeeds = [11, 1701, 20260728, 4103007, 7309009];

    for (const preset of LINE_LEVEL_PRESETS.filter((level) => !level.endless)) {
      for (const seed of sampleSeeds) {
        const level = createLineLevel(preset, seed + preset.baseSeed);
        const lengths = level.lines.map((line) => line.points.length);
        const singleCellCount = lengths.filter((length) => length === 1).length;
        const longCount = lengths.filter((length) => length >= Math.max(5, Math.floor(preset.gridSize / 3))).length;

        expect(singleCellCount, `${preset.id} seed ${seed} should not have 1-cell lines`).toBe(0);
        expect(new Set(lengths).size, `${preset.id} seed ${seed} should contain varied line lengths`).toBeGreaterThanOrEqual(5);
        expect(longCount, `${preset.id} seed ${seed} should contain longer lines`).toBeGreaterThan(0);
      }
    }
  });

  it("reduces initial outward-ready lines on higher difficulties", () => {
    const sampleSeeds = [11, 1701, 20260728, 4103007, 7309009];
    const averageReadyRatio = (preset: (typeof LINE_LEVEL_PRESETS)[number]) => {
      const ratios = sampleSeeds.map((seed) => {
        const level = createLineLevel(preset, seed + preset.baseSeed);
        return getExitReadyLineIds(createParkingGame(level, 1)).length / level.lines.length;
      });
      return ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length;
    };

    const easy = averageReadyRatio(LINE_LEVEL_PRESETS[0]);
    const expert = averageReadyRatio(LINE_LEVEL_PRESETS[3]);
    const master = averageReadyRatio(LINE_LEVEL_PRESETS[4]);

    expect(easy).toBeLessThan(0.55);
    expect(expert).toBeLessThan(0.28);
    expect(master).toBeLessThan(0.26);
    expect(master).toBeLessThan(easy);
  });

  it("keeps every authored line level solvable", () => {
    for (const level of LINE_LEVELS) {
      expectSolvableLineLevel(level);
    }
  });

  it("creates reproducible but varied seeded random line levels", () => {
    const preset = LINE_LEVEL_PRESETS[0];
    const first = createLineLevel(preset, 20260728);
    const replay = createLineLevel(preset, 20260728);
    const different = createLineLevel(preset, 20260729);

    expect(levelSignature(first)).toBe(levelSignature(replay));
    expect(levelSignature(first)).not.toBe(levelSignature(different));
    expect(first.cells?.length).toBe(replay.cells?.length);
    expect(first.cells?.length).toBeGreaterThan(0);
  });

  it("offers grid-size based difficulties, random board shapes, and endless mode", () => {
    expect(LINE_LEVEL_PRESETS.map((preset) => preset.difficulty)).toEqual(["简单", "进阶", "困难", "专家", "大师", "无尽"]);
    expect(LINE_LEVEL_PRESETS.map((preset) => preset.gridSize)).toEqual([10, 14, 18, 22, 30, 10]);

    const standardLevels = LINE_LEVEL_PRESETS.filter((preset) => !preset.endless);
    expect(standardLevels.every((preset) => preset.gridSize === createLineLevel(preset, preset.baseSeed).rows)).toBe(true);
    expect(standardLevels.every((preset) => preset.gridSize === createLineLevel(preset, preset.baseSeed).columns)).toBe(true);

    const shapeNames = new Set(Array.from({ length: 36 }, (_, index) => createLineLevel(LINE_LEVEL_PRESETS[4], 9000 + index).shapeName));
    expect(shapeNames.has("回字形")).toBe(true);
    expect(shapeNames.has("自由形")).toBe(false);
    expect(shapeNames.size).toBeGreaterThan(3);

    const endless = LINE_LEVEL_PRESETS.find((preset) => preset.endless)!;
    expect(createLineLevel(endless, 11, 1).rows).toBe(10);
    expect(createLineLevel(endless, 11, 3).rows).toBe(14);
    expect(createLineLevel(endless, 11, 5).rows).toBe(18);
    expect(createLineLevel(endless, 11, 7).rows).toBe(22);
    expect(createLineLevel(endless, 11, 9).rows).toBe(30);
  });

  it("keeps random seeded samples valid and solvable", () => {
    const sampleSeeds = [11, 1701, 20260728, 4103007, 7309009];

    for (const preset of LINE_LEVEL_PRESETS) {
      for (const seed of sampleSeeds) {
        const level = createLineLevel(preset, seed + preset.baseSeed);
        expectValidLineLevel(level);
        expectSolvableLineLevel(level);
      }
    }
  });
});
