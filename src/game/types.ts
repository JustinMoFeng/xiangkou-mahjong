export type Suit = "characters" | "dots" | "bamboos" | "honors" | "flowers";
export type Wind = "east" | "south" | "west" | "north";
export type Dragon = "red" | "green" | "white";
export type HonorRank = Wind | Dragon;
export type FlowerRank = "spring" | "summer" | "autumn" | "winter" | "plum" | "orchid" | "bamboo" | "chrysanthemum";
export type TileCode =
  | `m${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `p${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `s${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | HonorRank
  | FlowerRank;

export type Tile = {
  id: string;
  code: TileCode;
  suit: Suit;
  rank: number | HonorRank | FlowerRank;
  label: string;
  shortLabel: string;
};

export type Seat = 0 | 1 | 2 | 3;
export type PlayerNames = [string, string, string, string];
export type SeatType = "human" | "bot" | "remote";
export type RoundPhase = "playing" | "finished";
export type GameOverReason = "bankrupt";
export type WinKind = "self-draw" | "discard";
export type WinPatternKind = "standard" | "seven-pairs" | "thirteen-orphans";
export type WinBonusEvent = "kong-draw" | "rob-kong";
export type MeldKind = "chow" | "pong" | "kong";
export type KongKind = "exposed" | "added" | "concealed";
export type ClaimAction = "win" | MeldKind;

export type Meld = {
  kind: MeldKind;
  tiles: Tile[];
  from: Seat;
  calledTile: Tile;
  kongKind?: KongKind;
};

export type Player = {
  seat: Seat;
  name: string;
  wind: Wind;
  type: SeatType;
  hand: Tile[];
  drawnTileId?: string;
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  score: number;
  isDealer: boolean;
};

export type ActionLog = {
  id: string;
  text: string;
};

export type WinPattern = {
  kind: WinPatternKind;
  pair: TileCode;
  melds: TileCode[][];
};

export type ScoreDetail = {
  name: string;
  multiplier: number;
  operation?: "multiply" | "cap";
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
  bonusEvent?: WinBonusEvent;
};

export type PendingClaim = {
  id: string;
  from: Seat;
  tile: Tile;
  seat: Seat;
  options: ClaimOption[];
  robKong?: boolean;
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
  lastSupplementDraw?: {
    seat: Seat;
    tileId: string;
  };
  gameOverReason?: GameOverReason;
  recentAction: string;
  logs: ActionLog[];
  turn: number;
  roomId?: string;
};
