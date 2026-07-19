// 视角过滤:生成某个玩家可见的状态副本,联机时服务器按玩家分发,
// 防止客户端读到不该看到的信息(他人手牌、牌堆顺序、未亮身份、随机数状态)。
// 副本仍是合法的 GameState 形状,UI 无需区分本地/联机:
// - 隐藏的卡牌 id 一律替换为 -1(数量保留)
// - 未亮出的身份替换为占位值 'loyalist'(UI 只在 roleRevealed/自己/终局时展示身份)
// - 结算栈清空(栈帧内含无懈询问队列等私密信息,UI 不消费栈)

import type { GameEvent, GameState, PlayerId } from './types';

const PUBLIC_ZONES = new Set(['discard', 'processing', 'equip', 'judge']);

function redactEvent(ev: GameEvent, viewer: PlayerId): GameEvent {
  if (ev.type !== 'cardsMoved') return ev;
  const visible =
    PUBLIC_ZONES.has(ev.from.zone) ||
    PUBLIC_ZONES.has(ev.to.zone) ||
    ev.from.player === viewer ||
    ev.to.player === viewer;
  if (visible) return ev;
  return { ...ev, cardIds: ev.cardIds.map(() => -1) };
}

export function redactStateFor(s: GameState, viewer: PlayerId): GameState {
  const c = structuredClone(s);
  c.rngState = 0;
  c.stack = [];
  c.drawPile = c.drawPile.map(() => -1);
  for (const p of c.players) {
    if (p.id === viewer) continue;
    p.hand = p.hand.map(() => -1);
    if (!p.roleRevealed && !c.winner) p.role = 'loyalist';
  }
  c.eventLog = c.eventLog.map((ev) => redactEvent(ev, viewer));
  return c;
}
