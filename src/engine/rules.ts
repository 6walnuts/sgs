import type { GameState, PlayerId, PlayerState, ResponseData } from './types';
import { isRed } from './deck';
import { alivePlayers, card, fail, hasSkill, player } from './kernel';
import type { Ctx } from './kernel';

// 座次距离(仅计存活角色)+ 目标的 +1 马 - 自己的 -1 马,最小为 1
export function distance(s: GameState, from: PlayerId, to: PlayerId): number {
  if (from === to) return 0;
  const alive = alivePlayers(s).sort((a, b) => a.seat - b.seat);
  const ia = alive.findIndex((p) => p.id === from);
  const ib = alive.findIndex((p) => p.id === to);
  if (ia < 0 || ib < 0) return Infinity;
  const n = alive.length;
  const raw = Math.abs(ia - ib);
  let d = Math.min(raw, n - raw);
  if (player(s, to).equips.horsePlus !== undefined) d += 1;
  if (player(s, from).equips.horseMinus !== undefined) d -= 1;
  return Math.max(1, d);
}

export function attackRange(s: GameState, p: PlayerState): number {
  const w = p.equips.weapon;
  if (w !== undefined && card(s, w).name === 'qinglongdao') return 3;
  return 1;
}

export function shaLimit(s: GameState, p: PlayerState): number {
  const w = p.equips.weapon;
  if (w !== undefined && card(s, w).name === 'zhugeliannu') return Infinity;
  return 1;
}

export function shaUsed(p: PlayerState): number {
  return typeof p.flags.sha === 'number' ? p.flags.sha : 0;
}

export function assertInHand(_s: GameState, p: PlayerState, cardId: number): void {
  if (!p.hand.includes(cardId)) fail('这张牌不在你的手牌中');
}

// 校验 respond-card 的应答牌(含武圣/急救转化),返回卡牌 id。只校验,不移动。
export function validateResponseCard(
  ctx: Ctx,
  pid: PlayerId,
  resp: Extract<ResponseData, { kind: 'card' }>,
  pattern: 'shan' | 'sha' | 'tao' | 'wuxie',
): number {
  const s = ctx.s;
  const p = player(s, pid);
  assertInHand(s, p, resp.cardId);
  const c = card(s, resp.cardId);
  if (resp.skill === 'wusheng') {
    if (pattern !== 'sha') fail('武圣只能将红色牌当杀');
    if (!hasSkill(s, p, 'wusheng')) fail('你没有武圣技能');
    if (!isRed(c.suit)) fail('武圣需要红色牌');
    return resp.cardId;
  }
  if (resp.skill === 'jijiu') {
    if (pattern !== 'tao') fail('急救只能将红色牌当桃');
    if (!hasSkill(s, p, 'jijiu')) fail('你没有急救技能');
    if (s.turn.activePlayer === pid) fail('急救只能在回合外发动');
    if (!isRed(c.suit)) fail('急救需要红色牌');
    return resp.cardId;
  }
  if (c.name !== pattern) fail('打出的牌与要求不符');
  return resp.cardId;
}
