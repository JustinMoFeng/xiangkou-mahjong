import { Bot, ChevronRight, Sparkles } from "lucide-react";

export type GameMode = "classic" | "sichuan";

export default function Home({ onSelect }: { onSelect: (mode: GameMode) => void }) {
  return (
    <main className="home-shell">
      <section className="home-frame">
        <header className="home-header">
          <p className="home-eyebrow">本地四人 · 人机练习</p>
          <h1>巷口麻将</h1>
          <p className="home-sub">选择一种玩法开始牌局</p>
        </header>

        <div className="home-modes">
          <button className="home-card home-card--classic" onClick={() => onSelect("classic")}>
            <div className="home-card__icon">
              <Sparkles size={28} />
            </div>
            <div className="home-card__body">
              <h2>经典巷口麻将</h2>
              <p>136 张标准牌，支持吃碰杠，垃圾胡 1 倍起胡，单局单胡结算。</p>
            </div>
            <ChevronRight className="home-card__go" size={22} />
          </button>

          <button className="home-card home-card--sichuan" onClick={() => onSelect("sichuan")}>
            <div className="home-card__icon">
              <Bot size={28} />
            </div>
            <div className="home-card__body">
              <h2>川麻 · 血战到底</h2>
              <p>108 张（无字牌），开局定缺、只碰杠不吃，胡牌亮牌离场，血战到底、刮风下雨与查叫结算。</p>
            </div>
            <ChevronRight className="home-card__go" size={22} />
          </button>
        </div>

        <footer className="home-footer">数据保存在本机浏览器，可随时切换玩法。</footer>
      </section>
    </main>
  );
}
