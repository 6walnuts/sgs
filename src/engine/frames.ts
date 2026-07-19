// 结算栈帧处理器。advance 循环反复调用栈顶帧的 run,直到产生请求或栈空;
// 玩家应答到达时调用栈顶帧的 onResponse。所有进度都记录在帧对象里(纯数据),
// 因此任意暂停点序列化/反序列化后都能继续结算。

import type {
  CardId, DamageFrame, DuelFrame, DyingFrame, EffectFrame, JudgeFrame,
  PendingRequest, PlayerId, ResponseData, SlashFrame, TrickFrame, WuxieFrame,
} from './types';
import {
  ask, card, drawCards, emit, equipCardIds, fail, flipToProcessing, hasSkill,
  heal, inProcessing, moveCard, moveCards, orderFrom, performDeath,
  pickRandomHand, player, popFrame, pushFrame, totalCardCount,
} from './kernel';
import type { Ctx } from './kernel';
import { isRed } from './deck';
import { validateResponseCard } from './rules';
import { GENERALS } from './generals';

export interface FrameHandler<F extends EffectFrame = EffectFrame> {
  run(ctx: Ctx, f: F): void;
  onResponse(ctx: Ctx, f: F, resp: ResponseData, req: PendingRequest): void;
}

function expectDeclineOr<K extends ResponseData['kind']>(
  resp: ResponseData,
  kind: K,
): Extract<ResponseData, { kind: K }> | null {
  if (resp.kind === 'decline') return null;
  if (resp.kind !== kind) fail('应答类型不符合当前请求');
  return resp as Extract<ResponseData, { kind: K }>;
}

export function pushDamage(
  ctx: Ctx,
  args: { source: PlayerId | null; target: PlayerId; amount: number; causeCardIds: CardId[] },
): void {
  pushFrame(ctx, { type: 'damage', step: 'apply', ...args });
}

export function pushSlash(ctx: Ctx, source: PlayerId, target: PlayerId, cardId: CardId): void {
  pushFrame(ctx, { type: 'slash', step: 'start', source, target, cardId });
}

export function pushTrick(
  ctx: Ctx,
  args: { cardId: CardId | null; effName: TrickFrame['effName']; source: PlayerId; target: PlayerId },
): void {
  pushFrame(ctx, { type: 'trick', step: 'start', ...args });
}

function wuxieHolders(ctx: Ctx): PlayerId[] {
  return orderFrom(ctx.s).filter((pid) =>
    player(ctx.s, pid).hand.some((id) => card(ctx.s, id).name === 'wuxie'),
  );
}

function discardIfProcessing(ctx: Ctx, id: CardId | null): void {
  if (id !== null && inProcessing(ctx.s, id)) moveCard(ctx, id, { zone: 'discard' });
}

// ---------- 杀 ----------

const slash: FrameHandler<SlashFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const tgt = player(s, f.target);
    const src = player(s, f.source);
    switch (f.step) {
      case 'start': {
        if (!tgt.alive) { f.step = 'finish'; return; }
        const armor = tgt.equips.armor;
        if (armor !== undefined && card(s, armor).name === 'baguazhen') {
          ask(ctx, { player: f.target, type: 'choose-option', options: ['bagua'], canDecline: true, reason: 'bagua' });
          f.step = 'bagua-wait';
        } else {
          f.step = 'ask-shan';
        }
        return;
      }
      case 'bagua-judged': {
        const res = f.childResult;
        f.childResult = undefined;
        if (res && isRed(card(s, res.cardId).suit)) f.step = 'dodged';
        else f.step = 'ask-shan';
        return;
      }
      case 'ask-shan': {
        if (!tgt.alive) { f.step = 'finish'; return; }
        ask(ctx, {
          player: f.target, type: 'respond-card', pattern: 'shan', canDecline: true,
          reason: { kind: 'slash', source: f.source, cardName: 'sha' },
        });
        f.step = 'shan-wait';
        return;
      }
      case 'dodged': {
        const w = src.equips.weapon;
        if (src.alive && tgt.alive && w !== undefined && card(s, w).name === 'qinglongdao') {
          ask(ctx, {
            player: f.source, type: 'respond-card', pattern: 'sha', canDecline: true,
            reason: { kind: 'qinglong', target: f.target },
          });
          f.step = 'qinglong-wait';
        } else {
          f.step = 'finish';
        }
        return;
      }
      case 'hit': {
        pushDamage(ctx, { source: f.source, target: f.target, amount: 1, causeCardIds: [f.cardId] });
        f.step = 'finish';
        return;
      }
      case 'finish': {
        discardIfProcessing(ctx, f.cardId);
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`slash 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    switch (f.step) {
      case 'bagua-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'ask-shan'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'bagua' });
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.target, reason: 'bagua' });
        f.step = 'bagua-judged';
        return;
      }
      case 'shan-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (!r) { f.step = 'hit'; return; }
        const cid = validateResponseCard(ctx, f.target, r, 'shan');
        moveCard(ctx, cid, { zone: 'discard' }, 'respond');
        emit(ctx, { type: 'cardResponded', player: f.target, cardId: cid });
        f.step = 'dodged';
        return;
      }
      case 'qinglong-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (!r) { f.step = 'finish'; return; }
        const cid = validateResponseCard(ctx, f.source, r, 'sha');
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'qinglong' });
        discardIfProcessing(ctx, f.cardId);
        moveCard(ctx, cid, { zone: 'processing' }, 'play');
        emit(ctx, {
          type: 'cardPlayed', player: f.source, cardId: cid, targets: [f.target],
          as: r.skill === 'wusheng' ? 'sha' : undefined,
        });
        if (r.skill === 'wusheng') emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'wusheng' });
        f.cardId = cid;
        f.step = 'start'; // 新的一次杀结算,八卦阵重新生效
        return;
      }
      default:
        fail(`slash 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 伤害(含奸雄/反馈触发) ----------

const damage: FrameHandler<DamageFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const tgt = player(s, f.target);
    switch (f.step) {
      case 'apply': {
        tgt.hp -= f.amount;
        emit(ctx, { type: 'damage', source: f.source, target: f.target, amount: f.amount });
        emit(ctx, { type: 'hpChanged', player: f.target, hp: tgt.hp, delta: -f.amount });
        f.step = 'post';
        if (tgt.hp <= 0 && tgt.alive) {
          pushFrame(ctx, {
            type: 'dying', step: 'ask', who: f.target, source: f.source,
            queue: orderFrom(s), idx: 0,
          });
        }
        return;
      }
      case 'post': {
        if (s.winner || !tgt.alive) { popFrame(ctx, f); return; }
        if (!f.jxAsked && hasSkill(s, tgt, 'jianxiong')
            && f.causeCardIds.some((id) => inProcessing(s, id))) {
          f.jxAsked = true;
          ask(ctx, { player: f.target, type: 'choose-option', options: ['jianxiong'], canDecline: true, reason: 'jianxiong' });
          f.step = 'jianxiong-wait';
          return;
        }
        if (!f.fkAsked && hasSkill(s, tgt, 'fankui') && f.source !== null) {
          const src = player(s, f.source);
          if (src.alive && totalCardCount(src) > 0) {
            f.fkAsked = true;
            ask(ctx, { player: f.target, type: 'choose-option', options: ['fankui'], canDecline: true, reason: 'fankui' });
            f.step = 'fankui-wait';
            return;
          }
        }
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`damage 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'jianxiong-wait': {
        const r = expectDeclineOr(resp, 'option');
        f.step = 'post';
        if (r) {
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'jianxiong' });
          const gain = f.causeCardIds.filter((id) => inProcessing(s, id));
          moveCards(ctx, gain, { zone: 'hand', player: f.target }, 'jianxiong');
        }
        return;
      }
      case 'fankui-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'post'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'fankui' });
        const src = player(s, f.source!);
        ask(ctx, {
          player: f.target, type: 'pick-card', target: f.source!,
          handCount: src.hand.length, equips: equipCardIds(src), reason: 'fankui',
        });
        f.step = 'fankui-pick';
        return;
      }
      case 'fankui-pick': {
        const cid = resolvePick(ctx, f.source!, resp);
        moveCard(ctx, cid, { zone: 'hand', player: f.target }, 'fankui');
        f.step = 'post';
        return;
      }
      default:
        fail(`damage 帧在 ${f.step} 步不接受应答`);
    }
  },
};

export function resolvePick(ctx: Ctx, victimId: PlayerId, resp: ResponseData): CardId {
  if (resp.kind !== 'pick') fail('应答类型不符合当前请求');
  const victim = player(ctx.s, victimId);
  if (resp.zone === 'hand') {
    return pickRandomHand(ctx, victim);
  }
  if (resp.cardId === undefined || !equipCardIds(victim).includes(resp.cardId)) {
    fail('所选装备不存在');
  }
  return resp.cardId;
}

// ---------- 濒死求桃 ----------

const dying: FrameHandler<DyingFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const w = player(s, f.who);
    if (!w.alive || w.hp > 0) { popFrame(ctx, f); return; }
    if (f.idx >= f.queue.length) {
      performDeath(ctx, f.who, f.source);
      popFrame(ctx, f);
      return;
    }
    const askerId = f.queue[f.idx];
    const asker = player(s, askerId);
    const canJijiu = hasSkill(s, asker, 'jijiu') && s.turn.activePlayer !== askerId
      && asker.hand.some((id) => isRed(card(s, id).suit));
    const hasTao = asker.hand.some((id) => card(s, id).name === 'tao');
    if (!asker.alive || (!hasTao && !canJijiu)) { f.idx++; return; }
    ask(ctx, {
      player: askerId, type: 'respond-card', pattern: 'tao', canDecline: true,
      reason: { kind: 'dying', who: f.who },
    });
    f.step = 'wait';
    return;
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    f.step = 'ask';
    const r = expectDeclineOr(resp, 'card');
    if (!r) { f.idx++; return; }
    const askerId = f.queue[f.idx];
    const cid = validateResponseCard(ctx, askerId, r, 'tao');
    moveCard(ctx, cid, { zone: 'discard' }, 'respond');
    emit(ctx, { type: 'cardResponded', player: askerId, cardId: cid, as: r.skill === 'jijiu' ? 'tao' : undefined });
    if (r.skill === 'jijiu') emit(ctx, { type: 'skillInvoked', player: askerId, skill: 'jijiu' });
    // 救援:其他吴势力角色对濒死的主公孙权使用桃,回复 +1
    const who = player(s, f.who);
    let amount = 1;
    if (askerId !== f.who && hasSkill(s, who, 'jiuyuan')
        && GENERALS[player(s, askerId).general].faction === 'wu') {
      amount = 2;
      emit(ctx, { type: 'skillInvoked', player: f.who, skill: 'jiuyuan' });
    }
    heal(ctx, f.who, amount);
    // 同一玩家可继续被询问(run 会重新检查体力)
  },
};

// ---------- 判定(含鬼才改判) ----------

const judge: FrameHandler<JudgeFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'flip': {
        const cid = flipToProcessing(ctx);
        f.cardId = cid;
        emit(ctx, { type: 'judge', player: f.player, cardId: cid, reason: f.reason });
        f.queue = orderFrom(s).filter((pid) => hasSkill(s, player(s, pid), 'guicai'));
        f.idx = 0;
        f.step = 'guicai';
        return;
      }
      case 'guicai': {
        const queue = f.queue!;
        if (f.idx! >= queue.length) {
          const cid = f.cardId!;
          moveCard(ctx, cid, { zone: 'discard' }, 'judge');
          popFrame(ctx, f, { cardId: cid });
          return;
        }
        const p = player(s, queue[f.idx!]);
        if (!p.alive || p.hand.length === 0) { f.idx!++; return; }
        ask(ctx, {
          player: p.id, type: 'choose-cards', from: 'hand', min: 1, max: 1,
          canDecline: true, reason: { kind: 'guicai', who: f.player },
        });
        f.step = 'guicai-wait';
        return;
      }
      default:
        fail(`judge 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    if (f.step !== 'guicai-wait') fail('judge 帧当前不接受应答');
    f.step = 'guicai';
    const r = expectDeclineOr(resp, 'cards');
    if (!r) { f.idx!++; return; }
    const pid = f.queue![f.idx!];
    const p = player(ctx.s, pid);
    if (r.cardIds.length !== 1 || !p.hand.includes(r.cardIds[0])) fail('鬼才需要打出一张手牌');
    emit(ctx, { type: 'skillInvoked', player: pid, skill: 'guicai' });
    moveCard(ctx, f.cardId!, { zone: 'discard' }, 'judge-replaced');
    moveCard(ctx, r.cardIds[0], { zone: 'processing' }, 'guicai');
    f.cardId = r.cardIds[0];
    emit(ctx, { type: 'judge', player: f.player, cardId: f.cardId, reason: `${f.reason}(改判)` });
    f.idx!++;
  },
};

// ---------- 无懈可击询问链 ----------

const wuxie: FrameHandler<WuxieFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.queue === undefined) { f.queue = wuxieHolders(ctx); f.idx = 0; }
    while (f.idx < f.queue.length) {
      const pid = f.queue[f.idx];
      const p = player(s, pid);
      if (p.alive && p.hand.some((id) => card(s, id).name === 'wuxie')) {
        ask(ctx, {
          player: pid, type: 'respond-card', pattern: 'wuxie', canDecline: true,
          reason: {
            kind: 'nullify', cardName: f.info.cardName,
            source: f.info.source, target: f.info.target, negated: f.negated,
          },
        });
        f.step = 'wait';
        return;
      }
      f.idx++;
    }
    popFrame(ctx, f, { negated: f.negated });
  },
  onResponse(ctx, f, resp) {
    f.step = 'ask';
    const r = expectDeclineOr(resp, 'card');
    if (!r) { f.idx++; return; }
    const pid = f.queue![f.idx];
    const cid = validateResponseCard(ctx, pid, r, 'wuxie');
    moveCard(ctx, cid, { zone: 'discard' }, 'respond');
    emit(ctx, { type: 'cardResponded', player: pid, cardId: cid });
    f.negated = !f.negated;
    f.queue = wuxieHolders(ctx); // 重新询问,允许无懈反制无懈
    f.idx = 0;
  },
};

// ---------- 锦囊结算(过拆/顺手/无中/决斗) ----------

const trick: FrameHandler<TrickFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'start': {
        pushFrame(ctx, {
          type: 'wuxie', step: 'ask', negated: false, idx: 0,
          info: { cardName: f.effName, source: f.source, target: f.target },
        });
        f.step = 'after-wuxie';
        return;
      }
      case 'after-wuxie': {
        const negated = f.childResult?.negated ?? false;
        f.childResult = undefined;
        const tgt = player(s, f.target);
        const src = player(s, f.source);
        if (negated) {
          emit(ctx, { type: 'nullified', cardName: f.effName, target: f.target });
          discardIfProcessing(ctx, f.cardId);
          popFrame(ctx, f);
          return;
        }
        switch (f.effName) {
          case 'wuzhong': {
            if (src.alive) drawCards(ctx, f.source, 2);
            discardIfProcessing(ctx, f.cardId);
            popFrame(ctx, f);
            return;
          }
          case 'guohe':
          case 'shunshou': {
            if (!tgt.alive || !src.alive || totalCardCount(tgt) === 0) {
              discardIfProcessing(ctx, f.cardId);
              popFrame(ctx, f);
              return;
            }
            ask(ctx, {
              player: f.source, type: 'pick-card', target: f.target,
              handCount: tgt.hand.length, equips: equipCardIds(tgt), reason: f.effName,
            });
            f.step = 'pick-wait';
            return;
          }
          case 'juedou': {
            if (!tgt.alive || !src.alive) {
              discardIfProcessing(ctx, f.cardId);
              popFrame(ctx, f);
              return;
            }
            pushFrame(ctx, {
              type: 'duel', step: 'ask', cardId: f.cardId,
              a: f.source, b: f.target, turn: f.target,
            });
            f.step = 'after-duel';
            return;
          }
        }
        return;
      }
      case 'after-duel': {
        discardIfProcessing(ctx, f.cardId);
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`trick 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    if (f.step !== 'pick-wait') fail('trick 帧当前不接受应答');
    const cid = resolvePick(ctx, f.target, resp);
    if (f.effName === 'guohe') {
      moveCard(ctx, cid, { zone: 'discard' }, 'guohe');
    } else {
      moveCard(ctx, cid, { zone: 'hand', player: f.source }, 'shunshou');
    }
    discardIfProcessing(ctx, f.cardId);
    popFrame(ctx, f);
  },
};

// ---------- 决斗轮流出杀 ----------

const duel: FrameHandler<DuelFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'ask': {
        if (!player(s, f.a).alive || !player(s, f.b).alive) { popFrame(ctx, f); return; }
        const other = f.turn === f.a ? f.b : f.a;
        ask(ctx, {
          player: f.turn, type: 'respond-card', pattern: 'sha', canDecline: true,
          reason: { kind: 'duel', source: other },
        });
        f.step = 'wait';
        return;
      }
      case 'done': {
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`duel 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    if (f.step !== 'wait') fail('duel 帧当前不接受应答');
    const r = expectDeclineOr(resp, 'card');
    const other = f.turn === f.a ? f.b : f.a;
    if (!r) {
      pushDamage(ctx, {
        source: other, target: f.turn, amount: 1,
        causeCardIds: f.cardId !== null ? [f.cardId] : [],
      });
      f.step = 'done';
      return;
    }
    const cid = validateResponseCard(ctx, f.turn, r, 'sha');
    moveCard(ctx, cid, { zone: 'discard' }, 'respond');
    emit(ctx, { type: 'cardResponded', player: f.turn, cardId: cid, as: r.skill === 'wusheng' ? 'sha' : undefined });
    if (r.skill === 'wusheng') emit(ctx, { type: 'skillInvoked', player: f.turn, skill: 'wusheng' });
    f.turn = other;
    f.step = 'ask';
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const frameHandlers: Record<EffectFrame['type'], FrameHandler<any>> = {
  slash, damage, dying, judge, wuxie, trick, duel,
};
