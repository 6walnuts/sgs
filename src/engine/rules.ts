import type { GameState, PlayerId, PlayerState, ResponseData } from './types';
import { WEAPON_RANGE, isBlack, isRed, isShaCard } from './deck';
import { alivePlayers, card, factionOf, fail, hasSkill, player } from './kernel';
import type { Ctx } from './kernel';

// 座次距离(仅计存活角色)+ 目标的 +1 马 - 自己的 -1 马 - 马术,最小为 1
export function distance(s: GameState, from: PlayerId, to: PlayerId): number {
  if (from === to) return 0;
  const alive = alivePlayers(s).sort((a, b) => a.seat - b.seat);
  const ia = alive.findIndex((p) => p.id === from);
  const ib = alive.findIndex((p) => p.id === to);
  if (ia < 0 || ib < 0) return Infinity;
  const n = alive.length;
  const raw = Math.abs(ia - ib);
  let d = Math.min(raw, n - raw);
  const src = player(s, from);
  if (player(s, to).equips.horsePlus !== undefined) d += 1;
  if (hasSkill(s, player(s, to), 'feiying')) d += 1; // 飞影:他人计算与神曹操的距离 +1
  if (src.equips.horseMinus !== undefined) d -= 1;
  if (hasSkill(s, src, 'mashu')) d -= 1;
  // 屯田:邓艾每有一张"田",计算与其他角色的距离 -1
  if (hasSkill(s, src, 'tuntian')) d -= src.tian?.length ?? 0;
  return Math.max(1, d);
}

export function attackRange(s: GameState, p: PlayerState): number {
  const w = p.equips.weapon;
  if (w === undefined) return 1;
  return WEAPON_RANGE[card(s, w).name] ?? 1;
}

export function weaponName(s: GameState, p: PlayerState): string | null {
  const w = p.equips.weapon;
  return w === undefined ? null : card(s, w).name;
}

export function armorName(s: GameState, p: PlayerState): string | null {
  const a = p.equips.armor;
  return a === undefined ? null : card(s, a).name;
}

export function shaLimit(s: GameState, p: PlayerState): number {
  if (hasSkill(s, p, 'paoxiao')) return Infinity;
  const w = p.equips.weapon;
  if (w !== undefined && card(s, w).name === 'zhugeliannu') return Infinity;
  return 1 + (p.flags.tianyiWin ? 1 : 0); // 天义拼点赢:本回合可多使用一张杀
}

// 手牌上限:体力值;血裔(袁绍主公技)每有一名其他群势力角色 +2
export function handLimit(s: GameState, p: PlayerState): number {
  let n = Math.max(0, p.hp);
  if (hasSkill(s, p, 'xueyi')) {
    const qunOthers = alivePlayers(s).filter(
      (x) => x.id !== p.id && factionOf(s, x) === 'qun',
    ).length;
    n += 2 * qunOthers;
  }
  return n;
}

export function shaUsed(p: PlayerState): number {
  return typeof p.flags.sha === 'number' ? p.flags.sha : 0;
}

export function assertInHand(_s: GameState, p: PlayerState, cardId: number): void {
  if (!p.hand.includes(cardId)) fail('这张牌不在你的手牌中');
}

// 空城:没有手牌时不能成为杀或决斗的目标
export function kongchengProtected(s: GameState, t: PlayerState): boolean {
  return hasSkill(s, t, 'kongcheng') && t.hand.length === 0;
}

// 红颜:小乔的黑桃牌视为红桃(用于判定与花色校验)
export function effectiveSuit(s: GameState, cardId: number, ownerId?: PlayerId): string {
  const suit = card(s, cardId).suit;
  if (ownerId !== undefined && suit === 'spade'
      && hasSkill(s, player(s, ownerId), 'hongyan')) {
    return 'heart';
  }
  return suit;
}

// 校验 respond-card 的应答牌(含武圣/急救/龙胆/倾国转化),返回卡牌 id。只校验,不移动。
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
  switch (resp.skill) {
    case 'wusheng':
      if (pattern !== 'sha') fail('武圣只能将红色牌当杀');
      if (!hasSkill(s, p, 'wusheng')) fail('你没有武圣技能');
      if (!isRed(c.suit)) fail('武圣需要红色牌');
      return resp.cardId;
    case 'jijiu':
      if (pattern !== 'tao') fail('急救只能将红色牌当桃');
      if (!hasSkill(s, p, 'jijiu')) fail('你没有急救技能');
      if (s.turn.activePlayer === pid) fail('急救只能在回合外发动');
      if (!isRed(c.suit)) fail('急救需要红色牌');
      return resp.cardId;
    case 'longdan':
      if (!hasSkill(s, p, 'longdan')) fail('你没有龙胆技能');
      if (pattern === 'sha' && c.name === 'shan') return resp.cardId;
      if (pattern === 'shan' && c.name === 'sha') return resp.cardId;
      fail('龙胆只能将杀当闪、闪当杀');
      break;
    case 'qingguo':
      if (pattern !== 'shan') fail('倾国只能将黑色手牌当闪');
      if (!hasSkill(s, p, 'qingguo')) fail('你没有倾国技能');
      if (!isBlack(c.suit)) fail('倾国需要黑色牌');
      return resp.cardId;
    case 'kanpo':
      if (pattern !== 'wuxie') fail('看破只能将黑色手牌当无懈可击');
      if (!hasSkill(s, p, 'kanpo')) fail('你没有看破技能');
      if (!isBlack(c.suit)) fail('看破需要黑色牌');
      return resp.cardId;
  }
  if (pattern === 'sha') {
    // 禁酒:高顺的酒均视为杀;武神:神关羽的红桃手牌均视为杀
    if (c.name === 'jiu' && hasSkill(s, p, 'jinjiu')) return resp.cardId;
    if (c.suit === 'heart' && hasSkill(s, p, 'wushen')) return resp.cardId;
    if (!isShaCard(c.name)) fail('打出的牌与要求不符');
    return resp.cardId;
  }
  // 武神是锁定技:红桃牌只能当杀,不能按原名使用
  if (c.suit === 'heart' && hasSkill(s, p, 'wushen')) fail('武神:红桃手牌均视为杀');
  if (c.name !== pattern) fail('打出的牌与要求不符');
  return resp.cardId;
}
