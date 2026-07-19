// 回合流程与出牌阶段的响应处理。栈为空时 advance 调用 flowRun 推进阶段;
// 栈为空时产生的请求(play / 弃牌 choose-cards)由 flowOnResponse 处理。

import type {
  CardName, DamageElement, PendingRequest, Phase, PlayerId, PlayerState, ResponseData,
} from './types';
import {
  alivePlayers, ask, card, drawCards, emit, equipCardIds, fail, flipToProcessing,
  hasSkill, heal, loseHp, markShaUsage, moveCard, moveCards, orderFrom, player,
  pushFrame,
} from './kernel';
import type { Ctx } from './kernel';
import { equipSlotOf, isBlack, isRed, shaElement } from './deck';
import {
  assertInHand, attackRange, distance, handLimit, kongchengProtected, shaLimit, shaUsed,
} from './rules';
import { pushTrick, registerPlayAs } from './frames';
import { GENERALS } from './generals';

// 蛊惑结算时按声明的牌名走正常出牌逻辑(frames 与 flow 互相依赖,用注入解环)
registerPlayAs((ctx, p, cardId, asName, targets) => playAs(ctx, p, cardId, asName, targets));

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
  // 翻面的角色轮到时翻回并跳过该回合;两圈保证全员翻面时也能找到下一个行动者
  for (let i = 0; i < 2 * n; i++) {
    seat = (seat + 1) % n;
    const next = s.players.find((p) => p.seat === seat)!;
    if (!next.alive) continue;
    if (next.flipped) {
      next.flipped = false;
      emit(ctx, { type: 'flipped', player: next.id, flipped: false });
      continue;
    }
    s.turn = { activePlayer: next.id, phase: 'start', turnNumber: s.turn.turnNumber + 1 };
    emit(ctx, { type: 'turnStarted', player: next.id, turnNumber: s.turn.turnNumber });
    return;
  }
  fail('没有存活玩家');
}

export function flowRun(ctx: Ctx): void {
  const s = ctx.s;
  const p = player(s, s.turn.activePlayer);
  if (!p.alive) { nextTurn(ctx); return; }
  switch (s.turn.phase) {
    case 'start':
      if (!p.flags._start) {
        p.flags._start = true;
        if (hasSkill(s, p, 'guanxing')) {
          pushFrame(ctx, { type: 'guanxing', step: 'ask', player: p.id });
        } else if (hasSkill(s, p, 'luoshen')) {
          pushFrame(ctx, { type: 'luoshen', step: 'ask', player: p.id });
        } else if (hasSkill(s, p, 'yinghun') && p.hp < p.maxHp) {
          pushFrame(ctx, { type: 'yinghun', step: 'start', player: p.id });
        }
        return;
      }
      setPhase(ctx, 'judge');
      return;
    case 'judge':
      // 神速①:跳过判定阶段和摸牌阶段,视为使用一张杀
      if (!p.flags._shensu1 && hasSkill(s, p, 'shensu')) {
        p.flags._shensu1 = true;
        pushFrame(ctx, { type: 'shensu', step: 'wait', player: p.id, variant: 1 });
        return;
      }
      if (!p.flags._judge) {
        p.flags._judge = true;
        if (p.flags.skipJudge) {
          emit(ctx, { type: 'phaseSkipped', player: p.id, phase: 'judge', reason: 'shensu' });
        } else if (p.judgeZone.length > 0) {
          pushFrame(ctx, {
            type: 'delayed', step: 'next', who: p.id,
            queue: [...p.judgeZone].reverse(), // 后放置的先结算
          });
        }
        return;
      }
      setPhase(ctx, 'draw');
      return;
    case 'draw':
      if (!p.flags._draw) {
        p.flags._draw = true;
        if (p.flags.skipDraw) {
          emit(ctx, {
            type: 'phaseSkipped', player: p.id, phase: 'draw',
            reason: p.flags.skipJudge ? 'shensu' : 'bingliang',
          });
        } else if (hasSkill(s, p, 'tuxi') || hasSkill(s, p, 'luoyi')
            || hasSkill(s, p, 'shuangxiong') || hasSkill(s, p, 'haoshi')
            || (hasSkill(s, p, 'zaiqi') && p.hp < p.maxHp)) {
          pushFrame(ctx, { type: 'draw-step', step: 'ask', player: p.id });
        } else {
          let n = 2;
          if (hasSkill(s, p, 'yingzi')) {
            emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'yingzi' });
            n += 1;
          }
          drawCards(ctx, p.id, n);
        }
        return;
      }
      setPhase(ctx, 'play');
      return;
    case 'play':
      if (p.flags.skipPlay && !p.flags.playEnded) {
        emit(ctx, { type: 'phaseSkipped', player: p.id, phase: 'play', reason: 'lebusishu' });
        p.flags.playEnded = true;
      }
      // 神速②:跳过出牌阶段并弃置一张装备牌,视为使用一张杀
      if (!p.flags._shensu2 && !p.flags.playEnded
          && hasSkill(s, p, 'shensu') && equipCardIds(p).length > 0) {
        p.flags._shensu2 = true;
        pushFrame(ctx, { type: 'shensu', step: 'wait', player: p.id, variant: 2 });
        return;
      }
      if (p.flags.playEnded) { setPhase(ctx, 'discard'); return; }
      ask(ctx, { player: p.id, type: 'play' });
      return;
    case 'discard': {
      const excess = p.hand.length - handLimit(s, p);
      if (excess > 0 && hasSkill(s, p, 'keji') && !p.flags.anySha) {
        emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'keji' });
        emit(ctx, { type: 'phaseSkipped', player: p.id, phase: 'discard', reason: 'keji' });
        setPhase(ctx, 'end');
        return;
      }
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
      // 据守:结束阶段可摸三张牌并翻面
      if (!p.flags._end) {
        p.flags._end = true;
        if (hasSkill(s, p, 'jushou')) {
          pushFrame(ctx, { type: 'jushou', step: 'wait', player: p.id });
          return;
        }
        // 崩坏:结束阶段,若董卓不是体力值最小的角色
        if (hasSkill(s, p, 'benghuai')
            && alivePlayers(s).some((x) => x.id !== p.id && x.hp < p.hp)) {
          pushFrame(ctx, { type: 'benghuai', step: 'wait', player: p.id });
          return;
        }
      }
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
      useSkill(ctx, p, resp.skill, resp.cardIds ?? [], resp.targets ?? [], resp.declare);
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

// 帷幕:贾诩不能成为黑色锦囊牌的目标
function assertNotWeimu(ctx: Ctx, cardId: number, t: PlayerState): void {
  if (isBlack(card(ctx.s, cardId).suit) && hasSkill(ctx.s, t, 'weimu')) {
    fail('帷幕:该角色不能成为黑色锦囊牌的目标');
  }
}

// 集智:使用非延时锦囊时摸一张
function afterTrickUse(ctx: Ctx, p: PlayerState): void {
  if (hasSkill(ctx.s, p, 'jizhi')) {
    emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jizhi' });
    drawCards(ctx, p.id, 1);
  }
}

function stealableCount(t: PlayerState): number {
  return t.hand.length + equipCardIds(t).length + t.judgeZone.length;
}

function playCard(ctx: Ctx, p: PlayerState, cardId: number, targets: PlayerId[]): void {
  assertInHand(ctx.s, p, cardId);
  playAs(ctx, p, cardId, card(ctx.s, cardId).name, targets);
}

// 按 name 指定的牌名结算(蛊惑声明的牌名可能与实体牌不同;供 frames 注入调用)
function playAs(ctx: Ctx, p: PlayerState, cardId: number, name: CardName, targets: PlayerId[]): void {
  const s = ctx.s;
  const slot = equipSlotOf(name);
  if (slot) {
    const old = p.equips[slot];
    if (old !== undefined) moveCard(ctx, old, { zone: 'discard' }, 'replace-equip');
    moveCard(ctx, cardId, { zone: 'equip', player: p.id }, 'equip');
    emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
    return;
  }
  switch (name) {
    case 'sha':
    case 'huosha':
    case 'leisha': {
      startSlash(ctx, p, cardId, targets, undefined, [], shaElement(name));
      return;
    }
    case 'jiu': {
      if (p.flags.jiuUsed) fail('每回合限使用一次酒');
      p.flags.jiuUsed = true;
      p.flags.jiuBuff = true; // 本回合下一张杀伤害 +1
      moveCard(ctx, cardId, { zone: 'discard' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
      return;
    }
    case 'huogong': {
      const t = requireTarget(ctx, p, targets, true); // 火攻可以对自己
      if (t.hand.length === 0) fail('目标没有手牌');
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushFrame(ctx, { type: 'huogong', step: 'start', cardId, source: p.id, target: t.id });
      afterTrickUse(ctx, p);
      return;
    }
    case 'tiesuo': {
      if (targets.length === 0) {
        // 重铸:弃置后摸一张
        moveCard(ctx, cardId, { zone: 'discard' }, 'recast');
        emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [], as: 'tiesuo' });
        drawCards(ctx, p.id, 1);
        return;
      }
      if (targets.length > 2 || new Set(targets).size !== targets.length) {
        fail('铁索连环至多指定两名角色');
      }
      for (const pid of targets) {
        const t = player(s, pid);
        if (!t.alive) fail('目标已死亡');
        assertNotWeimu(ctx, cardId, t);
      }
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets });
      pushFrame(ctx, {
        type: 'tiesuo', step: 'next', cardId, source: p.id, queue: [...targets], idx: 0,
      });
      afterTrickUse(ctx, p);
      return;
    }
    case 'bingliang': {
      const t = requireTarget(ctx, p, targets);
      assertNotWeimu(ctx, cardId, t);
      // 断粮:徐晃可对距离 2 的角色使用兵粮寸断
      const maxDist = hasSkill(s, p, 'duanliang') ? 2 : 1;
      if (!hasSkill(s, p, 'qicai') && distance(s, p.id, t.id) > maxDist) {
        fail(`兵粮寸断只能指定距离 ${maxDist} 以内的目标`);
      }
      if (t.judgeZone.some((id) => card(s, id).name === 'bingliang')) {
        fail('目标的判定区已有兵粮寸断');
      }
      moveCard(ctx, cardId, { zone: 'judge', player: t.id }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
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
      afterTrickUse(ctx, p);
      return;
    }
    case 'guohe': {
      const t = requireTarget(ctx, p, targets);
      assertNotWeimu(ctx, cardId, t);
      if (stealableCount(t) === 0) fail('目标没有牌可拆');
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushTrick(ctx, { cardId, effName: 'guohe', source: p.id, target: t.id });
      afterTrickUse(ctx, p);
      return;
    }
    case 'shunshou': {
      const t = requireTarget(ctx, p, targets);
      assertNotWeimu(ctx, cardId, t);
      if (hasSkill(s, t, 'qianxun')) fail('谦逊:该角色不能成为顺手牵羊的目标');
      if (stealableCount(t) === 0) fail('目标没有牌可拿');
      if (!hasSkill(s, p, 'qicai') && distance(s, p.id, t.id) > 1) {
        fail('顺手牵羊只能指定距离 1 以内的目标');
      }
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushTrick(ctx, { cardId, effName: 'shunshou', source: p.id, target: t.id });
      afterTrickUse(ctx, p);
      return;
    }
    case 'juedou': {
      const t = requireTarget(ctx, p, targets);
      assertNotWeimu(ctx, cardId, t);
      if (kongchengProtected(s, t)) fail('空城:该角色不能成为决斗的目标');
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id] });
      pushTrick(ctx, { cardId, effName: 'juedou', source: p.id, target: t.id });
      afterTrickUse(ctx, p);
      return;
    }
    case 'lebusishu': {
      const t = requireTarget(ctx, p, targets);
      placeLebusishu(ctx, p, cardId, t);
      return;
    }
    case 'shandian': {
      if (p.judgeZone.some((id) => card(s, id).name === 'shandian')) {
        fail('你的判定区已有闪电');
      }
      moveCard(ctx, cardId, { zone: 'judge', player: p.id }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
      return;
    }
    case 'nanman':
    case 'wanjian': {
      const queue = orderFrom(s).filter((pid) => pid !== p.id);
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: queue });
      pushFrame(ctx, {
        type: 'aoe', step: 'next', effName: name, cardId, source: p.id, queue, idx: 0,
      });
      afterTrickUse(ctx, p);
      return;
    }
    case 'taoyuan': {
      const queue = orderFrom(s);
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: queue });
      pushFrame(ctx, {
        type: 'aoe', step: 'next', effName: 'taoyuan', cardId, source: p.id, queue, idx: 0,
      });
      afterTrickUse(ctx, p);
      return;
    }
    case 'wugu': {
      const queue = orderFrom(s);
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: queue });
      const shown: number[] = [];
      for (let i = 0; i < queue.length; i++) {
        const id = flipToProcessing(ctx);
        shown.push(id);
        emit(ctx, { type: 'cardRevealed', player: p.id, cardId: id, reason: 'wugu' });
      }
      pushFrame(ctx, {
        type: 'aoe', step: 'next', effName: 'wugu', cardId, source: p.id,
        queue, idx: 0, shownIds: shown,
      });
      afterTrickUse(ctx, p);
      return;
    }
    case 'jiedao': {
      if (targets.length !== 2 || targets[0] === targets[1]) fail('借刀杀人需要选择持武器者与杀的目标');
      const a = player(s, targets[0]);
      const b = player(s, targets[1]);
      if (!a.alive || !b.alive) fail('目标已死亡');
      if (a.id === p.id) fail('不能以自己为借刀目标');
      assertNotWeimu(ctx, cardId, a);
      if (a.equips.weapon === undefined) fail('目标没有装备武器');
      if (kongchengProtected(s, b)) fail('空城:该角色不能成为杀的目标');
      if (distance(s, a.id, b.id) > attackRange(s, a)) fail('杀的目标须在持武器者的攻击范围内');
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [a.id, b.id] });
      pushFrame(ctx, {
        type: 'jiedao', step: 'start', cardId, source: p.id, a: a.id, b: b.id,
      });
      afterTrickUse(ctx, p);
      return;
    }
    default:
      fail(`无法使用 ${name}`);
  }
}

function placeLebusishu(ctx: Ctx, p: PlayerState, cardId: number, t: PlayerState): void {
  const s = ctx.s;
  assertNotWeimu(ctx, cardId, t);
  if (hasSkill(s, t, 'qianxun')) fail('谦逊:该角色不能成为乐不思蜀的目标');
  if (t.judgeZone.some((id) => card(s, id).name === 'lebusishu')) {
    fail('目标的判定区已有乐不思蜀');
  }
  moveCard(ctx, cardId, { zone: 'judge', player: t.id }, 'play');
  emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [t.id], as: 'lebusishu' });
}

function startSlash(
  ctx: Ctx, p: PlayerState, cardId: number, targets: PlayerId[],
  via: 'wusheng' | 'longdan' | 'zhangba' | undefined,
  extraCardIds: number[] = [],
  element?: DamageElement,
): void {
  const s = ctx.s;
  if (p.flags.tianyiLose) fail('天义拼点失败:本回合不能使用杀');
  if (targets.length === 0) fail('需要选择目标');
  if (new Set(targets).size !== targets.length) fail('不能重复选择目标');
  if (targets.length > 1) {
    // 方天画戟:杀是最后的手牌时可指定至多三个目标
    const w = p.equips.weapon;
    const isFangtian = w !== undefined && card(s, w).name === 'fangtian';
    const isLastHand = p.hand.length === 1 && p.hand[0] === cardId;
    if (!isFangtian || !isLastHand) fail('只有方天画戟且杀是最后的手牌时才能指定多个目标');
    if (targets.length > 3) fail('方天画戟至多指定三个目标');
  }
  const ts = targets.map((id) => player(s, id));
  for (const t of ts) {
    if (!t.alive) fail('目标已死亡');
    if (t.id === p.id) fail('不能对自己使用杀');
    if (kongchengProtected(s, t)) fail('空城:该角色不能成为杀的目标');
    // 天义拼点赢:本回合使用杀无距离限制
    if (!p.flags.tianyiWin && distance(s, p.id, t.id) > attackRange(s, p)) {
      fail('目标超出攻击范围');
    }
  }
  if (shaUsed(p) >= shaLimit(s, p)) fail('本回合使用杀的次数已用完');
  p.flags.sha = shaUsed(p) + 1;
  markShaUsage(ctx, p.id);
  const jiuBonus = !!p.flags.jiuBuff;
  p.flags.jiuBuff = false; // 酒的增益附着在这张杀上
  moveCard(ctx, cardId, { zone: 'processing' }, 'play');
  for (const id of extraCardIds) moveCard(ctx, id, { zone: 'processing' }, 'play');
  emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets, as: via ? 'sha' : undefined });
  if (via) emit(ctx, { type: 'skillInvoked', player: p.id, skill: via });
  if (targets.length > 1) emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'fangtian' });
  // 逆序压栈:先结算第一个目标;牌在全部结算完后由最后弹出的帧弃置
  for (let i = targets.length - 1; i >= 0; i--) {
    ctx.s.stack.push({
      type: 'slash', step: 'start', source: p.id, target: targets[i], cardId,
      extraCardIds: extraCardIds.length > 0 ? [...extraCardIds] : undefined,
      noSuit: via === 'zhangba' ? true : undefined,
      jiuBonus: jiuBonus ? true : undefined,
      element,
    });
  }
}

// 蛊惑可声明的牌名:基本牌(闪/无懈只能响应时用,不可声明)与非延时锦囊
const GUHUO_DECLARABLE: CardName[] = [
  'sha', 'huosha', 'leisha', 'tao', 'jiu',
  'guohe', 'shunshou', 'wuzhong', 'juedou', 'nanman', 'wanjian', 'wugu',
  'taoyuan', 'jiedao', 'huogong', 'tiesuo',
];

function useSkill(
  ctx: Ctx, p: PlayerState, skill: string, cardIds: number[], targets: PlayerId[],
  declare?: CardName,
): void {
  const s = ctx.s;
  switch (skill) {
    case 'wusheng': {
      if (!hasSkill(s, p, 'wusheng')) fail('你没有武圣技能');
      if (cardIds.length !== 1) fail('武圣需要选择一张红色牌');
      assertInHand(s, p, cardIds[0]);
      if (!isRed(card(s, cardIds[0]).suit)) fail('武圣需要红色牌');
      startSlash(ctx, p, cardIds[0], targets, 'wusheng');
      return;
    }
    case 'longdan': {
      if (!hasSkill(s, p, 'longdan')) fail('你没有龙胆技能');
      if (cardIds.length !== 1) fail('龙胆需要选择一张闪');
      assertInHand(s, p, cardIds[0]);
      if (card(s, cardIds[0]).name !== 'shan') fail('龙胆出牌时需将闪当杀使用');
      startSlash(ctx, p, cardIds[0], targets, 'longdan');
      return;
    }
    case 'rende': {
      if (!hasSkill(s, p, 'rende')) fail('你没有仁德技能');
      if (cardIds.length === 0) fail('仁德需要至少选择一张手牌');
      for (const id of cardIds) assertInHand(s, p, id);
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      const t = requireTarget(ctx, p, targets);
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'rende' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
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
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
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
      if (kongchengProtected(s, b)) fail('空城:该角色不能成为决斗的目标');
      p.flags.lijian = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'lijian' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [a.id, b.id] });
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
      if (stealableCount(t) === 0) fail('目标没有牌可拆');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'qixi' });
      moveCard(ctx, cardIds[0], { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId: cardIds[0], targets: [t.id], as: 'guohe' });
      pushTrick(ctx, { cardId: cardIds[0], effName: 'guohe', source: p.id, target: t.id });
      return;
    }
    case 'guose': {
      if (!hasSkill(s, p, 'guose')) fail('你没有国色技能');
      if (cardIds.length !== 1) fail('国色需要选择一张方块牌');
      const cid = cardIds[0];
      if (!p.hand.includes(cid) && !equipCardIds(p).includes(cid)) fail('所选牌不属于你');
      if (card(s, cid).suit !== 'diamond') fail('国色需要方块牌');
      const t = requireTarget(ctx, p, targets);
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'guose' });
      placeLebusishu(ctx, p, cid, t);
      return;
    }
    case 'kurou': {
      if (!hasSkill(s, p, 'kurou')) fail('你没有苦肉技能');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'kurou' });
      pushFrame(ctx, { type: 'kurou', step: 'draw', player: p.id });
      loseHp(ctx, p.id, 1); // 若进入濒死,先结算濒死再摸牌
      return;
    }
    case 'jieyin': {
      if (!hasSkill(s, p, 'jieyin')) fail('你没有结姻技能');
      if (p.flags.jieyin) fail('结姻每回合限一次');
      if (cardIds.length !== 2) fail('结姻需要弃置两张手牌');
      validateChosenHand(p, cardIds, 2, 2);
      const t = requireTarget(ctx, p, targets);
      if (GENERALS[t.general].gender !== 'm') fail('结姻只能指定男性角色');
      if (t.hp >= t.maxHp) fail('目标未受伤');
      p.flags.jieyin = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jieyin' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      moveCards(ctx, cardIds, { zone: 'discard' }, 'jieyin');
      heal(ctx, t.id, 1);
      heal(ctx, p.id, 1);
      return;
    }
    case 'zhangba': {
      const w = p.equips.weapon;
      if (w === undefined || card(s, w).name !== 'zhangba') fail('你没有装备丈八蛇矛');
      if (cardIds.length !== 2 || new Set(cardIds).size !== 2) fail('丈八蛇矛需要两张手牌');
      for (const id of cardIds) assertInHand(s, p, id);
      startSlash(ctx, p, cardIds[0], targets, 'zhangba', [cardIds[1]]);
      return;
    }
    case 'fanjian': {
      if (!hasSkill(s, p, 'fanjian')) fail('你没有反间技能');
      if (p.flags.fanjian) fail('反间每回合限一次');
      if (p.hand.length === 0) fail('反间需要有手牌');
      const t = requireTarget(ctx, p, targets);
      p.flags.fanjian = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'fanjian' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      pushFrame(ctx, { type: 'fanjian', step: 'suit-wait', source: p.id, target: t.id });
      ask(ctx, {
        player: t.id, type: 'choose-option',
        options: ['spade', 'heart', 'club', 'diamond'], canDecline: false, reason: 'fanjian-suit',
      });
      return;
    }
    case 'qiangxi': {
      if (!hasSkill(s, p, 'qiangxi')) fail('你没有强袭技能');
      if (p.flags.qiangxi) fail('强袭每阶段限一次');
      const t = requireTarget(ctx, p, targets);
      if (distance(s, p.id, t.id) > attackRange(s, p)) fail('目标超出攻击范围');
      if (cardIds.length > 1) fail('强袭至多弃置一张武器牌');
      if (cardIds.length === 1) {
        const cid = cardIds[0];
        if (!p.hand.includes(cid) && p.equips.weapon !== cid) fail('所选牌不属于你');
        if (equipSlotOf(card(s, cid).name) !== 'weapon') fail('强袭需要弃置武器牌');
      }
      p.flags.qiangxi = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'qiangxi' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      if (cardIds.length === 1) moveCard(ctx, cardIds[0], { zone: 'discard' }, 'qiangxi');
      pushFrame(ctx, {
        type: 'damage', step: 'pre', source: p.id, target: t.id, amount: 1, causeCardIds: [],
      });
      if (cardIds.length === 0) loseHp(ctx, p.id, 1); // 濒死先于伤害结算
      return;
    }
    case 'quhu': {
      if (!hasSkill(s, p, 'quhu')) fail('你没有驱虎技能');
      if (p.flags.quhu) fail('驱虎每回合限一次');
      const t = requireTarget(ctx, p, targets);
      if (t.hp <= p.hp) fail('驱虎只能指定体力值比你高的角色');
      if (p.hand.length === 0 || t.hand.length === 0) fail('拼点双方都需要有手牌');
      p.flags.quhu = true;
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      pushFrame(ctx, { type: 'quhu', step: 'start', source: p.id, target: t.id });
      return;
    }
    case 'tianyi': {
      if (!hasSkill(s, p, 'tianyi')) fail('你没有天义技能');
      if (p.flags.tianyi) fail('天义每回合限一次');
      const t = requireTarget(ctx, p, targets);
      if (p.hand.length === 0 || t.hand.length === 0) fail('拼点双方都需要有手牌');
      p.flags.tianyi = true;
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      pushFrame(ctx, { type: 'tianyi', step: 'start', source: p.id, target: t.id });
      return;
    }
    case 'lianhuan': {
      if (!hasSkill(s, p, 'lianhuan')) fail('你没有连环技能');
      if (cardIds.length !== 1) fail('连环需要选择一张梅花手牌');
      assertInHand(s, p, cardIds[0]);
      if (card(s, cardIds[0]).suit !== 'club') fail('连环需要梅花牌');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'lianhuan' });
      playAs(ctx, p, cardIds[0], 'tiesuo', targets);
      return;
    }
    case 'huoji': {
      if (!hasSkill(s, p, 'huoji')) fail('你没有火计技能');
      if (cardIds.length !== 1) fail('火计需要选择一张红色手牌');
      assertInHand(s, p, cardIds[0]);
      if (!isRed(card(s, cardIds[0]).suit)) fail('火计需要红色牌');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'huoji' });
      playAs(ctx, p, cardIds[0], 'huogong', targets);
      return;
    }
    case 'shuangxiong': {
      const judged = p.flags.shuangxiong;
      if (typeof judged !== 'number') fail('本回合未发动双雄,不能转化决斗');
      if (cardIds.length !== 1) fail('双雄需要选择一张手牌');
      assertInHand(s, p, cardIds[0]);
      if (isRed(card(s, cardIds[0]).suit) === isRed(card(s, judged).suit)) {
        fail('双雄需要与判定牌颜色不同的手牌');
      }
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'shuangxiong' });
      playAs(ctx, p, cardIds[0], 'juedou', targets);
      return;
    }
    case 'luanji': {
      if (!hasSkill(s, p, 'luanji')) fail('你没有乱击技能');
      if (cardIds.length !== 2 || new Set(cardIds).size !== 2) fail('乱击需要两张相同花色的手牌');
      for (const id of cardIds) assertInHand(s, p, id);
      if (card(s, cardIds[0]).suit !== card(s, cardIds[1]).suit) fail('乱击需要相同花色');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'luanji' });
      const queue = orderFrom(s).filter((pid) => pid !== p.id);
      moveCards(ctx, cardIds, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId: cardIds[0], targets: queue, as: 'wanjian' });
      pushFrame(ctx, {
        type: 'aoe', step: 'next', effName: 'wanjian', cardId: cardIds[0],
        extraCardIds: [cardIds[1]], source: p.id, queue, idx: 0,
      });
      return;
    }
    case 'duanliang': {
      if (!hasSkill(s, p, 'duanliang')) fail('你没有断粮技能');
      if (cardIds.length !== 1) fail('断粮需要选择一张黑色基本牌或装备牌');
      assertInHand(s, p, cardIds[0]);
      const c = card(s, cardIds[0]);
      if (!isBlack(c.suit)) fail('断粮需要黑色牌');
      const basic = ['sha', 'huosha', 'leisha', 'shan', 'tao', 'jiu'].includes(c.name);
      if (!basic && equipSlotOf(c.name) === null) fail('断粮需要基本牌或装备牌');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'duanliang' });
      playAs(ctx, p, cardIds[0], 'bingliang', targets);
      return;
    }
    case 'dimeng': {
      if (!hasSkill(s, p, 'dimeng')) fail('你没有缔盟技能');
      if (p.flags.dimeng) fail('缔盟每回合限一次');
      if (targets.length !== 2 || targets[0] === targets[1]) fail('缔盟需要选择两名其他角色');
      const [a, b] = targets.map((id) => player(s, id));
      for (const t of [a, b]) {
        if (!t.alive) fail('目标已死亡');
        if (t.id === p.id) fail('缔盟不能以自己为目标');
      }
      const diff = Math.abs(a.hand.length - b.hand.length);
      if (cardIds.length !== diff) fail(`缔盟需要弃置 ${diff} 张牌(两者手牌数之差)`);
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      for (const id of cardIds) {
        if (!p.hand.includes(id) && !equipCardIds(p).includes(id)) fail('所选牌不属于你');
      }
      p.flags.dimeng = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'dimeng' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [a.id, b.id] });
      if (cardIds.length > 0) moveCards(ctx, cardIds, { zone: 'discard' }, 'dimeng');
      const aHand = [...a.hand];
      const bHand = [...b.hand];
      if (aHand.length > 0) moveCards(ctx, aHand, { zone: 'hand', player: b.id }, 'dimeng');
      if (bHand.length > 0) moveCards(ctx, bHand, { zone: 'hand', player: a.id }, 'dimeng');
      return;
    }
    case 'jiuchi': {
      if (!hasSkill(s, p, 'jiuchi')) fail('你没有酒池技能');
      if (cardIds.length !== 1) fail('酒池需要选择一张黑桃手牌');
      assertInHand(s, p, cardIds[0]);
      if (card(s, cardIds[0]).suit !== 'spade') fail('酒池需要黑桃牌');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jiuchi' });
      playAs(ctx, p, cardIds[0], 'jiu', targets);
      return;
    }
    case 'luanwu': {
      if (!hasSkill(s, p, 'luanwu')) fail('你没有乱武技能');
      if ((p.usedLimit ?? []).includes('luanwu')) fail('乱武是限定技,已发动过');
      p.usedLimit = [...(p.usedLimit ?? []), 'luanwu'];
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'luanwu' });
      const queue = orderFrom(s).filter((pid) => pid !== p.id);
      emit(ctx, { type: 'targeted', source: p.id, targets: queue });
      pushFrame(ctx, { type: 'luanwu', step: 'next', source: p.id, queue, idx: 0 });
      return;
    }
    case 'guhuo': {
      if (!hasSkill(s, p, 'guhuo')) fail('你没有蛊惑技能');
      if (!declare || !GUHUO_DECLARABLE.includes(declare)) {
        fail('蛊惑需要声明一种基本牌或非延时锦囊');
      }
      if (cardIds.length !== 1) fail('蛊惑需要扣置一张手牌');
      assertInHand(s, p, cardIds[0]);
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'guhuo' });
      emit(ctx, { type: 'virtualCard', player: p.id, as: declare, targets });
      // 牌暂留手中(扣置,不公开);质疑流程结束后翻开,按声明结算或作废
      pushFrame(ctx, {
        type: 'guhuo', step: 'next', player: p.id, cardId: cardIds[0],
        declared: declare, targets: [...targets],
        queue: orderFrom(s).filter((pid) => pid !== p.id), idx: 0,
      });
      return;
    }
    default:
      fail(`未知或不可主动发动的技能 ${skill}`);
  }
}
