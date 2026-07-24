import { ArrowLeft, Bot, ChevronRight, Grid3X3, Layers3, Sparkles, Users } from "lucide-react";

export type GameMode = "xiangkou" | "sichuan" | "link-match" | "yangyang";

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
          <section className="home-section" aria-label="牌桌麻将">
            <h2>牌桌麻将</h2>
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

          <section className="home-section" aria-label="休闲消除">
            <h2>休闲消除</h2>
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

              <button className="home-card home-card--yang home-card--locked" disabled aria-label="麻将羊羊消敬请期待">
                <div className="home-card__icon">
                  <Layers3 size={28} />
                </div>
                <div className="home-card__body">
                  <h3>麻将羊羊消</h3>
                  <p>多层牌堆、槽位消除和关卡节奏还在打磨中，后续开放。</p>
                </div>
                <span className="home-card__badge">敬请期待</span>
              </button>
            </div>
          </section>
        </div>

        <footer className="home-footer">牌桌进度保存在本机浏览器，休闲关卡当前局内即时游玩。</footer>
      </section>
    </main>
  );
}

export function XiangkouModeSelect({
  onBackHome,
  onEnterBot,
}: {
  onBackHome: () => void;
  onEnterBot: () => void;
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
            <p className="home-sub">当前可进入人机练习，朋友房间稍后开放</p>
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

          <button className="home-card home-card--locked" disabled aria-label="朋友房间敬请期待">
            <div className="home-card__icon">
              <Users size={28} />
            </div>
            <div className="home-card__body">
              <h3>朋友房间</h3>
              <p>房主开房、房间号加入和实时同步还在搭桌中。</p>
            </div>
            <span className="home-card__badge">敬请期待</span>
          </button>
        </div>
      </section>
    </main>
  );
}

export function SichuanModeSelect({
  onBackHome,
  onEnterBot,
}: {
  onBackHome: () => void;
  onEnterBot: () => void;
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
            <p className="home-sub">当前可进入人机血战，朋友房间稍后开放</p>
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

          <button className="home-card home-card--locked" disabled aria-label="川麻朋友房间敬请期待">
            <div className="home-card__icon">
              <Users size={28} />
            </div>
            <div className="home-card__body">
              <h3>朋友房间</h3>
              <p>川麻开房、邀请好友和实时结算同步还在搭桌中。</p>
            </div>
            <span className="home-card__badge">敬请期待</span>
          </button>
        </div>
      </section>
    </main>
  );
}
