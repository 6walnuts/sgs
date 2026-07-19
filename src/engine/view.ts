// 视角过滤:生成某个玩家可见的状态(联机同步时服务器按玩家分发)。
// 本地版 UI 直接持有完整 state 并自行遮挡;此模块为联机预留并保证可行性。

import type { CardId, GameState, PlayerId, Role } from './types';

export interface PlayerView {
  id: PlayerId;
  seat: number;
  general: string;
  role: Role | null; // 不可见时为 null
  roleRevealed: boolean;
  maxHp: number;
  hp: number;
  alive: boolean;
  hand: CardId[]; // 仅自己可见,他人为空数组
  handCount: number;
  equips: GameState['players'][number]['equips'];
  judgeZone: CardId[];
}

export interface GameView {
  viewer: PlayerId;
  players: PlayerView[];
  cards: GameState['cards'];
  drawCount: number;
  discardPile: CardId[];
  processingZone: CardId[];
  turn: GameState['turn'];
  pendingRequest: GameState['pendingRequest'];
  winner: GameState['winner'];
}

export function viewFor(s: GameState, viewer: PlayerId): GameView {
  return {
    viewer,
    players: s.players.map((p) => {
      const visible = p.id === viewer || p.roleRevealed || s.winner !== null;
      return {
        id: p.id,
        seat: p.seat,
        general: p.general,
        role: visible ? p.role : null,
        roleRevealed: p.roleRevealed,
        maxHp: p.maxHp,
        hp: p.hp,
        alive: p.alive,
        hand: p.id === viewer ? p.hand.slice() : [],
        handCount: p.hand.length,
        equips: { ...p.equips },
        judgeZone: p.judgeZone.slice(),
      };
    }),
    cards: s.cards,
    drawCount: s.drawPile.length,
    discardPile: s.discardPile.slice(),
    processingZone: s.processingZone.slice(),
    turn: { ...s.turn },
    pendingRequest: s.pendingRequest ? { ...s.pendingRequest } : null,
    winner: s.winner ? s.winner.slice() : null,
  };
}
