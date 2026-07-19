// 回合流程与出牌阶段的响应处理。栈为空时 advance 调用 flowRun 推进阶段;
// 栈为空时产生的请求(play / 弃牌 choose-cards)由 flowOnResponse 处理。

import type { PendingRequest, Phase, PlayerId, PlayerState, ResponseData } from './types';
import {
  ask, card, drawCards, emit, equipCardIds, fail, hasSkill, heal,
  moveCard, moveCards, player,
} from './kernel';
import type { Ctx } from './kernel';
import { equipSlotOf, isBlack, isRed } from './deck';
import { assertInHand, attackRange, distance, shaLimit, shaUsed } from './rules';
import { pushSlash, pushTrick } from './frames';
import { GENERALS } from './generals';

function setPhase(ctx: Ctx, phase: Phase): void {
  ctx.s.turn.phase = phase;
  emit(ctx, { type: 'phaseChanged', player: ctx.s.turn.activePlayer, phase });
}

export function nextTurn(ctx: Ctx): void {
  const s = ctx.s;
  const cur = player(s, s.turn.activePlayer);
  cur.flags = {};
  const n = s.players.length;
  let seat = cur.seat;
  for (let i = 0; i < n; i++) {
    seat = (seat + 1) % n;
    const next = s.players.find((p) => p.seat === seat)!;
    if (next.alive) {
      s.turn = { activePlayer: next.id, phase: 'start', turnNumber: s.turn.turnNumber + 1 };
      emit(ctx, { type: 'turnStarted', player: next.id, turnNumber: s.turn.turnNumber });
      return;
    }
  }
  fail('没有存活玩家');
}

export function flowRun(ctx: Ctx): void {
  const s = ctx.s;
  const p = player(s, s.turn.activePlayer);
  if (!p.alive) { nextTurn(ctx); return; }
  switch (s.turn.phase) {
    case 'start':
      setPhase(ctx, 'judge');
      return;
    case 'judge':
      // 本版无延时锦囊,判定阶段直接跳过
      setPhase(ctx, 'draw');
      return;
    case 'draw':
      drawCards(ctx, p.id, 2);
      setPhase(ctx, 'play');
      return;
    case 'play':
      if (p.flags.playEnded) { setPhase(ctx, 'discard'); return; }
      ask(ctx, { player: p.id, type: 'play' });
      return;
    case 'discard': {
      const excess = p.hand.length - Math.max(0, p.hp);
      if (excess > 0) {
        ask(ctx, {
          player: p.id, type: 'choose-cards', from: 'hand',
          min: excess, max: excess, canDecline: false, reason: { kind: 'discard' },
        });
      } else {
        setPhase(ctx, 'end');
      }
      return;
    }
    case 'end':
      if (hasSkill(s, p, 'biyue')) {
        emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'biyue' });
        drawCards(ctx, p.id, 1);
      }
      nextTurn(ctx);
      return;
  }
}

export function flowOnResponse(ctx: Ctx, req: PendingRequest, resp: ResponseData): void {
  const s = ctx.s;
  if (req.type === 'play') {
    handlePlay(ctx, req.player, resp);
    return;
  }
  if (req.type === 'choose-cards' && req.reason.kind === 'discard') {
    if (resp.kind !== 'cards') fail('弃牌阶段必须选择弃置的手牌');
    const p = player(s, req.player);
    validateChosenHand(p, resp.cardIds, req.min, req.max);
    moveCards(ctx, resp.cardIds, { zone: 'discard' }, 'discard-phase');
    setPhase(ctx, 'end');
    return;
  }
  fail('内部错误:未知的流程请求');
}

function validateChosenHand(p: PlayerState, ids: number[], min: number, max: number): void {
  if (ids.length < min || ids.length > max) fail(`需要选择 ${min} 张牌`);
  if (new Set(ids).size !== ids.length) fail('不能重复选择同一张牌');
  for (const id of ids) if (!p.hand.includes(id)) fail('所选牌不在手牌中');
}

// ---------- 出牌阶段 ----------

function handlePlay(ctx: Ctx, pid: PlayerId, resp: ResponseData): void {
  const s = ctx.s;
  const p = player(s, pid);
  switch (resp.kind) {
    case 'end-phase':
      p.flags.playEnded = true;
      return;
    case 'play-card':
      playCard(ctx, p, resp.cardId, resp.targets ?? []);
      return;
    case 'use-skill':
      useSkill(ctx, p, resp.skill, resp.cardIds ?? [], resp.targets ?? []);
      return;
    default:
      fail('出牌阶段只能出牌、发动技能或结束出牌');
  }
}

function requireTarget(ctx: Ctx, p: PlayerState, targets: PlayerId[], allowSelf = false): PlayerState {
  if (targets.length !== 1) fail('需要选择一个目标');
  const t = player(ctx.s, targets[0]);
  if (!t.alive) fail('目标已死亡');
  if (!allowSelf && t.id === p.id) fail('不能以自己为目标');
  return t;
}

function playCard(ctx: Ctx, p: PlayerState, cardId: number, targets: PlayerId[]): void {
  const s = ctx.s;
  assertInHand(s, p, cardId);
  const c = card(s, cardId);
  const slot = equipSlotOf(c.name);
  if (slot) {
    const old = p.equips[slot];
    if (old !== undefined) moveCard(ctx, old, { zone: 'discard' }, 'replace-equip');
    moveCard(ctx, cardId, { zone: 'equip', player: p.id }, 'equip');
    emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
    return;
  }
  switch (c.name) {
    case 'sha': {
      const t = requireTarget(ctx, p, targets);
      startSlash(ctx, p, cardId, t, false);
      return;
    }
    case 'tao': {
      if (p.hp >= p.maxHp) fail('体力已满,不能使用桃');
      moveCard(ctx, cardId, { zone: 'discard' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
      heal(ctx, p.id, 1);
      return;
    }
    case 'shan':
      fail('闪只能在响应时打出');
      return;
    case 'wuxie':
      fail('无懈可击只能在响应锦囊时打出');
      return;
    case 'wuzhong': {
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
      pushTrick(ctx, { cardId, effName: 'wuzhong', source: p.id, target: p.id });
      return;
    }
    case 'guohe': {
      const t = requireTarget(ctx, p, targets);
      if (t.hand.length + equipCardIds(t).length === 0) fail('目标没有牌可拆');
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushTrick(ctx, { cardId, effName: 'guohe', source: p.id, target: t.id });
      return;
    }
    case 'shunshou': {
      const t = requireTarget(ctx, p, targets);
      if (t.hand.length + equipCardIds(t).length === 0) fail('目标没有牌可拿');
      if (distance(s, p.id, t.id) > 1) fail('顺手牵羊只能指定距离 1 以内的目标');
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushTrick(ctx, { cardId, effName: 'shunshou', source: p.id, target: t.id });
      return;
    }
    case 'juedou': {
      const t = requireTarget(ctx, p, targets);
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushTrick(ctx, { cardId, effName: 'juedou', source: p.id, target: t.id });
      return;
    }
    default:
      fail(`无法使用 ${c.name}`);
  }
}

function startSlash(ctx: Ctx, p: PlayerState, cardId: number, t: PlayerState, viaWusheng: boolean): void {
  const s = ctx.s;
  if (t.id === p.id) fail('不能对自己使用杀');
  if (shaUsed(p) >= shaLimit(s, p)) fail('本回合使用杀的次数已用完');
  if (distance(s, p.id, t.id) > attackRange(s, p)) fail('目标超出攻击范围');
  p.flags.sha = shaUsed(p) + 1;
  moveCard(ctx, cardId, { zone: 'processing' }, 'play');
  emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id], as: viaWusheng ? 'sha' : undefined });
  if (viaWusheng) emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'wusheng' });
  pushSlash(ctx, p.id, t.id, cardId);
}

function useSkill(
  ctx: Ctx, p: PlayerState, skill: string, cardIds: number[], targets: PlayerId[],
): void {
  const s = ctx.s;
  switch (skill) {
    case 'wusheng': {
      if (!hasSkill(s, p, 'wusheng')) fail('你没有武圣技能');
      if (cardIds.length !== 1) fail('武圣需要选择一张红色牌');
      assertInHand(s, p, cardIds[0]);
      if (!isRed(card(s, cardIds[0]).suit)) fail('武圣需要红色牌');
      const t = requireTarget(ctx, p, targets);
      startSlash(ctx, p, cardIds[0], t, true);
      return;
    }
    case 'rende': {
      if (!hasSkill(s, p, 'rende')) fail('你没有仁德技能');
      if (cardIds.length === 0) fail('仁德需要至少选择一张手牌');
      for (const id of cardIds) assertInHand(s, p, id);
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      const t = requireTarget(ctx, p, targets);
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'rende' });
      moveCards(ctx, cardIds, { zone: 'hand', player: t.id }, 'rende');
      const given = (typeof p.flags.rende === 'number' ? p.flags.rende : 0) + cardIds.length;
      p.flags.rende = given;
      if (given >= 2 && !p.flags.rendeHealed) {
        p.flags.rendeHealed = true;
        heal(ctx, p.id, 1);
      }
      return;
    }
    case 'zhiheng': {
      if (!hasSkill(s, p, 'zhiheng')) fail('你没有制衡技能');
      if (p.flags.zhiheng) fail('制衡每回合限一次');
      if (cardIds.length === 0) fail('制衡需要至少弃置一张牌');
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      for (const id of cardIds) {
        if (!p.hand.includes(id) && !equipCardIds(p).includes(id)) fail('所选牌不属于你');
      }
      p.flags.zhiheng = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'zhiheng' });
      moveCards(ctx, cardIds, { zone: 'discard' }, 'zhiheng');
      drawCards(ctx, p.id, cardIds.length);
      return;
    }
    case 'qingnang': {
      if (!hasSkill(s, p, 'qingnang')) fail('你没有青囊技能');
      if (p.flags.qingnang) fail('青囊每回合限一次');
      if (cardIds.length !== 1) fail('青囊需要弃置一张手牌');
      assertInHand(s, p, cardIds[0]);
      const t = requireTarget(ctx, p, targets, true);
      if (t.hp >= t.maxHp) fail('目标体力已满');
      p.flags.qingnang = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'qingnang' });
      moveCard(ctx, cardIds[0], { zone: 'discard' }, 'qingnang');
      heal(ctx, t.id, 1);
      return;
    }
    case 'lijian': {
      if (!hasSkill(s, p, 'lijian')) fail('你没有离间技能');
      if (p.flags.lijian) fail('离间每回合限一次');
      if (cardIds.length !== 1) fail('离间需要弃置一张牌');
      if (!p.hand.includes(cardIds[0]) && !equipCardIds(p).includes(cardIds[0])) fail('所选牌不属于你');
      if (targets.length !== 2 || targets[0] === targets[1]) fail('离间需要选择两名男性角色');
      const [a, b] = targets.map((id) => player(s, id));
      for (const t of [a, b]) {
        if (!t.alive) fail('目标已死亡');
        if (t.id === p.id) fail('离间不能以自己为目标');
        if (GENERALS[t.general].gender !== 'm') fail('离间只能指定男性角色');
      }
      p.flags.lijian = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'lijian' });
      moveCard(ctx, cardIds[0], { zone: 'discard' }, 'lijian');
      // 视为 targets[0] 对 targets[1] 使用决斗,可被无懈可击
      pushTrick(ctx, { cardId: null, effName: 'juedou', source: a.id, target: b.id });
      return;
    }
    case 'qixi': {
      if (!hasSkill(s, p, 'qixi')) fail('你没有奇袭技能');
      if (cardIds.length !== 1) fail('奇袭需要选择一张黑色牌');
      assertInHand(s, p, cardIds[0]);
      if (!isBlack(card(s, cardIds[0]).suit)) fail('奇袭需要黑色牌');
      const t = requireTarget(ctx, p, targets);
      if (t.hand.length + equipCardIds(t).length === 0) fail('目标没有牌可拆');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'qixi' });
      moveCard(ctx, cardIds[0], { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId: cardIds[0], targets: [t.id], as: 'guohe' });
      pushTrick(ctx, { cardId: cardIds[0], effName: 'guohe', source: p.id, target: t.id });
      return;
    }
    default:
      fail(`未知或不可主动发动的技能 ${skill}`);
  }
}
