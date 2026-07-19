// 引擎测试共用工具:直接摆牌构造局面

import { expect } from 'vitest';
import { applyAction, createGame } from './engine';
import type { CardId, CardName, GameState, GeneralId, PlayerId, ResponseData, Role } from './types';
import { isRed } from './deck';

// 通用规则测试里把武将统一为无被动干扰技能的甘宁(奇袭是主动技),
// 需要特定武将的用例自行覆盖 general 字段
export function newGame(seed = 1): GameState {
  const s = createGame({ seed }).state;
  for (const p of s.players) p.general = 'ganning';
  return s;
}

export function removeEverywhere(s: GameState, id: CardId): void {
  const pull = (arr: CardId[]) => {
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
  };
  pull(s.drawPile);
  pull(s.discardPile);
  pull(s.processingZone);
  for (const p of s.players) {
    pull(p.hand);
    pull(p.judgeZone);
    for (const k of Object.keys(p.equips) as Array<keyof typeof p.equips>) {
      if (p.equips[k] === id) delete p.equips[k];
    }
  }
}

export function clearHands(s: GameState): void {
  for (const p of s.players) {
    s.drawPile.push(...p.hand);
    p.hand = [];
  }
}

function inUse(s: GameState, id: CardId): boolean {
  return s.players.some(
    (p) => p.hand.includes(id)
      || p.judgeZone.includes(id)
      || Object.values(p.equips).includes(id),
  ) || s.processingZone.includes(id);
}

export function findCard(s: GameState, name: CardName, opts?: { red?: boolean; suit?: string }): CardId {
  for (const c of Object.values(s.cards)) {
    if (c.name !== name) continue;
    if (opts?.red !== undefined && isRed(c.suit) !== opts.red) continue;
    if (opts?.suit !== undefined && c.suit !== opts.suit) continue;
    if (inUse(s, c.id)) continue;
    return c.id;
  }
  throw new Error(`找不到卡牌 ${name}`);
}

export function give(s: GameState, pid: PlayerId, name: CardName, opts?: { red?: boolean; suit?: string }): CardId {
  const id = findCard(s, name, opts);
  removeEverywhere(s, id);
  s.players.find((p) => p.id === pid)!.hand.push(id);
  return id;
}

export function equip(s: GameState, pid: PlayerId, name: CardName): CardId {
  const id = findCard(s, name);
  removeEverywhere(s, id);
  const p = s.players.find((x) => x.id === pid)!;
  if (name === 'baguazhen') p.equips.armor = id;
  else if (name === 'jiama') p.equips.horsePlus = id;
  else if (name === 'jianma') p.equips.horseMinus = id;
  else p.equips.weapon = id;
  return id;
}

export function setRoles(s: GameState, roles: Record<PlayerId, Role>): void {
  for (const p of s.players) p.role = roles[p.id];
}

export function setGeneral(s: GameState, pid: PlayerId, g: GeneralId): void {
  s.players.find((p) => p.id === pid)!.general = g;
}

// 把牌堆顶设置为指定颜色/花色的牌
export function rigDrawTop(s: GameState, opts: { red?: boolean; suit?: string }): CardId {
  const id = s.drawPile.find((cid) => {
    const c = s.cards[cid];
    if (opts.red !== undefined && isRed(c.suit) !== opts.red) return false;
    if (opts.suit !== undefined && c.suit !== opts.suit) return false;
    return true;
  });
  if (id === undefined) throw new Error('牌堆里找不到指定的牌');
  removeEverywhere(s, id);
  s.drawPile.unshift(id);
  return id;
}

export function rigPlay(s: GameState, pid: PlayerId): void {
  s.stack = [];
  s.processingZone = [];
  const p = s.players.find((x) => x.id === pid)!;
  p.flags = {};
  s.turn = { activePlayer: pid, phase: 'play', turnNumber: s.turn.turnNumber };
  s.pendingRequest = { id: s.nextRequestId++, player: pid, type: 'play' };
}

export function act(s: GameState, response: ResponseData): GameState {
  const req = s.pendingRequest;
  if (!req) throw new Error('没有待应答请求');
  const r = applyAction(s, { player: req.player, requestId: req.id, response });
  if (r.error) throw new Error(`引擎拒绝:${r.error}`);
  return r.state;
}

export function actErr(s: GameState, response: ResponseData): string {
  const req = s.pendingRequest!;
  const r = applyAction(s, { player: req.player, requestId: req.id, response });
  if (!r.error) throw new Error('预期引擎拒绝,但成功了');
  expect(r.state).toBe(s);
  return r.error;
}

// 找到座次上一位存活玩家:让其在 play 请求下 end-phase,
// 流程会自然走进目标玩家的回合开始(用于测试观星/判定/摸牌阶段技能)
export function playerBefore(s: GameState, pid: PlayerId): PlayerId {
  const target = s.players.find((p) => p.id === pid)!;
  const n = s.players.length;
  for (let i = 1; i < n; i++) {
    const seat = (target.seat - i + n) % n;
    const prev = s.players.find((p) => p.seat === seat)!;
    if (prev.alive) return prev.id;
  }
  throw new Error('没有上一位玩家');
}

export function P(s: GameState, pid: PlayerId) {
  return s.players.find((p) => p.id === pid)!;
}
