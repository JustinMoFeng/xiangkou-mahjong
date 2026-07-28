import { ArrowLeft, ChevronRight, Infinity, Lightbulb, RotateCcw, Route, Trophy } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  clearLine,
  createParkingGame,
  getExitReadyLineIds,
  lineCells,
  revealParkingHint,
  type ParkingGameState,
  type ParkingLine,
} from "./engine";
import {
  createLineLevel,
  getNextParkingLevelPreset,
  getParkingLevelPreset,
  LINE_LEVEL_PRESETS,
  randomLineSeed,
  type LineDirection,
  type LineLayoutKind,
  type LineLevelPreset,
  type LinePoint,
} from "./levels";
import { clearParkingGame, loadParkingBest, loadParkingGame, saveParkingBest, saveParkingGame, type ParkingBest } from "./storage";
import "./parking.css";

const LINE_ARROW_PATH =
  "M 0.36 0 L -0.18 -0.2 L -0.08 -0.065 L -0.34 -0.065 L -0.34 0.065 L -0.08 0.065 L -0.18 0.2 Z";

const LAYOUT_LABELS: Record<LineLayoutKind, string> = {
  square: "方阵",
  diamond: "菱形",
  ring: "回字形",
  cross: "十字",
  stairs: "阶梯",
};

type ExitingLine = {
  id: string;
  line: ParkingLine;
  direction: LineDirection;
  duration: number;
  exitDistance: number;
  routeLength: number;
  progress: number;
  startedAt: number;
};

type SvgCoord = {
  x: number;
  y: number;
};

type RouteNode = SvgCoord & {
  distance: number;
};

function directionLabel(direction: LineDirection): string {
  if (direction === "up") return "上";
  if (direction === "right") return "右";
  if (direction === "down") return "下";
  return "左";
}

function svgPoint(point: LinePoint, rows: number, columns: number): { x: number; y: number } {
  void rows;
  void columns;
  return {
    x: point.col + 0.5,
    y: point.row + 0.5,
  };
}

function continuousLinePath(points: LinePoint[], rows: number, columns: number): string {
  return points
    .map((point, index) => {
      const { x, y } = svgPoint(point, rows, columns);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function arrowAngle(direction: LineDirection): number {
  if (direction === "right") return 0;
  if (direction === "down") return 90;
  if (direction === "left") return 180;
  return -90;
}

function directionVector(direction: LineDirection): SvgCoord {
  if (direction === "left") return { x: -1, y: 0 };
  if (direction === "right") return { x: 1, y: 0 };
  if (direction === "up") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function distanceBetween(start: SvgCoord, end: SvgCoord): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function interpolate(start: RouteNode, end: RouteNode, distance: number): SvgCoord {
  const span = end.distance - start.distance;
  if (span <= 0) return { x: start.x, y: start.y };
  const ratio = (distance - start.distance) / span;
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

function lineRouteLength(points: LinePoint[], rows: number, columns: number): number {
  return points.reduce((length, point, index) => {
    if (index === 0) return 0;
    const previous = svgPoint(points[index - 1], rows, columns);
    const current = svgPoint(point, rows, columns);
    return length + distanceBetween(previous, current);
  }, 0);
}

function lineExitDistance(head: SvgCoord, direction: LineDirection, rows: number, columns: number): number {
  const margin = 1.15;
  if (direction === "left") return head.x + margin;
  if (direction === "right") return columns - head.x + margin;
  if (direction === "up") return head.y + margin;
  return rows - head.y + margin;
}

function createLineRoute(points: LinePoint[], direction: LineDirection, rows: number, columns: number, exitDistance: number): RouteNode[] {
  const head = svgPoint(points[0], rows, columns);
  const exit = directionVector(direction);
  const nodes: RouteNode[] = [
    {
      x: head.x + exit.x * exitDistance,
      y: head.y + exit.y * exitDistance,
      distance: -exitDistance,
    },
    { ...head, distance: 0 },
  ];

  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = svgPoint(points[index], rows, columns);
    distance += distanceBetween(nodes[nodes.length - 1], current);
    nodes.push({ ...current, distance });
  }

  return nodes;
}

function pointAtRouteDistance(route: RouteNode[], distance: number): SvgCoord {
  if (distance <= route[0].distance) return route[0];
  const last = route[route.length - 1];
  if (distance >= last.distance) return last;

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    if (distance <= current.distance) {
      return interpolate(previous, current, distance);
    }
  }

  return last;
}

function pathFromCoords(coords: SvgCoord[]): string {
  return coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${Number(point.x.toFixed(3))} ${Number(point.y.toFixed(3))}`)
    .join(" ");
}

function extractedLineGeometry({
  points,
  direction,
  rows,
  columns,
  progress,
  exitDistance,
  routeLength,
}: {
  points: LinePoint[];
  direction: LineDirection;
  rows: number;
  columns: number;
  progress: number;
  exitDistance: number;
  routeLength: number;
}): { path: string; head: SvgCoord } {
  const route = createLineRoute(points, direction, rows, columns, exitDistance);
  const pullDistance = (routeLength + exitDistance) * progress;
  const startDistance = Math.max(-exitDistance, -pullDistance);
  const endDistance = Math.max(-exitDistance, routeLength - pullDistance);
  const head = pointAtRouteDistance(route, startDistance);

  if (endDistance <= startDistance) {
    return { path: pathFromCoords([head]), head };
  }

  const coords: SvgCoord[] = [head];
  for (const node of route) {
    if (node.distance > startDistance && node.distance < endDistance) {
      coords.push({ x: node.x, y: node.y });
    }
  }
  coords.push(pointAtRouteDistance(route, endDistance));

  return { path: pathFromCoords(coords), head };
}

function lineExitDuration(points: LinePoint[], routeLength: number, exitDistance: number): number {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return 90;

  const travelDistance = routeLength + exitDistance;
  const visibleComplexity = Math.min(points.length, 18);
  return Math.round(760 + travelDistance * 70 + visibleComplexity * 18);
}

type RenderLineProps = {
  line: ParkingLine;
  rows: number;
  columns: number;
  ready: boolean;
  blocked: boolean;
  hinted?: boolean;
  exiting?: ExitingLine;
  interactive?: boolean;
  onPickLine: (line: ParkingLine) => void;
  onLineKeyDown: (event: KeyboardEvent<SVGGElement>, line: ParkingLine) => void;
};

const LineToken = memo(function LineToken({
  line,
  rows,
  columns,
  ready,
  blocked,
  hinted = false,
  exiting,
  interactive = true,
  onPickLine,
  onLineKeyDown,
}: RenderLineProps) {
  const points = lineCells(line);
  if (points.length === 0) return null;
  const isExiting = exiting?.id === line.id;
  const geometry = isExiting
    ? extractedLineGeometry({
        points,
        direction: line.direction,
        rows,
        columns,
        progress: exiting.progress,
        exitDistance: exiting.exitDistance,
        routeLength: exiting.routeLength,
      })
    : {
        path: continuousLinePath(points, rows, columns),
        head: svgPoint(points[0], rows, columns),
      };

  return (
    <g
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-hidden={interactive ? undefined : true}
      aria-label={`${line.label} 号线，箭头向${directionLabel(line.direction)}，${ready ? "可清除" : "被阻挡"}`}
      data-testid="line-token"
      data-ready={ready ? "true" : "false"}
      className={[
        "line-track",
        ready ? "is-ready" : "",
        blocked ? "is-blocked" : "",
        hinted ? "is-hinted" : "",
        isExiting ? `is-exiting is-exiting--${line.direction}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--exit-duration": `${isExiting ? exiting.duration : 0}ms`,
        } as CSSProperties
      }
      onClick={interactive ? () => onPickLine(line) : undefined}
      onKeyDown={interactive ? (event) => onLineKeyDown(event, line) : undefined}
    >
      <path className="line-track__hit" d={geometry.path} />
      <path className="line-track__glow" d={geometry.path} pathLength={1} />
      <path className="line-track__path" d={geometry.path} pathLength={1} />
      <g className="line-track__arrow" transform={`translate(${geometry.head.x} ${geometry.head.y}) rotate(${arrowAngle(line.direction)})`}>
        <path className="line-track__arrow-head" d={LINE_ARROW_PATH} />
      </g>
    </g>
  );
});

function isStateCurrentLevel(state: ParkingGameState): boolean {
  const level = createLineLevel(getParkingLevelPreset(state.levelId), state.seed, state.endlessRound ?? 1);
  return (
    level.id === state.levelId &&
    level.seed === state.seed &&
    level.rows === state.rows &&
    level.columns === state.columns &&
    (level.cells?.length ?? level.rows * level.columns) === (state.cells?.length ?? state.rows * state.columns) &&
    level.lines.length === state.lines.length
  );
}

function boardCells(state: ParkingGameState): LinePoint[] {
  if (state.cells) return state.cells;
  const cells: LinePoint[] = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.columns; col += 1) {
      cells.push({ row, col });
    }
  }
  return cells;
}

type InitialParkingData = {
  state: ParkingGameState;
  selectedLevel?: LineLevelPreset;
};

function createInitialParkingData(): InitialParkingData {
  const saved = loadParkingGame();
  if (saved) {
    return {
      state: {
        ...saved,
        hintIds: saved.hintIds ?? [],
        hintsRemaining: saved.hintsRemaining ?? 3,
      },
      selectedLevel: getParkingLevelPreset(saved.levelId),
    };
  }

  const params = new URLSearchParams(window.location.search);
  const levelParam = params.get("level");
  if (levelParam) {
    const selectedLevel = getParkingLevelPreset(levelParam);
    return {
      state: createParkingGame(createLineLevel(selectedLevel, randomLineSeed(), 1)),
      selectedLevel,
    };
  }

  return {
    state: createParkingGame(createLineLevel(getParkingLevelPreset(undefined), randomLineSeed())),
  };
}

export default function ParkingApp({ onBackHome }: { onBackHome: () => void }) {
  const initialDataRef = useRef<InitialParkingData>();
  if (!initialDataRef.current) {
    initialDataRef.current = createInitialParkingData();
  }
  const [best, setBest] = useState<ParkingBest>(() => loadParkingBest());
  const [state, setState] = useState<ParkingGameState>(() => initialDataRef.current!.state);
  const [selectedLevel, setSelectedLevel] = useState<LineLevelPreset | undefined>(() => initialDataRef.current!.selectedLevel);
  const [exitingLines, setExitingLines] = useState<ExitingLine[]>([]);
  const exitFrameRef = useRef<number>();
  const stateMatchesLevel = isStateCurrentLevel(state);
  const readyIds = useMemo(() => new Set(getExitReadyLineIds(state)), [state]);
  const cells = useMemo(() => boardCells(state), [state]);
  const stateRef = useRef(state);
  const readyIdsRef = useRef(readyIds);
  const exitingLinesRef = useRef(exitingLines);
  const levelIndex = LINE_LEVEL_PRESETS.findIndex((level) => level.id === state.levelId);
  const progressPercent = Math.round((state.exitedCount / state.lines.length) * 100);

  stateRef.current = state;
  readyIdsRef.current = readyIds;
  exitingLinesRef.current = exitingLines;

  function clearExitAnimation() {
    if (exitFrameRef.current !== undefined) {
      window.cancelAnimationFrame(exitFrameRef.current);
      exitFrameRef.current = undefined;
    }
    exitingLinesRef.current = [];
  }

  useEffect(() => {
    if (stateMatchesLevel) return;
    clearExitAnimation();
    clearParkingGame();
    setExitingLines([]);
    setState(createParkingGame(createLineLevel(getParkingLevelPreset(state.levelId), randomLineSeed(), state.endlessRound ?? 1)));
  }, [state.levelId, stateMatchesLevel]);

  useEffect(() => {
    if (!selectedLevel || !stateMatchesLevel) return;
    saveParkingGame(state);
    if (state.status === "won") {
      clearParkingGame();
      setBest(saveParkingBest(state.levelId, state.moves));
    }
  }, [selectedLevel, state, stateMatchesLevel]);

  useEffect(() => {
    if (exitingLines.length === 0) {
      if (exitFrameRef.current !== undefined) {
        window.cancelAnimationFrame(exitFrameRef.current);
        exitFrameRef.current = undefined;
      }
      return undefined;
    }

    const animate = (now: number) => {
      const next = exitingLinesRef.current.flatMap((item) => {
        const rawProgress = Math.min(1, Math.max(0, (now - item.startedAt) / item.duration));
        if (rawProgress >= 1) {
          return [];
        }

        return [
          {
            ...item,
            progress: 1 - (1 - rawProgress) ** 3,
          },
        ];
      });

      exitingLinesRef.current = next;
      setExitingLines(next);

      if (next.length > 0) {
        exitFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      exitFrameRef.current = undefined;
    };

    if (exitFrameRef.current === undefined) {
      exitFrameRef.current = window.requestAnimationFrame(animate);
    }

    return () => {
      if (exitFrameRef.current !== undefined) {
        window.cancelAnimationFrame(exitFrameRef.current);
        exitFrameRef.current = undefined;
      }
    };
  }, [exitingLines.length]);

  useEffect(() => () => clearExitAnimation(), []);

  function restart() {
    clearExitAnimation();
    clearParkingGame();
    setExitingLines([]);
    const preset = getParkingLevelPreset(state.levelId);
    setState(createParkingGame(createLineLevel(preset, randomLineSeed(), state.endlessRound ?? 1)));
  }

  function startLevel(level: LineLevelPreset) {
    clearExitAnimation();
    clearParkingGame();
    setExitingLines([]);
    setSelectedLevel(level);
    window.history.replaceState({}, "", `${window.location.pathname}?level=${level.id}`);
    setState(createParkingGame(createLineLevel(level, randomLineSeed(), 1)));
  }

  function nextLevel() {
    clearExitAnimation();
    clearParkingGame();
    setExitingLines([]);
    const nextPreset = state.endless ? getParkingLevelPreset("endless") : getNextParkingLevelPreset(state.levelId);
    const nextRound = state.endless ? (state.endlessRound ?? 1) + 1 : 1;
    const carry = state.endless ? { hintsRemaining: Math.min(9, state.hintsRemaining + 2) } : undefined;
    setSelectedLevel(nextPreset);
    window.history.replaceState({}, "", `${window.location.pathname}?level=${nextPreset.id}`);
    setState(createParkingGame(createLineLevel(nextPreset, randomLineSeed(), nextRound), Date.now(), carry));
  }

  function backToLevels() {
    clearExitAnimation();
    clearParkingGame();
    setExitingLines([]);
    setSelectedLevel(undefined);
    window.history.replaceState({}, "", window.location.pathname);
  }

  const onPick = useCallback((line: ParkingLine) => {
    if (exitingLinesRef.current.some((item) => item.id === line.id)) return;
    const currentReadyIds = readyIdsRef.current;
    if (!currentReadyIds.has(line.id)) {
      setState((current) => {
        if (current.selectedId === line.id && current.blockedId === line.id) {
          return current;
        }

        return {
          ...current,
          selectedId: line.id,
          blockedId: line.id,
        };
      });
      return;
    }

    const currentState = stateRef.current;
    const points = lineCells(line);
    const head = svgPoint(points[0], currentState.rows, currentState.columns);
    const routeLength = lineRouteLength(points, currentState.rows, currentState.columns);
    const exitDistance = lineExitDistance(head, line.direction, currentState.rows, currentState.columns);
    const duration = lineExitDuration(points, routeLength, exitDistance);
    const nextState = clearLine(currentState, line.id);
    const nextExiting = {
      id: line.id,
      line,
      direction: line.direction,
      duration,
      exitDistance,
      routeLength,
      progress: 0.001,
      startedAt: performance.now(),
    };
    stateRef.current = nextState;
    readyIdsRef.current = new Set(getExitReadyLineIds(nextState));
    setState(nextState);
    const nextExitingLines = [...exitingLinesRef.current, nextExiting];
    exitingLinesRef.current = nextExitingLines;
    setExitingLines(nextExitingLines);
  }, []);

  const onLineKeyDown = useCallback((event: KeyboardEvent<SVGGElement>, line: ParkingLine) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPick(line);
  }, [onPick]);

  function hint() {
    setState((current) => {
      const next = revealParkingHint(current);
      stateRef.current = next;
      if (next !== current) {
        readyIdsRef.current = new Set(getExitReadyLineIds(next));
      }
      return next;
    });
  }

  if (!selectedLevel) {
    return <ParkingLevelSelect onBackHome={onBackHome} onStartLevel={startLevel} />;
  }

  return (
    <main className="parking-shell" aria-label="线阵清场">
      <section className="parking-frame">
        <header className="parking-topbar">
          <button className="parking-back" type="button" onClick={backToLevels} aria-label="返回难度选择">
            <ArrowLeft size={18} />
          </button>
          <div className="parking-title">
            <p>{state.endless ? `无尽第 ${state.endlessRound ?? 1} 盘` : `难度 ${levelIndex + 1}`}</p>
            <h1>线阵清场</h1>
          </div>
          <div className="parking-stats">
            <span>步数 {state.moves}</span>
            <span>
              清除 {state.exitedCount}/{state.lines.length}
            </span>
            <span>提示 {state.hintsRemaining}</span>
            {best[state.levelId] ? <span>最佳 {best[state.levelId]}</span> : null}
          </div>
        </header>

        <section className="parking-play">
          <div className="parking-hud" aria-label="线阵状态">
            <button className="parking-level-change" type="button" onClick={backToLevels}>
              选难度
            </button>
            <p className="parking-level-name">
              {state.levelName}
              <span>#{state.seed.toString(36).toUpperCase()}</span>
            </p>
            <div className="parking-ready-pill">
              <span>{state.difficulty ?? "随机"}</span>
              <strong>{state.shapeName ?? "自由形"}</strong>
            </div>
          </div>

          <section
            className="parking-board"
            style={{ "--rows": state.rows, "--columns": state.columns } as CSSProperties}
            aria-label={`${state.levelName} 线阵面板`}
          >
            <svg
              className="line-layer"
              viewBox={`0 0 ${state.columns} ${state.rows}`}
              preserveAspectRatio="xMidYMid meet"
              aria-label={`${state.levelName} 线阵`}
            >
              <g className="line-grid" aria-hidden="true">
                {cells.map((cell) => (
                  <rect key={`${cell.row}:${cell.col}`} x={cell.col + 0.08} y={cell.row + 0.08} width={0.84} height={0.84} rx={0.06} />
                ))}
              </g>
              {state.lines
                .filter((line) => !exitingLines.some((item) => item.id === line.id))
                .map((line) => (
                  <LineToken
                    key={line.id}
                    line={line}
                    rows={state.rows}
                  columns={state.columns}
                  ready={readyIds.has(line.id)}
                  blocked={state.blockedId === line.id}
                  hinted={state.hintIds.includes(line.id)}
                  onPickLine={onPick}
                  onLineKeyDown={onLineKeyDown}
                />
                ))}
              {exitingLines.map((exitingLine) => (
                <LineToken
                  key={`exiting-${exitingLine.id}`}
                  line={exitingLine.line}
                  rows={state.rows}
                  columns={state.columns}
                  ready
                  blocked={false}
                  exiting={exitingLine}
                  interactive={false}
                  onPickLine={onPick}
                  onLineKeyDown={onLineKeyDown}
                />
              ))}
            </svg>
          </section>

          <footer className="parking-toolbar" aria-label="线阵工具">
            <button className="parking-round" type="button" onClick={restart} aria-label="重开">
              <RotateCcw size={28} />
            </button>
            <div className="parking-progress" aria-label={`清除进度 ${progressPercent}%`}>
              <div className="parking-progress__bar">
                <span
                  style={
                    {
                      "--progress-scale": `${progressPercent / 100}`,
                      width: `${progressPercent}%`,
                    } as CSSProperties
                  }
                />
              </div>
            </div>
            <button
              className="parking-round"
              type="button"
              onClick={hint}
              disabled={state.hintsRemaining <= 0 || state.status !== "playing"}
              aria-label={`提示，剩余 ${state.hintsRemaining} 次`}
            >
              <Lightbulb size={26} />
            </button>
          </footer>
        </section>

        {state.status === "won" ? (
          <div className="parking-result" role="dialog" aria-modal="true" aria-label="线阵通关">
            <section>
              <Trophy size={28} />
              <h2>线阵清空</h2>
              <p>
                {state.endless ? `无尽第 ${state.endlessRound ?? 1} 盘` : state.levelName} · {state.moves} 步
              </p>
              <div className="parking-actions">
                <button className="parking-secondary" type="button" onClick={restart}>
                  再来
                </button>
                <button className="parking-primary" type="button" onClick={nextLevel}>
                  下一关
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ParkingLevelSelect({
  onBackHome,
  onStartLevel,
}: {
  onBackHome: () => void;
  onStartLevel: (level: LineLevelPreset) => void;
}) {
  const standardLevels = LINE_LEVEL_PRESETS.filter((level) => !level.endless);
  const endlessLevel = LINE_LEVEL_PRESETS.find((level) => level.endless);

  return (
    <main className="casual-shell parking-shell" aria-label="线阵清场难度选择">
      <section className="parking-level-select">
        <header className="parking-level-select__top">
          <button className="casual-icon-button parking-back" type="button" onClick={onBackHome} aria-label="返回合集">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p>线阵清场</p>
            <h1>选择难度</h1>
            <span>难度按点阵数量递增；每局形状会在方阵、菱形、回字形、十字、阶梯中随机变化。</span>
          </div>
        </header>

        <section className="parking-level-grid" aria-label="线阵清场关卡">
          {standardLevels.map((level) => (
            <ParkingLevelCard key={level.id} level={level} onStart={onStartLevel} />
          ))}
          {endlessLevel ? <ParkingLevelCard level={endlessLevel} onStart={onStartLevel} /> : null}
        </section>
      </section>
    </main>
  );
}

function ParkingLevelCard({
  level,
  onStart,
}: {
  level: LineLevelPreset;
  onStart: (level: LineLevelPreset) => void;
}) {
  const shapes = level.layoutKinds.map((kind) => LAYOUT_LABELS[kind]).join(" / ");
  return (
    <button
      type="button"
      className={["parking-level-card", level.endless ? "parking-level-card--endless" : ""].filter(Boolean).join(" ")}
      onClick={() => onStart(level)}
      aria-label={`开始${level.name}`}
    >
      <span className="parking-level-card__difficulty">{level.difficulty}</span>
      <strong>{level.name}</strong>
      <small>{level.subtitle}</small>
      <small>{level.endless ? "通关后自动递进" : `约 ${level.targetLineCount} 条线`}</small>
      <p>{level.description}</p>
      <span className="parking-level-card__meta">随机形状：{shapes}</span>
      {level.endless ? <Infinity size={18} aria-hidden="true" /> : <Route size={18} aria-hidden="true" />}
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}
