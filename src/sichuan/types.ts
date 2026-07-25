export type SuitPrefix = "m" | "p" | "s";
export type TileCode = `${SuitPrefix}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export type Tile = {
  id: string;
  code: TileCode;
  suit: SuitPrefix;
  rank: number;
  label: string;
  shortLabel: string;
};

export type Seat = 0 | 1 | 2 | 3;
export type SeatType = "human" | "bot" | "remote";

export type Phase = "choosing-missing" | "playing" | "finished";

export type MeldKind = "pong" | "kong-exposed" | "kong-concealed" | "kong-added";

export type Meld = {
  kind: MeldKind;
  tiles: Tile[];
  code: TileCode;
  from: Seat;
};

export type WinKind = "self-draw" | "discard";

export type ScoreDetail = {
  name: string;
  fan: number;
};

export type WinInfo = {
  kind: WinKind;
  from: Seat;
  tile: Tile;
  fan: number;
  title: string;
  details: ScoreDetail[];
  turn: number;
};

export type Player = {
  seat: Seat;
  name: string;
  type: SeatType;
  hand: Tile[];
  drawnTileId?: string;
  melds: Meld[];
  discards: Tile[];
  score: number;
  missingSuit?: SuitPrefix;
  hasWon: boolean;
  winInfo?: WinInfo;
  isTenpai: boolean;
  isHuazhu: boolean;
};

export type ActionLog = {
  id: string;
  text: string;
};

export type ClaimAction = "win" | "pong" | "kong";

export type ClaimOption = {
  id: string;
  action: ClaimAction;
  label: string;
  handTileIds: string[];
  previewTileCodes: TileCode[];
};

export type PendingClaim = {
  id: string;
  from: Seat;
  tile: Tile;
  seat: Seat;
  options: ClaimOption[];
};

export type GangLogEntry = {
  seat: Seat;
  kind: MeldKind;
  from: { seat: Seat; amount: number }[];
};

export type SettlementRow = {
  seat: Seat;
  name: string;
  reason: string;
  delta: number;
};

export type Settlement = {
  reason: "drain" | "last-standing";
  rows: SettlementRow[];
};

export type GameState = {
  players: Player[];
  wall: Tile[];
  currentSeat: Seat;
  dealerSeat: Seat;
  roundNumber: number;
  phase: Phase;
  missingChosen: boolean;
  awaitingDiscard: boolean;
  lastDiscard?: {
    tile: Tile;
    seat: Seat;
    fromKong?: boolean;
  };
  pendingClaim?: PendingClaim;
  lastKong?: {
    seat: Seat;
    kind: MeldKind;
  };
  gangLog: GangLogEntry[];
  drawReplacement: boolean;
  settlement?: Settlement;
  recentAction: string;
  logs: ActionLog[];
  turn: number;
  roomId?: string;
};
