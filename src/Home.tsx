import { ArrowLeft, Bot, ChevronRight, Grid2X2, Grid3X3, Layers3, Plus, Route, Sparkles, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { normalizeRoomCode } from "./online/signaling";

export type GameMode = "xiangkou" | "sichuan" | "link-match" | "yangyang" | "parking" | "twenty48";

export default function Home({ onSelect }: { onSelect: (mode: GameMode) => void }) {
  return (
    <main className="home-shell" aria-label="游戏大厅">
      <section className="home-frame">
        <header className="home-header">
          <p className="home-eyebrow">牌桌练习 · 休闲消除</p>
          <h1>麻将游戏合集</h1>
          <p className="home-sub">选择一种玩法开始游玩</p>
        </header>

        <div className="home-sections">
          <section className="home-section" aria-label="麻将">
            <h2>麻将</h2>
            <div className="home-modes">
              <button className="home-card home-card--classic" onClick={() => onSelect("xiangkou")} aria-label="选择巷口麻将">
                <div className="home-card__icon">
                  <Sparkles size={28} />
                </div>
                <div className="home-card__body">
                  <h3>巷口麻将</h3>
                  <p>项目自定义规则，支持吃碰杠，垃圾胡 1 倍起胡，进入后选择人机练习或朋友房间。</p>
                </div>
                <ChevronRight className="home-card__go" size={22} />
              </button>

              <button className="home-card home-card--sichuan" onClick={() => onSelect("sichuan")} aria-label="选择四川麻将">
                <div className="home-card__icon">
                  <Bot size={28} />
                </div>
                <div className="home-card__body">
                  <h3>川麻 · 血战到底</h3>
                  <p>108 张（无字牌），开局定缺、只碰杠不吃，胡牌亮牌离场，血战到底、刮风下雨与查叫结算。</p>
                </div>
                <ChevronRight className="home-card__go" size={22} />
              </button>
            </div>
          </section>

          <section className="home-section" aria-label="麻将小游戏">
            <h2>麻将小游戏</h2>
            <div className="home-modes">
              <button className="home-card home-card--link" onClick={() => onSelect("link-match")} aria-label="开始麻将连连看">
                <div className="home-card__icon">
                  <Grid3X3 size={28} />
                </div>
                <div className="home-card__body">
                  <h3>麻将连连看</h3>
                  <p>8 x 6 牌墙，寻找相同麻将牌，用不超过两次转弯的路径连接消除。</p>
                </div>
                <ChevronRight className="home-card__go" size={22} />
              </button>

              <button className="home-card home-card--yang" onClick={() => onSelect("yangyang")} aria-label="开始麻将羊羊消">
                <div className="home-card__icon">
                  <Layers3 size={28} />
                </div>
                <div className="home-card__body">
                  <h3>麻将羊羊消</h3>
                  <p>多层麻将牌堆，优先拆上层城堡牌，底部 7 槽中三张同牌会自动消除。</p>
                </div>
                <ChevronRight className="home-card__go" size={22} />
              </button>
            </div>
          </section>

          <section className="home-section" aria-label="休闲小游戏">
            <h2>休闲小游戏</h2>
            <div className="home-modes home-modes--compact">
              <button className="home-card home-card--parking" onClick={() => onSelect("parking")} aria-label="开始线阵清场">
                <div className="home-card__icon">
                  <Route size={28} />
                </div>
                <div className="home-card__body">
                  <h3>线阵清场</h3>
                  <p>点击箭头方向无阻的深色折线，让整条线从面板中抽离。</p>
                </div>
                <ChevronRight className="home-card__go" size={22} />
              </button>

              <button className="home-card home-card--twenty48" onClick={() => onSelect("twenty48")} aria-label="开始2048">
                <div className="home-card__icon">
                  <Grid2X2 size={28} />
                </div>
                <div className="home-card__body">
                  <h3>2048</h3>
                  <p>普通数字方格合成，保留当前分数、本局进度和最高分记录。</p>
                </div>
                <ChevronRight className="home-card__go" size={22} />
              </button>
            </div>
          </section>
        </div>

        <footer className="home-footer">麻将牌桌保存在本机浏览器，小游戏关卡按玩法记录进度和最好成绩。</footer>
      </section>
    </main>
  );
}

function FriendsRoomJoinCard({
  label,
  description,
  modalEyebrow,
  modalDescription,
  onCreateRoom,
  onJoinRoom,
}: {
  label: string;
  description: string;
  modalEyebrow: string;
  modalDescription: string;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode?: string) => void;
}) {
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  function submitJoin(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomCode);
    if (normalized.length !== 6) {
      setJoinError("请输入 6 位房间号");
      return;
    }
    onJoinRoom(normalized);
  }

  return (
    <>
      <section className="home-card home-card--friends room-join-card" aria-label={`加入${label}朋友房间`}>
        <div className="home-card__icon">
          <Users size={28} />
        </div>
        <div className="home-card__body">
          <h3>朋友房间</h3>
          <p>{description}</p>
        </div>
        <form className="room-inline-form" onSubmit={submitJoin}>
          <label className="room-field room-field--inline">
            <span>房间号</span>
            <input
              value={roomCode}
              maxLength={6}
              inputMode="numeric"
              onChange={(event) => {
                setRoomCode(normalizeRoomCode(event.target.value));
                setJoinError("");
              }}
              placeholder="输入 6 位房间号"
            />
          </label>
          <button className="room-primary" type="submit">
            加入
          </button>
          <button className="room-secondary" type="button" onClick={() => setIsCreateOpen(true)}>
            <Plus size={17} />
            创建
          </button>
        </form>
        {joinError ? <p className="room-error">{joinError}</p> : null}
      </section>

      {isCreateOpen ? (
        <div className="room-modal-backdrop" role="dialog" aria-modal="true" aria-label={`创建${label}朋友房间`}>
          <section className="room-create-modal">
            <div>
              <p className="home-eyebrow">{modalEyebrow}</p>
              <h2>创建房间</h2>
              <p>{modalDescription}</p>
            </div>
            <div className="room-actions">
              <button className="room-secondary" type="button" onClick={() => setIsCreateOpen(false)}>
                取消
              </button>
              <button className="room-primary" type="button" onClick={onCreateRoom}>
                <Plus size={18} />
                创建房间
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function XiangkouModeSelect({
  onBackHome,
  onEnterBot,
  onCreateRoom,
  onJoinRoom,
}: {
  onBackHome: () => void;
  onEnterBot: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode?: string) => void;
}) {
  return (
    <main className="home-shell" aria-label="巷口麻将开桌方式">
      <section className="home-frame">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackHome} aria-label="返回游戏大厅">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">巷口麻将</p>
            <h1>选择开桌方式</h1>
            <p className="home-sub">输入房间号加入朋友牌桌，或自己开房邀请好友。</p>
          </div>
        </header>

        <div className="home-modes">
          <button className="home-card home-card--classic" onClick={onEnterBot} aria-label="进入人机练习">
            <div className="home-card__icon">
              <Bot size={28} />
            </div>
            <div className="home-card__body">
              <h3>人机练习</h3>
              <p>你坐下方，三名机器人陪打。本地保存当前牌局，刷新后可继续。</p>
            </div>
            <ChevronRight className="home-card__go" size={22} />
          </button>

          <FriendsRoomJoinCard
            label="巷口麻将"
            description="输入 6 位房间号加入好友牌桌。没有房间号时，可以创建房间再分享给朋友。"
            modalEyebrow="巷口麻将 · 朋友房间"
            modalDescription="生成 6 位房间号，好友加入后由房主开始，空座自动机器人补位。"
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
          />
        </div>
      </section>
    </main>
  );
}

export function SichuanModeSelect({
  onBackHome,
  onEnterBot,
  onCreateRoom,
  onJoinRoom,
}: {
  onBackHome: () => void;
  onEnterBot: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode?: string) => void;
}) {
  return (
    <main className="home-shell" aria-label="四川麻将开桌方式">
      <section className="home-frame home-frame--sichuan">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackHome} aria-label="返回游戏大厅">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">川麻 · 血战到底</p>
            <h1>选择开桌方式</h1>
            <p className="home-sub">输入房间号加入血战牌桌，或自己开房邀请好友。</p>
          </div>
        </header>

        <div className="home-modes">
          <button className="home-card home-card--sichuan" onClick={onEnterBot} aria-label="进入人机血战">
            <div className="home-card__icon">
              <Bot size={28} />
            </div>
            <div className="home-card__body">
              <h3>人机血战</h3>
              <p>开局定缺，只碰杠不吃，胡牌亮牌离场，剩余玩家继续血战。</p>
            </div>
            <ChevronRight className="home-card__go" size={22} />
          </button>

          <FriendsRoomJoinCard
            label="川麻"
            description="输入 6 位房间号加入血战牌桌。没有房间号时，可以创建房间再分享给朋友。"
            modalEyebrow="川麻 · 朋友房间"
            modalDescription="生成 6 位房间号，好友加入后由房主开始血战，空座自动机器人补位。"
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
          />
        </div>
      </section>
    </main>
  );
}
