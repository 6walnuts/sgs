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
import { equipSlotOf, isBlack, isRed, isShaCard, shaElement } from './deck';
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
  // 智迟的免疫只持续到该回合结束;义绝的技能压制同理
  for (const x of s.players) {
    delete x.flags.zhichi;
    delete x.flags.yijueOff;
  }
  // 放权:额外回合插在这里;结束后从刘禅的下一位继续
  if (s.extraTurn && !s.extraTurn.active) {
    const et = s.extraTurn;
    if (player(s, et.player).alive) {
      et.active = true;
      s.turn = { activePlayer: et.player, phase: 'start', turnNumber: s.turn.turnNumber + 1 };
      emit(ctx, { type: 'turnStarted', player: et.player, turnNumber: s.turn.turnNumber });
      return;
    }
    delete s.extraTurn;
  }
  const n = s.players.length;
  let seat = cur.seat;
  if (s.extraTurn?.active) {
    seat = s.extraTurn.resumeSeat;
    delete s.extraTurn;
  }
  // 翻面的角色轮到时翻回并跳过该回合;两圈保证全员翻面时也能找到下一个行动者
  for (let i = 0; i < 2 * n; i++) {
    seat = (seat + 1) % n;
    const next = s.players.find((p) => p.seat === seat)!;
    if (!next.alive) continue;
    if (next.flipped) {
      next.flipped = false;
      emit(ctx, { type: 'flipped', player: next.id, flipped: false });
      // 解围(界曹仁):武将牌翻至正面后,可移动场上的一张牌
      if (hasSkill(s, next, 'jiewei')) {
        s.stack.push({ type: 'qiaobian', step: 'move-start', player: next.id, phase: 'play' });
      }
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
        // 觉醒技(锁定,自动):凿险/魂姿
        const awakened = p.usedLimit ?? [];
        if (hasSkill(s, p, 'zaoxian') && !awakened.includes('zaoxian')
            && (p.tian?.length ?? 0) >= 3) {
          emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'zaoxian' });
          p.usedLimit = [...awakened, 'zaoxian'];
          p.maxHp -= 1;
          if (p.hp > p.maxHp) p.hp = p.maxHp;
          emit(ctx, { type: 'hpChanged', player: p.id, hp: p.hp, delta: 0 });
        }
        if (hasSkill(s, p, 'hunzi') && !(p.usedLimit ?? []).includes('hunzi') && p.hp === 1) {
          emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'hunzi' });
          p.usedLimit = [...(p.usedLimit ?? []), 'hunzi'];
          p.maxHp -= 1;
          if (p.hp > p.maxHp) p.hp = p.maxHp;
          emit(ctx, { type: 'hpChanged', player: p.id, hp: p.hp, delta: 0 });
        }
        // 勤学(界吕蒙,觉醒):手牌数-体力值达标则减 1 点体力上限,获得攻心
        const qxGap = s.players.length >= 7 ? 2 : 3;
        if (hasSkill(s, p, 'qinxue') && !(p.usedLimit ?? []).includes('qinxue')
            && p.hand.length - p.hp >= qxGap) {
          emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'qinxue' });
          p.usedLimit = [...(p.usedLimit ?? []), 'qinxue'];
          p.maxHp -= 1;
          if (p.hp > p.maxHp) p.hp = p.maxHp;
          emit(ctx, { type: 'hpChanged', player: p.id, hp: p.hp, delta: 0 });
        }
        // 志继(觉醒,需选择回复或摸牌)
        if (hasSkill(s, p, 'zhiji') && !(p.usedLimit ?? []).includes('zhiji')
            && p.hand.length === 0) {
          pushFrame(ctx, { type: 'zhiji', step: 'wait', player: p.id });
        }
        if (hasSkill(s, p, 'guanxing') || hasSkill(s, p, 'jguanxing')) {
          pushFrame(ctx, { type: 'guanxing', step: 'ask', player: p.id });
        } else if (hasSkill(s, p, 'luoshen') || hasSkill(s, p, 'jluoshen')) {
          pushFrame(ctx, { type: 'luoshen', step: 'ask', player: p.id });
        } else if (hasSkill(s, p, 'yinghun') && p.hp < p.maxHp) {
          pushFrame(ctx, { type: 'yinghun', step: 'start', player: p.id });
        }
        // 化身:左慈每回合准备阶段可重新声明化身技能(压在最上,先处理)
        if (hasSkill(s, p, 'huashen') && (p.huashen?.length ?? 0) > 0) {
          pushFrame(ctx, { type: 'huashen', step: 'wait', player: p.id });
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
      // 巧变:弃一张手牌跳过判定阶段
      if (!p.flags._qbJudge && !p.flags._judge && hasSkill(s, p, 'qiaobian')
          && p.hand.length > 0) {
        p.flags._qbJudge = true;
        pushFrame(ctx, { type: 'qiaobian', step: 'ask', player: p.id, phase: 'judge' });
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
      if (!p.flags._qbDraw && !p.flags._draw && hasSkill(s, p, 'qiaobian')
          && p.hand.length > 0) {
        p.flags._qbDraw = true;
        pushFrame(ctx, { type: 'qiaobian', step: 'ask', player: p.id, phase: 'draw' });
        return;
      }
      if (!p.flags._draw) {
        p.flags._draw = true;
        if (p.flags.skipDraw) {
          emit(ctx, {
            type: 'phaseSkipped', player: p.id, phase: 'draw',
            reason: p.flags.skipJudge ? 'shensu' : 'bingliang',
          });
        } else if (hasSkill(s, p, 'tuxi') || hasSkill(s, p, 'jtuxi')
            || hasSkill(s, p, 'luoyi') || hasSkill(s, p, 'jluoyi')
            || hasSkill(s, p, 'shuangxiong') || hasSkill(s, p, 'haoshi')
            || hasSkill(s, p, 'shelie')
            || (hasSkill(s, p, 'zaiqi') && p.hp < p.maxHp)) {
          pushFrame(ctx, { type: 'draw-step', step: 'ask', player: p.id });
        } else {
          let n = 2;
          if (hasSkill(s, p, 'yingzi') || hasSkill(s, p, 'jyingzi')) {
            emit(ctx, {
              type: 'skillInvoked', player: p.id,
              skill: hasSkill(s, p, 'jyingzi') ? 'jyingzi' : 'yingzi',
            });
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
      if (!p.flags._qbPlay && !p.flags.playEnded && hasSkill(s, p, 'qiaobian')
          && p.hand.length > 0) {
        p.flags._qbPlay = true;
        pushFrame(ctx, { type: 'qiaobian', step: 'ask', player: p.id, phase: 'play' });
        return;
      }
      // 放权:刘禅可跳过出牌阶段(结束阶段可弃一张手牌授予额外回合)
      if (!p.flags._fangquan && !p.flags.playEnded && hasSkill(s, p, 'fangquan')) {
        p.flags._fangquan = true;
        pushFrame(ctx, { type: 'fangquan', step: 'skip-wait', player: p.id });
        return;
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
      if (p.flags.qbSkipDiscard) {
        setPhase(ctx, 'end');
        return;
      }
      // 神速③(界夏侯渊):跳过弃牌阶段并翻面,视为使用一张杀
      if (!p.flags._shensu3 && hasSkill(s, p, 'shensu3')
          && p.hand.length > handLimit(s, p)) {
        p.flags._shensu3 = true;
        pushFrame(ctx, { type: 'shensu', step: 'wait', player: p.id, variant: 3 });
        return;
      }
      if (!p.flags._qbDiscard && hasSkill(s, p, 'qiaobian') && p.hand.length > 0
          && p.hand.length > handLimit(s, p)) {
        p.flags._qbDiscard = true;
        pushFrame(ctx, { type: 'qiaobian', step: 'ask', player: p.id, phase: 'discard' });
        return;
      }
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
        if (hasSkill(s, p, 'jushou') || hasSkill(s, p, 'jjushou')) {
          pushFrame(ctx, { type: 'jushou', step: 'wait', player: p.id });
          return;
        }
        // 奋激(界周泰):一名角色结束阶段没有手牌时,可失去 1 点体力令其摸两张
        if (p.hand.length === 0) {
          const zt = alivePlayers(s).find((x) => hasSkill(s, x, 'fenji') && x.hp >= 1);
          if (zt) {
            pushFrame(ctx, { type: 'fenji', step: 'wait', holder: zt.id, who: p.id });
            return;
          }
        }
        // 崩坏:结束阶段,若董卓不是体力值最小的角色
        if (hasSkill(s, p, 'benghuai')
            && alivePlayers(s).some((x) => x.id !== p.id && x.hp < p.hp)) {
          pushFrame(ctx, { type: 'benghuai', step: 'wait', player: p.id });
          return;
        }
        // 放权:跳过了出牌阶段,可弃一张手牌令他人获得额外回合
        if (p.flags.fangquan && p.hand.length > 0) {
          delete p.flags.fangquan;
          pushFrame(ctx, { type: 'fangquan', step: 'card-wait', player: p.id });
          return;
        }
      }
      if (hasSkill(s, p, 'biyue')) {
        emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'biyue' });
        drawCards(ctx, p.id, 1);
      }
      // 界闭月:结束阶段摸一张;没有手牌则摸两张
      if (hasSkill(s, p, 'jbiyue')) {
        emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jbiyue' });
        drawCards(ctx, p.id, p.hand.length === 0 ? 2 : 1);
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
    // 固政:张昭张纮可返还其一张弃牌并获得其余
    const holder = alivePlayers(s).find((x) => x.id !== p.id && hasSkill(s, x, 'guzheng'));
    if (holder) {
      pushFrame(ctx, {
        type: 'guzheng', step: 'ask', holder: holder.id, who: p.id, cards: [...resp.cardIds],
      });
    }
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

// 无言:徐庶使用的非延时锦囊无效(简化为不能使用),他人的非延时锦囊对其无效(简化为不能指定)
function assertNotWuyan(ctx: Ctx, p: PlayerState, t?: PlayerState): void {
  if (hasSkill(ctx.s, p, 'wuyan')) fail('无言:你不能使用非延时锦囊');
  if (t && t.id !== p.id && hasSkill(ctx.s, t, 'wuyan')) {
    fail('无言:该角色不能成为非延时锦囊的目标');
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
  let name = card(ctx.s, cardId).name;
  // 禁酒:高顺的酒均视为杀
  if (name === 'jiu' && hasSkill(ctx.s, p, 'jinjiu')) {
    emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jinjiu' });
    name = 'sha';
  }
  // 武神:神关羽的红桃手牌均视为杀(锁定技)
  if (card(ctx.s, cardId).suit === 'heart' && name !== 'sha'
      && hasSkill(ctx.s, p, 'wushen')) {
    emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'wushen' });
    name = 'sha';
  }
  playAs(ctx, p, cardId, name, targets);
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
      assertNotWuyan(ctx, p, targets.length === 1 ? player(s, targets[0]) : undefined);
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
      assertNotWuyan(ctx, p);
      for (const pid of targets) assertNotWuyan(ctx, p, player(s, pid));
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
      assertNotWuyan(ctx, p);
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: [p.id] });
      pushTrick(ctx, { cardId, effName: 'wuzhong', source: p.id, target: p.id });
      afterTrickUse(ctx, p);
      return;
    }
    case 'guohe': {
      const t = requireTarget(ctx, p, targets);
      assertNotWeimu(ctx, cardId, t);
      assertNotWuyan(ctx, p, t);
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
      assertNotWuyan(ctx, p, t);
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
      assertNotWuyan(ctx, p, t);
      if (kongchengProtected(s, t)) fail('空城:该角色不能成为决斗的目标');
      for (const who of [p, t]) {
        if (hasSkill(s, who, 'jiang')) {
          emit(ctx, { type: 'skillInvoked', player: who.id, skill: 'jiang' });
          drawCards(ctx, who.id, 1);
        }
      }
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
      assertNotWuyan(ctx, p);
      const queue = orderFrom(s)
        .filter((pid) => pid !== p.id && !hasSkill(s, player(s, pid), 'wuyan'));
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: queue });
      pushFrame(ctx, {
        type: 'aoe', step: 'next', effName: name, cardId, source: p.id, queue, idx: 0,
      });
      afterTrickUse(ctx, p);
      return;
    }
    case 'taoyuan': {
      assertNotWuyan(ctx, p);
      const queue = orderFrom(s).filter((pid) => !hasSkill(s, player(s, pid), 'wuyan'));
      moveCard(ctx, cardId, { zone: 'processing' }, 'play');
      emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets: queue });
      pushFrame(ctx, {
        type: 'aoe', step: 'next', effName: 'taoyuan', cardId, source: p.id, queue, idx: 0,
      });
      afterTrickUse(ctx, p);
      return;
    }
    case 'wugu': {
      assertNotWuyan(ctx, p);
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
      assertNotWuyan(ctx, p, targets.length >= 1 ? player(s, targets[0]) : undefined);
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
  via: 'wusheng' | 'jwusheng' | 'longdan' | 'zhangba' | undefined,
  extraCardIds: number[] = [],
  element?: DamageElement,
): void {
  const s = ctx.s;
  if (p.flags.tianyiLose) fail('天义拼点失败:本回合不能使用杀');
  if (p.flags.xianzhenLose) fail('陷阵拼点失败:本回合不能使用杀');
  if (targets.length === 0) fail('需要选择目标');
  if (new Set(targets).size !== targets.length) fail('不能重复选择目标');
  // 陷阵拼点赢:对该角色使用杀无距离限制、不限次数、无视防具
  const xzSeat = typeof p.flags.xianzhen === 'number' ? p.flags.xianzhen : null;
  const xianzhen = xzSeat !== null
    && targets.every((t) => player(s, t).seat === xzSeat);
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
    // 天义/陷阵拼点赢:本回合使用杀无距离限制
    // 界武圣:方块杀无距离限制;界咆哮:本回合用过杀后无距离限制
    // 诈降:红杀无距离限制;界烈弓:距离不大于杀的点数即可
    const noDist = p.flags.tianyiWin || xianzhen
      || (via === 'jwusheng' && card(s, cardId).suit === 'diamond')
      || (hasSkill(s, p, 'jpaoxiao') && !!p.flags.anySha)
      || (p.flags.zhaxiang && isRed(card(s, cardId).suit))
      || (hasSkill(s, p, 'jliegong') && distance(s, p.id, t.id) <= card(s, cardId).rank);
    if (!noDist && distance(s, p.id, t.id) > attackRange(s, p)) {
      fail('目标超出攻击范围');
    }
  }
  if (!xianzhen && shaUsed(p) >= shaLimit(s, p)) fail('本回合使用杀的次数已用完');
  if (!xianzhen) p.flags.sha = shaUsed(p) + 1;
  markShaUsage(ctx, p.id);
  const jiuBonus = !!p.flags.jiuBuff;
  p.flags.jiuBuff = false; // 酒的增益附着在这张杀上
  moveCard(ctx, cardId, { zone: 'processing' }, 'play');
  for (const id of extraCardIds) moveCard(ctx, id, { zone: 'processing' }, 'play');
  emit(ctx, { type: 'cardPlayed', player: p.id, cardId, targets, as: via ? 'sha' : undefined });
  if (via) emit(ctx, { type: 'skillInvoked', player: p.id, skill: via });
  // 激昂:孙策使用红色杀、或被指定为红色杀的目标时摸一张
  if (isRed(card(s, cardId).suit)) {
    if (hasSkill(s, p, 'jiang')) {
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jiang' });
      drawCards(ctx, p.id, 1);
    }
    for (const tid of targets) {
      const t = player(s, tid);
      if (hasSkill(s, t, 'jiang')) {
        emit(ctx, { type: 'skillInvoked', player: tid, skill: 'jiang' });
        drawCards(ctx, tid, 1);
      }
    }
  }
  if (targets.length > 1) emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'fangtian' });
  // 逆序压栈:先结算第一个目标;牌在全部结算完后由最后弹出的帧弃置
  for (let i = targets.length - 1; i >= 0; i--) {
    ctx.s.stack.push({
      type: 'slash', step: 'start', source: p.id, target: targets[i], cardId,
      extraCardIds: extraCardIds.length > 0 ? [...extraCardIds] : undefined,
      noSuit: via === 'zhangba' ? true : undefined,
      jiuBonus: jiuBonus ? true : undefined,
      ignoreArmor: xianzhen ? true : undefined,
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
    case 'jiushi': {
      if (!hasSkill(s, p, 'jiushi')) fail('你没有酒诗技能');
      if (p.flipped) fail('武将牌背面朝上时不能发动酒诗');
      if (p.flags.jiuUsed) fail('每回合限使用一次酒');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jiushi' });
      p.flipped = true;
      emit(ctx, { type: 'flipped', player: p.id, flipped: true });
      emit(ctx, { type: 'virtualCard', player: p.id, as: 'jiu', targets: [p.id] });
      p.flags.jiuUsed = true;
      p.flags.jiuBuff = true;
      return;
    }
    case 'xuanhuo': {
      if (!hasSkill(s, p, 'xuanhuo')) fail('你没有眩惑技能');
      if (p.flags.xuanhuo) fail('眩惑每回合限一次');
      if (cardIds.length !== 1) fail('眩惑需要交出一张红桃手牌');
      assertInHand(s, p, cardIds[0]);
      if (card(s, cardIds[0]).suit !== 'heart') fail('眩惑需要红桃手牌');
      const t = requireTarget(ctx, p, targets);
      p.flags.xuanhuo = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'xuanhuo' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      moveCard(ctx, cardIds[0], { zone: 'hand', player: t.id }, 'xuanhuo');
      pushFrame(ctx, { type: 'xuanhuo', step: 'pick-wait', source: p.id, target: t.id });
      return;
    }
    case 'xinzhan': {
      if (!hasSkill(s, p, 'xinzhan')) fail('你没有心战技能');
      if (p.flags.xinzhan) fail('心战每回合限一次');
      if (p.hand.length <= p.maxHp) fail('心战需要手牌数大于体力上限');
      p.flags.xinzhan = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'xinzhan' });
      // 观看牌堆顶三张,自动获得其中的红桃,其余按原顺序留在牌堆顶(简化)
      const top = s.drawPile.slice(0, 3);
      for (const cid of top) {
        if (card(s, cid).suit === 'heart') {
          emit(ctx, { type: 'cardRevealed', player: p.id, cardId: cid, reason: 'xinzhan' });
          moveCard(ctx, cid, { zone: 'hand', player: p.id }, 'xinzhan');
        }
      }
      return;
    }
    case 'jujian': {
      if (!hasSkill(s, p, 'jujian')) fail('你没有举荐技能');
      if (p.flags.jujian) fail('举荐每回合限一次');
      if (cardIds.length < 1 || cardIds.length > 3) fail('举荐需要弃置一至三张牌');
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      for (const id of cardIds) {
        if (!p.hand.includes(id) && !equipCardIds(p).includes(id)) fail('所选牌不属于你');
      }
      const t = requireTarget(ctx, p, targets);
      p.flags.jujian = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jujian' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      const category = (id: number): string => {
        const n = card(s, id).name;
        if (['sha', 'huosha', 'leisha', 'shan', 'tao', 'jiu'].includes(n)) return 'basic';
        return equipSlotOf(n) !== null ? 'equip' : 'trick';
      };
      const sameKind = cardIds.length === 3
        && new Set(cardIds.map(category)).size === 1;
      moveCards(ctx, cardIds, { zone: 'discard' }, 'jujian');
      drawCards(ctx, t.id, cardIds.length);
      if (sameKind) heal(ctx, p.id, 1);
      return;
    }
    case 'ganlu': {
      if (!hasSkill(s, p, 'ganlu')) fail('你没有甘露技能');
      if (p.flags.ganlu) fail('甘露每回合限一次');
      if (targets.length !== 2 || targets[0] === targets[1]) fail('甘露需要选择两名角色');
      const [a, b] = targets.map((id) => player(s, id));
      if (!a.alive || !b.alive) fail('目标已死亡');
      const ea = equipCardIds(a);
      const eb = equipCardIds(b);
      if (Math.abs(ea.length - eb.length) > p.maxHp - p.hp) {
        fail('甘露:交换的装备数之差不能超过你已损失的体力值');
      }
      p.flags.ganlu = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'ganlu' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [a.id, b.id] });
      if (ea.length > 0) moveCards(ctx, ea, { zone: 'processing' }, 'ganlu');
      if (eb.length > 0) moveCards(ctx, eb, { zone: 'processing' }, 'ganlu');
      for (const id of ea) moveCard(ctx, id, { zone: 'equip', player: b.id }, 'ganlu');
      for (const id of eb) moveCard(ctx, id, { zone: 'equip', player: a.id }, 'ganlu');
      return;
    }
    case 'mingce': {
      if (!hasSkill(s, p, 'mingce')) fail('你没有明策技能');
      if (p.flags.mingce) fail('明策每回合限一次');
      if (cardIds.length !== 1) fail('明策需要交出一张装备牌或杀');
      const cid = cardIds[0];
      if (!p.hand.includes(cid) && !equipCardIds(p).includes(cid)) fail('所选牌不属于你');
      const cname = card(s, cid).name;
      if (!isShaCard(cname) && equipSlotOf(cname) === null) fail('明策需要装备牌或杀');
      if (targets.length !== 2 || targets[0] === targets[1]) fail('明策需要选择受赠者与杀的目标');
      const receiver = player(s, targets[0]);
      const victim = player(s, targets[1]);
      if (!receiver.alive || !victim.alive) fail('目标已死亡');
      if (receiver.id === p.id) fail('明策不能以自己为受赠者');
      if (distance(s, receiver.id, victim.id) > attackRange(s, receiver)) {
        fail('杀的目标须在受赠者的攻击范围内');
      }
      p.flags.mingce = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'mingce' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [receiver.id, victim.id] });
      moveCard(ctx, cid, { zone: 'hand', player: receiver.id }, 'mingce');
      pushFrame(ctx, {
        type: 'mingce', step: 'wait', source: p.id, receiver: receiver.id, target: victim.id,
      });
      return;
    }
    case 'xianzhen': {
      if (!hasSkill(s, p, 'xianzhen')) fail('你没有陷阵技能');
      if (p.flags.xianzhenUsed) fail('陷阵每回合限一次');
      const t = requireTarget(ctx, p, targets);
      if (p.hand.length === 0 || t.hand.length === 0) fail('拼点双方都需要有手牌');
      p.flags.xianzhenUsed = true;
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      pushFrame(ctx, {
        type: 'tianyi', step: 'start', skill: 'xianzhen', source: p.id, target: t.id,
      });
      return;
    }
    case 'tiaoxin': {
      if (!hasSkill(s, p, 'tiaoxin')) fail('你没有挑衅技能');
      if (p.flags.tiaoxin) fail('挑衅每回合限一次');
      const t = requireTarget(ctx, p, targets);
      if (distance(s, t.id, p.id) > attackRange(s, t)) {
        fail('挑衅只能指定攻击范围内含你的角色');
      }
      p.flags.tiaoxin = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'tiaoxin' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      pushFrame(ctx, { type: 'tiaoxin', step: 'sha-wait', source: p.id, target: t.id });
      return;
    }
    case 'jixi': {
      if (!hasSkill(s, p, 'jixi')) fail('你没有急袭技能(凿险觉醒后获得)');
      if (cardIds.length !== 1 || !(p.tian ?? []).includes(cardIds[0])) {
        fail('急袭需要选择一张"田"');
      }
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jixi' });
      playAs(ctx, p, cardIds[0], 'shunshou', targets);
      return;
    }
    case 'zhijian': {
      if (!hasSkill(s, p, 'zhijian')) fail('你没有直谏技能');
      if (cardIds.length !== 1) fail('直谏需要选择手牌中的一张装备牌');
      assertInHand(s, p, cardIds[0]);
      const slot = equipSlotOf(card(s, cardIds[0]).name);
      if (slot === null) fail('直谏需要装备牌');
      const t = requireTarget(ctx, p, targets);
      if (t.equips[slot] !== undefined) fail('目标对应装备栏已有牌');
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'zhijian' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      moveCard(ctx, cardIds[0], { zone: 'equip', player: t.id }, 'zhijian');
      drawCards(ctx, p.id, 1);
      return;
    }
    case 'jwusheng': {
      // 界武圣:红色牌(手牌或装备)当杀;方块杀无距离限制
      if (!hasSkill(s, p, 'jwusheng')) fail('你没有武圣技能');
      if (cardIds.length !== 1) fail('武圣需要选择一张红色牌');
      if (!p.hand.includes(cardIds[0]) && !equipCardIds(p).includes(cardIds[0])) fail('所选牌不属于你');
      if (!isRed(card(s, cardIds[0]).suit)) fail('武圣需要红色牌');
      startSlash(ctx, p, cardIds[0], targets, 'jwusheng');
      return;
    }
    case 'yijue': {
      // 义绝:弃一张牌,令一名有手牌的其他角色展示一张手牌
      if (!hasSkill(s, p, 'yijue')) fail('你没有义绝技能');
      if (p.flags.yijue) fail('义绝每回合限一次');
      if (cardIds.length !== 1) fail('义绝需要弃置一张牌');
      if (!p.hand.includes(cardIds[0]) && !equipCardIds(p).includes(cardIds[0])) fail('所选牌不属于你');
      const t = requireTarget(ctx, p, targets);
      if (t.hand.length === 0) fail('目标没有手牌');
      p.flags.yijue = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'yijue' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      moveCard(ctx, cardIds[0], { zone: 'discard' }, 'yijue');
      pushFrame(ctx, { type: 'yijue', step: 'show-wait', source: p.id, target: t.id });
      return;
    }
    case 'jrende': {
      // 界仁德:交给一名本阶段未获得过仁德牌的其他角色任意张手牌;
      // 给出第二张时可视为使用一张基本牌
      if (!hasSkill(s, p, 'jrende')) fail('你没有仁德技能');
      if (cardIds.length === 0) fail('仁德需要至少选择一张手牌');
      for (const id of cardIds) assertInHand(s, p, id);
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      const t = requireTarget(ctx, p, targets);
      if (p.flags[`rende${t.seat}`]) fail('界仁德:本阶段已给过该角色仁德牌');
      p.flags[`rende${t.seat}`] = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jrende' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      moveCards(ctx, cardIds, { zone: 'hand', player: t.id }, 'rende');
      const given = (typeof p.flags.rende === 'number' ? p.flags.rende : 0) + cardIds.length;
      p.flags.rende = given;
      if (given >= 2 && !p.flags.rendeUsed) {
        p.flags.rendeUsed = true;
        pushFrame(ctx, { type: 'jrende', step: 'wait', player: p.id });
      }
      return;
    }
    case 'jzhiheng': {
      // 界制衡:弃任意张牌摸等量;若弃置了所有手牌,多摸一张
      if (!hasSkill(s, p, 'jzhiheng')) fail('你没有制衡技能');
      if (p.flags.zhiheng) fail('制衡每回合限一次');
      if (cardIds.length === 0) fail('制衡需要至少弃置一张牌');
      if (new Set(cardIds).size !== cardIds.length) fail('不能重复选择同一张牌');
      for (const id of cardIds) {
        if (!p.hand.includes(id) && !equipCardIds(p).includes(id)) fail('所选牌不属于你');
      }
      const allHand = p.hand.every((id) => cardIds.includes(id));
      p.flags.zhiheng = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jzhiheng' });
      moveCards(ctx, cardIds, { zone: 'discard' }, 'zhiheng');
      drawCards(ctx, p.id, cardIds.length + (allHand ? 1 : 0));
      return;
    }
    case 'jkurou': {
      // 界苦肉:出牌阶段限一次,弃一张牌,然后失去 1 点体力(诈降摸三张)
      if (!hasSkill(s, p, 'jkurou')) fail('你没有苦肉技能');
      if (p.flags.jkurou) fail('苦肉每阶段限一次');
      if (cardIds.length !== 1) fail('苦肉需要弃置一张牌');
      if (!p.hand.includes(cardIds[0]) && !equipCardIds(p).includes(cardIds[0])) fail('所选牌不属于你');
      p.flags.jkurou = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jkurou' });
      moveCard(ctx, cardIds[0], { zone: 'discard' }, 'kurou');
      loseHp(ctx, p.id, 1);
      return;
    }
    case 'jfanjian': {
      // 界反间:展示一张手牌交给一名其他角色,其选择展示手牌弃同花色或失去 1 点体力
      if (!hasSkill(s, p, 'jfanjian')) fail('你没有反间技能');
      if (p.flags.fanjian) fail('反间每回合限一次');
      if (cardIds.length !== 1) fail('反间需要选择一张手牌');
      assertInHand(s, p, cardIds[0]);
      const t = requireTarget(ctx, p, targets);
      p.flags.fanjian = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jfanjian' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      emit(ctx, { type: 'cardRevealed', player: p.id, cardId: cardIds[0], reason: 'jfanjian' });
      const suit = card(s, cardIds[0]).suit;
      moveCard(ctx, cardIds[0], { zone: 'hand', player: t.id }, 'jfanjian');
      pushFrame(ctx, { type: 'jfanjian', step: 'wait', source: p.id, target: t.id, suit });
      return;
    }
    case 'jguose': {
      // 界国色:出牌阶段限一次,方块牌当乐不思蜀,然后摸一张牌(简化:不含弃置模式)
      if (!hasSkill(s, p, 'jguose')) fail('你没有国色技能');
      if (p.flags.guose) fail('国色每阶段限一次');
      if (cardIds.length !== 1) fail('国色需要选择一张方块牌');
      const cid = cardIds[0];
      if (!p.hand.includes(cid) && !equipCardIds(p).includes(cid)) fail('所选牌不属于你');
      if (card(s, cid).suit !== 'diamond') fail('国色需要方块牌');
      const t = requireTarget(ctx, p, targets);
      p.flags.guose = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jguose' });
      placeLebusishu(ctx, p, cid, t);
      drawCards(ctx, p.id, 1);
      return;
    }
    case 'jqingnang': {
      // 界青囊:出牌阶段每名角色限一次;弃黑色牌则本阶段青囊失效
      if (!hasSkill(s, p, 'jqingnang')) fail('你没有青囊技能');
      if (p.flags.qingnangOff) fail('本阶段弃置过黑色牌,青囊已失效');
      if (cardIds.length !== 1) fail('青囊需要弃置一张手牌');
      assertInHand(s, p, cardIds[0]);
      const t = requireTarget(ctx, p, targets, true);
      if (t.hp >= t.maxHp) fail('目标体力已满');
      if (p.flags[`qn${t.seat}`]) fail('界青囊:本阶段已为该角色发动过');
      p.flags[`qn${t.seat}`] = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'jqingnang' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      if (isBlack(card(s, cardIds[0]).suit)) p.flags.qingnangOff = true;
      moveCard(ctx, cardIds[0], { zone: 'discard' }, 'qingnang');
      heal(ctx, t.id, 1);
      return;
    }
    case 'qimou': {
      // 奇谋(限定技):失去 X 点体力,本回合距离 -X 且可额外使用 X 张杀
      if (!hasSkill(s, p, 'qimou')) fail('你没有奇谋技能');
      if ((p.usedLimit ?? []).includes('qimou')) fail('奇谋是限定技,已发动过');
      pushFrame(ctx, { type: 'qimou', step: 'wait', player: p.id });
      return;
    }
    case 'gongxin': {
      if (!hasSkill(s, p, 'gongxin')) fail('你没有攻心技能');
      if (p.flags.gongxin) fail('攻心每回合限一次');
      const t = requireTarget(ctx, p, targets);
      if (t.hand.length === 0) fail('目标没有手牌');
      p.flags.gongxin = true;
      emit(ctx, { type: 'skillInvoked', player: p.id, skill: 'gongxin' });
      emit(ctx, { type: 'targeted', source: p.id, targets: [t.id] });
      pushFrame(ctx, { type: 'gongxin', step: 'pick-wait', source: p.id, target: t.id });
      return;
    }
    case 'guhuo': {
      if (!hasSkill(s, p, 'guhuo') && !hasSkill(s, p, 'jguhuo')) fail('你没有蛊惑技能');
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
