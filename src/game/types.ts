export type Suit = "characters" | "dots" | "bamboos" | "honors";
export type Wind = "east" | "south" | "west" | "north";
export type Dragon = "red" | "green" | "white";
export type HonorRank = Wind | Dragon;
export type TileCode =
  | `m${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `p${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `s${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | HonorRank;

export type Tile = {
  id: string;
  code: TileCode;
  suit: Suit;
  rank: number | HonorRank;
  label: string;
  shortLabel: string;
};

export type Seat = 0 | 1 | 2 | 3;
export type PlayerNames = [string, string, string, string];
export type SeatType = "human" | "bot" | "remote";
export type RoundPhase = "playing" | "finished";
export type GameOverReason = "bankrupt";
export type WinKind = "self-draw" | "discard";
export type MeldKind = "chow" | "pong" | "kong";
export type ClaimAction = "win" | MeldKind;

export type Meld = {
  kind: MeldKind;
  tiles: Tile[];
  from: Seat;
  calledTile: Tile;
};

export type Player = {
  seat: Seat;
  name: string;
  wind: Wind;
  type: SeatType;
  hand: Tile[];
  drawnTileId?: string;
  melds: Meld[];
  discards: Tile[];
  score: number;
  isDealer: boolean;
};

export type ActionLog = {
  id: string;
  text: string;
};

export type WinPattern = {
  pair: TileCode;
  melds: TileCode[][];
};

export type ScoreDetail = {
  name: string;
  multiplier: number;
};

export type WinResult = {
  winner: Seat;
  from: Seat;
  tile: Tile;
  kind: WinKind;
  multiplier: number;
  title: string;
  details: ScoreDetail[];
  pattern: WinPattern;
};

export type PendingClaim = {
  id: string;
  from: Seat;
  tile: Tile;
  seat: Seat;
  options: ClaimOption[];
};

export type ClaimOption = {
  id: string;
  action: ClaimAction;
  label: string;
  handTileIds: string[];
  previewTileCodes: TileCode[];
};

export type GameState = {
  players: Player[];
  wall: Tile[];
  currentSeat: Seat;
  dealerSeat: Seat;
  roundWind: Wind;
  roundNumber: number;
  phase: RoundPhase;
  lastDiscard?: {
    tile: Tile;
    seat: Seat;
  };
  pendingClaim?: PendingClaim;
  winner?: WinResult;
  gameOverReason?: GameOverReason;
  recentAction: string;
  logs: ActionLog[];
  turn: number;
  roomId?: string;
};
