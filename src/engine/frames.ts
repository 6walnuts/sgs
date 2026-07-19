// 结算栈帧处理器。advance 循环反复调用栈顶帧的 run,直到产生请求或栈空;
// 玩家应答到达时调用栈顶帧的 onResponse。所有进度都记录在帧对象里(纯数据),
// 因此任意暂停点序列化/反序列化后都能继续结算。

import type {
  AoeFrame, CardId, DamageFrame, DelayedFrame, DrawStepFrame, DuelFrame,
  DyingFrame, EffectFrame, FanjianFrame, GuanxingFrame, JiedaoFrame,
  JudgeFrame, KurouFrame, LuoshenFrame, PendingRequest, PlayerId,
  ResponseData, SlashFrame, TrickFrame, WuxieFrame,
} from './types';
import {
  alivePlayers, ask, card, drawCards, emit, equipCardIds, fail,
  flipToProcessing, hasSkill, heal, inProcessing, markShaUsage, moveCard,
  moveCards, orderFrom, performDeath, pickRandomHand, player, popFrame,
  pushFrame, refillDrawPile, totalCardCount,
} from './kernel';
import type { Ctx } from './kernel';
import { isBlack, isRed } from './deck';
import { armorName, attackRange, distance, validateResponseCard, weaponName } from './rules';
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
  args: {
    source: PlayerId | null; target: PlayerId; amount: number;
    causeCardIds: CardId[]; causeKind?: 'sha' | 'duel';
  },
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

// ---------- 杀(含流离/铁骑/八卦/无双/青龙刀) ----------

const slash: FrameHandler<SlashFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const tgt = player(s, f.target);
    const src = player(s, f.source);
    switch (f.step) {
      case 'start': {
        if (!tgt.alive || !src.alive) { f.step = 'finish'; return; }
        if (f.dodgesNeeded === undefined) {
          f.dodgesNeeded = hasSkill(s, src, 'wushuang') ? 2 : 1;
          f.dodgesGot = 0;
        }
        // 流离:目标可弃一张牌把杀转移给其攻击范围内的另一名角色
        if (!f.liuliDone && hasSkill(s, tgt, 'liuli') && totalCardCount(tgt) > 0
            && liuliCandidates(ctx, f).length > 0) {
          ask(ctx, { player: f.target, type: 'choose-option', options: ['liuli'], canDecline: true, reason: 'liuli' });
          f.step = 'liuli-wait';
          return;
        }
        f.liuliDone = true;
        f.step = 'tieji';
        return;
      }
      case 'tieji': {
        if (!f.tiejiDone && hasSkill(s, src, 'tieji')) {
          ask(ctx, { player: f.source, type: 'choose-option', options: ['tieji'], canDecline: true, reason: 'tieji' });
          f.step = 'tieji-wait';
          return;
        }
        f.tiejiDone = true;
        f.step = 'cixiong';
        return;
      }
      case 'tieji-judged': {
        const res = f.childResult;
        f.childResult = undefined;
        if (res && isRed(card(s, res.cardId).suit)) f.noDodge = true;
        f.step = 'cixiong';
        return;
      }
      case 'cixiong': {
        // 雌雄双股剑:对异性使用杀时,其弃一张手牌或令你摸一张
        if (!f.cxDone && weaponName(s, src) === 'cixiong' && tgt.alive
            && GENERALS[src.general].gender !== GENERALS[tgt.general].gender) {
          f.cxDone = true;
          emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'cixiong' });
          if (tgt.hand.length === 0) {
            drawCards(ctx, f.source, 1);
          } else {
            ask(ctx, {
              player: f.target, type: 'choose-option',
              options: ['cixiong-discard', 'cixiong-draw'], canDecline: false, reason: 'cixiong-choice',
            });
            f.step = 'cixiong-wait';
            return;
          }
        }
        f.cxDone = true;
        f.step = 'cycle';
        return;
      }
      case 'cycle': {
        if (!tgt.alive) { f.step = 'finish'; return; }
        // 仁王盾:黑色的杀无效(丈八的无花色杀除外)
        if (!f.rwChecked) {
          f.rwChecked = true;
          if (!f.noSuit && armorName(s, tgt) === 'renwang' && isBlack(card(s, f.cardId).suit)) {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'renwang' });
            f.step = 'finish';
            return;
          }
        }
        if (f.noDodge) { f.step = 'hit'; return; }
        if ((f.dodgesGot ?? 0) >= (f.dodgesNeeded ?? 1)) { f.step = 'dodged'; return; }
        if (armorName(s, tgt) === 'baguazhen') {
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
        if (res && isRed(card(s, res.cardId).suit)) {
          f.dodgesGot = (f.dodgesGot ?? 0) + 1;
          f.step = 'cycle';
        } else {
          f.step = 'ask-shan';
        }
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
        // 贯石斧:被闪抵消后可弃两张牌(不含贯石斧)强制命中
        if (!f.gsDone && src.alive && tgt.alive && weaponName(s, src) === 'guanshi') {
          const axe = src.equips.weapon!;
          const usable = src.hand.length + equipCardIds(src).filter((id) => id !== axe).length;
          if (usable >= 2) {
            f.gsDone = true;
            ask(ctx, { player: f.source, type: 'choose-option', options: ['guanshi'], canDecline: true, reason: 'guanshi' });
            f.step = 'guanshi-wait';
            return;
          }
        }
        f.gsDone = true;
        if (src.alive && tgt.alive && weaponName(s, src) === 'qinglongdao') {
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
        // 麒麟弓:命中后可弃置目标的一匹马
        if (!f.qilinDone && weaponName(s, src) === 'qilin' && tgt.alive
            && (tgt.equips.horsePlus !== undefined || tgt.equips.horseMinus !== undefined)) {
          f.qilinDone = true;
          const options: string[] = [];
          if (tgt.equips.horsePlus !== undefined) options.push('qilin-plus');
          if (tgt.equips.horseMinus !== undefined) options.push('qilin-minus');
          ask(ctx, { player: f.source, type: 'choose-option', options, canDecline: true, reason: 'qilin' });
          f.step = 'qilin-wait';
          return;
        }
        // 寒冰剑:可防止伤害,改为依次弃置目标两张牌
        if (!f.hanbingDone && weaponName(s, src) === 'hanbing' && tgt.alive
            && totalCardCount(tgt) > 0) {
          f.hanbingDone = true;
          ask(ctx, { player: f.source, type: 'choose-option', options: ['hanbing'], canDecline: true, reason: 'hanbing' });
          f.step = 'hanbing-wait';
          return;
        }
        f.step = 'do-damage';
        return;
      }
      case 'do-damage': {
        const bonus = src.flags.luoyi ? 1 : 0; // 裸衣:杀的伤害 +1
        pushDamage(ctx, {
          source: f.source, target: f.target, amount: 1 + bonus,
          causeCardIds: [f.cardId, ...(f.extraCardIds ?? [])], causeKind: 'sha',
        });
        f.step = 'finish';
        return;
      }
      case 'finish': {
        discardIfProcessing(ctx, f.cardId);
        for (const id of f.extraCardIds ?? []) discardIfProcessing(ctx, id);
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`slash 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp, req) {
    const s = ctx.s;
    switch (f.step) {
      case 'liuli-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.liuliDone = true; f.step = 'start'; return; }
        ask(ctx, {
          player: f.target, type: 'choose-cards', from: 'hand-equips',
          min: 1, max: 1, canDecline: true, reason: { kind: 'liuli' },
        });
        f.step = 'liuli-cards';
        return;
      }
      case 'liuli-cards': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { f.liuliDone = true; f.step = 'start'; return; }
        const tgt = player(s, f.target);
        if (r.cardIds.length !== 1) fail('流离需要弃置一张牌');
        const cid = r.cardIds[0];
        if (!tgt.hand.includes(cid) && !equipCardIds(tgt).includes(cid)) fail('所选牌不属于你');
        f.liuliCard = cid;
        ask(ctx, {
          player: f.target, type: 'choose-player', min: 1, max: 1,
          candidates: liuliCandidates(ctx, f), canDecline: true, reason: { kind: 'liuli' },
        });
        f.step = 'liuli-player';
        return;
      }
      case 'liuli-player': {
        const r = expectDeclineOr(resp, 'players');
        if (!r) { f.liuliDone = true; f.step = 'start'; return; }
        if (r.players.length !== 1 || !liuliCandidates(ctx, f).includes(r.players[0])) {
          fail('流离的目标不合法');
        }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'liuli' });
        moveCard(ctx, f.liuliCard!, { zone: 'discard' }, 'liuli');
        f.liuliCard = undefined;
        f.target = r.players[0];
        f.step = 'start'; // 新目标重新结算
        f.tiejiDone = false;
        f.cxDone = false;
        f.rwChecked = false;
        return;
      }
      case 'tieji-wait': {
        const r = expectDeclineOr(resp, 'option');
        f.tiejiDone = true;
        if (!r) { f.step = 'cixiong'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'tieji' });
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.source, reason: 'tieji' });
        f.step = 'tieji-judged';
        return;
      }
      case 'cixiong-wait': {
        if (resp.kind !== 'option') fail('必须做出选择');
        if (resp.index === 0) {
          ask(ctx, {
            player: f.target, type: 'choose-cards', from: 'hand',
            min: 1, max: 1, canDecline: false, reason: { kind: 'cixiong-discard' },
          });
          f.step = 'cixiong-discard';
        } else {
          drawCards(ctx, f.source, 1);
          f.step = 'cycle';
        }
        return;
      }
      case 'cixiong-discard': {
        if (resp.kind !== 'cards' || resp.cardIds.length !== 1) fail('需要弃置一张手牌');
        const tgt = player(s, f.target);
        if (!tgt.hand.includes(resp.cardIds[0])) fail('所选牌不在手牌中');
        moveCard(ctx, resp.cardIds[0], { zone: 'discard' }, 'cixiong');
        f.step = 'cycle';
        return;
      }
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
        emit(ctx, { type: 'cardResponded', player: f.target, cardId: cid, as: r.skill ? 'shan' : undefined });
        if (r.skill === 'longdan') emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'longdan' });
        if (r.skill === 'qingguo') emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'qingguo' });
        f.dodgesGot = (f.dodgesGot ?? 0) + 1;
        f.step = 'cycle';
        return;
      }
      case 'guanshi-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'dodged'; return; }
        const src = player(s, f.source);
        ask(ctx, {
          player: f.source, type: 'choose-cards', from: 'hand-equips',
          min: 2, max: 2, excludeIds: [src.equips.weapon!],
          canDecline: true, reason: { kind: 'guanshi-discard' },
        });
        f.step = 'guanshi-cards';
        return;
      }
      case 'guanshi-cards': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { f.step = 'dodged'; return; }
        const src = player(s, f.source);
        const axe = src.equips.weapon;
        if (r.cardIds.length !== 2 || new Set(r.cardIds).size !== 2) fail('需要弃置两张牌');
        for (const id of r.cardIds) {
          if (id === axe) fail('不能弃置贯石斧本身');
          if (!src.hand.includes(id) && !equipCardIds(src).includes(id)) fail('所选牌不属于你');
        }
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'guanshi' });
        moveCards(ctx, r.cardIds, { zone: 'discard' }, 'guanshi');
        f.step = 'hit'; // 强制命中
        return;
      }
      case 'qinglong-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (!r) { f.step = 'finish'; return; }
        const cid = validateResponseCard(ctx, f.source, r, 'sha');
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'qinglong' });
        markShaUsage(ctx, f.source);
        discardIfProcessing(ctx, f.cardId);
        for (const id of f.extraCardIds ?? []) discardIfProcessing(ctx, id);
        f.extraCardIds = undefined;
        f.noSuit = false;
        moveCard(ctx, cid, { zone: 'processing' }, 'play');
        emit(ctx, {
          type: 'cardPlayed', player: f.source, cardId: cid, targets: [f.target],
          as: r.skill ? 'sha' : undefined,
        });
        if (r.skill === 'wusheng') emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'wusheng' });
        if (r.skill === 'longdan') emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'longdan' });
        f.cardId = cid;
        // 新的一次杀结算:流离/铁骑/八卦/雌雄/仁王重新生效
        f.step = 'start';
        f.dodgesGot = 0;
        f.noDodge = false;
        f.liuliDone = false;
        f.tiejiDone = false;
        f.cxDone = false;
        f.rwChecked = false;
        f.gsDone = false;
        f.qilinDone = false;
        f.hanbingDone = false;
        return;
      }
      case 'qilin-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (r && req.type === 'choose-option') {
          const tgt = player(s, f.target);
          const which = req.options[r.index];
          const horse = which === 'qilin-plus' ? tgt.equips.horsePlus : tgt.equips.horseMinus;
          if (horse === undefined) fail('目标没有这匹马');
          emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'qilin' });
          moveCard(ctx, horse, { zone: 'discard' }, 'qilin');
        }
        f.step = 'hit';
        return;
      }
      case 'hanbing-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'do-damage'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'hanbing' });
        askHanbingPick(ctx, f);
        f.step = 'hanbing-pick1';
        return;
      }
      case 'hanbing-pick1': {
        const cid = resolvePick(ctx, f.target, resp);
        moveCard(ctx, cid, { zone: 'discard' }, 'hanbing');
        if (totalCardCount(player(s, f.target)) > 0) {
          askHanbingPick(ctx, f);
          f.step = 'hanbing-pick2';
        } else {
          f.step = 'finish'; // 伤害被防止
        }
        return;
      }
      case 'hanbing-pick2': {
        const cid = resolvePick(ctx, f.target, resp);
        moveCard(ctx, cid, { zone: 'discard' }, 'hanbing');
        f.step = 'finish'; // 伤害被防止
        return;
      }
      default:
        fail(`slash 帧在 ${f.step} 步不接受应答`);
    }
  },
};

function askHanbingPick(ctx: Ctx, f: SlashFrame): void {
  const tgt = player(ctx.s, f.target);
  ask(ctx, {
    player: f.source, type: 'pick-card', target: f.target,
    handCount: tgt.hand.length, equips: equipCardIds(tgt), judges: [], reason: 'hanbing',
  });
}

function liuliCandidates(ctx: Ctx, f: SlashFrame): PlayerId[] {
  const s = ctx.s;
  const tgt = player(s, f.target);
  return alivePlayers(s)
    .filter((x) => x.id !== f.target && x.id !== f.source
      && distance(s, f.target, x.id) <= attackRange(s, tgt))
    .map((x) => x.id);
}

// ---------- 伤害(含奸雄/反馈/刚烈/遗计触发) ----------

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
        if (!f.glAsked && hasSkill(s, tgt, 'ganglie') && f.source !== null
            && player(s, f.source).alive) {
          f.glAsked = true;
          ask(ctx, { player: f.target, type: 'choose-option', options: ['ganglie'], canDecline: true, reason: 'ganglie' });
          f.step = 'ganglie-wait';
          return;
        }
        if (hasSkill(s, tgt, 'yiji')) {
          if (f.yijiTimes === undefined) f.yijiTimes = f.amount;
          if (f.yijiDrawn && f.yijiDrawn.length === 0) {
            f.yijiDrawn = undefined;
            f.yijiTimes -= 1;
          }
          if (f.yijiDrawn && f.yijiDrawn.length > 0) {
            ask(ctx, {
              player: f.target, type: 'choose-cards', from: 'hand',
              min: 1, max: f.yijiDrawn.length, canDecline: true, reason: { kind: 'yiji' },
            });
            f.step = 'yiji-cards';
            return;
          }
          if (f.yijiTimes > 0) {
            ask(ctx, { player: f.target, type: 'choose-option', options: ['yiji'], canDecline: true, reason: 'yiji' });
            f.step = 'yiji-wait';
            return;
          }
        }
        popFrame(ctx, f);
        return;
      }
      case 'ganglie-judged': {
        const res = f.childResult;
        f.childResult = undefined;
        f.step = 'post';
        if (!res || card(s, res.cardId).suit === 'heart') return;
        const src = f.source ? player(s, f.source) : null;
        if (!src || !src.alive) return;
        if (src.hand.length >= 2) {
          ask(ctx, {
            player: src.id, type: 'choose-option',
            options: ['ganglie-discard', 'ganglie-damage'], canDecline: false, reason: 'ganglie-choice',
          });
          f.step = 'ganglie-choice';
        } else {
          pushDamage(ctx, { source: f.target, target: src.id, amount: 1, causeCardIds: [] });
        }
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
          handCount: src.hand.length, equips: equipCardIds(src), judges: [], reason: 'fankui',
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
      case 'ganglie-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'post'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'ganglie' });
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.target, reason: 'ganglie' });
        f.step = 'ganglie-judged';
        return;
      }
      case 'ganglie-choice': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) fail('必须选择弃牌或受到伤害');
        if (r.index === 0) {
          ask(ctx, {
            player: f.source!, type: 'choose-cards', from: 'hand',
            min: 2, max: 2, canDecline: false, reason: { kind: 'ganglie-discard' },
          });
          f.step = 'ganglie-discard';
        } else {
          pushDamage(ctx, { source: f.target, target: f.source!, amount: 1, causeCardIds: [] });
          f.step = 'post';
        }
        return;
      }
      case 'ganglie-discard': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r || r.cardIds.length !== 2) fail('需要弃置两张手牌');
        const src = player(s, f.source!);
        if (new Set(r.cardIds).size !== 2 || !r.cardIds.every((id) => src.hand.includes(id))) {
          fail('所选牌不在手牌中');
        }
        moveCards(ctx, r.cardIds, { zone: 'discard' }, 'ganglie');
        f.step = 'post';
        return;
      }
      case 'yiji-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.yijiTimes = 0; f.step = 'post'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'yiji' });
        f.yijiDrawn = drawCards(ctx, f.target, 2);
        f.step = 'post';
        return;
      }
      case 'yiji-cards': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { f.yijiDrawn = []; f.step = 'post'; return; }
        const tgt = player(s, f.target);
        if (r.cardIds.length === 0
            || !r.cardIds.every((id) => f.yijiDrawn!.includes(id) && tgt.hand.includes(id))) {
          fail('只能分配遗计摸到的牌');
        }
        f.yijiPicked = r.cardIds;
        ask(ctx, {
          player: f.target, type: 'choose-player', min: 1, max: 1,
          candidates: alivePlayers(s).filter((x) => x.id !== f.target).map((x) => x.id),
          canDecline: true, reason: { kind: 'yiji' },
        });
        f.step = 'yiji-player';
        return;
      }
      case 'yiji-player': {
        const r = expectDeclineOr(resp, 'players');
        if (!r) { f.yijiPicked = []; f.step = 'post'; return; }
        if (r.players.length !== 1 || !player(s, r.players[0]).alive || r.players[0] === f.target) {
          fail('遗计的目标不合法');
        }
        moveCards(ctx, f.yijiPicked!, { zone: 'hand', player: r.players[0] }, 'yiji');
        f.yijiDrawn = f.yijiDrawn!.filter((id) => !f.yijiPicked!.includes(id));
        f.yijiPicked = [];
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
  if (resp.zone === 'judge') {
    if (resp.cardId === undefined || !victim.judgeZone.includes(resp.cardId)) fail('所选判定区牌不存在');
    return resp.cardId;
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

// ---------- 判定(含鬼才改判、天妒) ----------

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
          const judged = player(s, f.player);
          if (judged.alive && hasSkill(s, judged, 'tiandu')) {
            emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'tiandu' });
            moveCard(ctx, cid, { zone: 'hand', player: f.player }, 'tiandu');
          } else {
            moveCard(ctx, cid, { zone: 'discard' }, 'judge');
          }
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
    // 集智:使用(非延时)锦囊时摸一张——无懈可击也是锦囊
    const p = player(ctx.s, pid);
    if (hasSkill(ctx.s, p, 'jizhi')) {
      emit(ctx, { type: 'skillInvoked', player: pid, skill: 'jizhi' });
      drawCards(ctx, pid, 1);
    }
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
            if (!tgt.alive || !src.alive
                || totalCardCount(tgt) + tgt.judgeZone.length === 0) {
              discardIfProcessing(ctx, f.cardId);
              popFrame(ctx, f);
              return;
            }
            ask(ctx, {
              player: f.source, type: 'pick-card', target: f.target,
              handCount: tgt.hand.length, equips: equipCardIds(tgt),
              judges: [...tgt.judgeZone], reason: f.effName,
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

// ---------- 决斗轮流出杀(无双:需两张) ----------

const duel: FrameHandler<DuelFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'ask': {
        if (!player(s, f.a).alive || !player(s, f.b).alive) { popFrame(ctx, f); return; }
        const other = f.turn === f.a ? f.b : f.a;
        if (f.remaining === undefined) {
          f.remaining = hasSkill(s, player(s, other), 'wushuang') ? 2 : 1;
        }
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
    const s = ctx.s;
    if (f.step !== 'wait') fail('duel 帧当前不接受应答');
    const r = expectDeclineOr(resp, 'card');
    const other = f.turn === f.a ? f.b : f.a;
    if (!r) {
      const src = player(s, other);
      const bonus = f.a === other && src.flags.luoyi ? 1 : 0; // 裸衣:自己使用的决斗伤害+1
      pushDamage(ctx, {
        source: other, target: f.turn, amount: 1 + bonus,
        causeCardIds: f.cardId !== null ? [f.cardId] : [], causeKind: 'duel',
      });
      f.step = 'done';
      return;
    }
    const cid = validateResponseCard(ctx, f.turn, r, 'sha');
    markShaUsage(ctx, f.turn);
    moveCard(ctx, cid, { zone: 'discard' }, 'respond');
    emit(ctx, { type: 'cardResponded', player: f.turn, cardId: cid, as: r.skill ? 'sha' : undefined });
    if (r.skill === 'wusheng') emit(ctx, { type: 'skillInvoked', player: f.turn, skill: 'wusheng' });
    if (r.skill === 'longdan') emit(ctx, { type: 'skillInvoked', player: f.turn, skill: 'longdan' });
    f.remaining = (f.remaining ?? 1) - 1;
    if (f.remaining > 0) {
      f.step = 'ask'; // 无双:同一角色继续打出第二张杀
      return;
    }
    f.turn = other;
    f.remaining = undefined;
    f.step = 'ask';
  },
};

// ---------- 观星 ----------

const guanxing: FrameHandler<GuanxingFrame> = {
  run(ctx, f) {
    if (f.step === 'ask') {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['guanxing'], canDecline: true, reason: 'guanxing' });
      f.step = 'wait';
      return;
    }
    fail(`guanxing 帧在 ${f.step} 步不应被 run`);
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step === 'wait') {
      const r = expectDeclineOr(resp, 'option');
      if (!r) { popFrame(ctx, f); return; }
      emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'guanxing' });
      refillDrawPile(ctx);
      const n = Math.min(5, alivePlayers(s).length, s.drawPile.length);
      if (n === 0) { popFrame(ctx, f); return; }
      f.cardIds = s.drawPile.slice(0, n);
      ask(ctx, { player: f.player, type: 'arrange-cards', cardIds: [...f.cardIds], reason: 'guanxing' });
      f.step = 'arrange-wait';
      return;
    }
    if (f.step === 'arrange-wait') {
      if (resp.kind !== 'arrange') fail('应答类型不符合当前请求');
      const ids = f.cardIds!;
      const all = [...resp.top, ...resp.bottom];
      if (all.length !== ids.length || new Set(all).size !== all.length
          || !all.every((id) => ids.includes(id))) {
        fail('观星必须分配全部展示的牌');
      }
      s.drawPile = [...resp.top, ...s.drawPile.slice(ids.length), ...resp.bottom];
      popFrame(ctx, f);
      return;
    }
    fail('guanxing 帧当前不接受应答');
  },
};

// ---------- 洛神 ----------

const luoshen: FrameHandler<LuoshenFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'ask': {
        ask(ctx, { player: f.player, type: 'choose-option', options: ['luoshen'], canDecline: true, reason: 'luoshen' });
        f.step = 'wait';
        return;
      }
      case 'judged': {
        const res = f.childResult;
        f.childResult = undefined;
        if (res && isBlack(card(s, res.cardId).suit)) {
          if (s.discardPile.includes(res.cardId)) {
            moveCard(ctx, res.cardId, { zone: 'hand', player: f.player }, 'luoshen');
          }
          f.step = 'ask'; // 可以继续判定
        } else {
          popFrame(ctx, f);
        }
        return;
      }
      default:
        fail(`luoshen 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    if (f.step !== 'wait') fail('luoshen 帧当前不接受应答');
    const r = expectDeclineOr(resp, 'option');
    if (!r) { popFrame(ctx, f); return; }
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'luoshen' });
    pushFrame(ctx, { type: 'judge', step: 'flip', player: f.player, reason: 'luoshen' });
    f.step = 'judged';
  },
};

// ---------- 摸牌阶段(突袭/裸衣/英姿) ----------

function normalDraw(ctx: Ctx, pid: PlayerId, delta = 0): void {
  const p = player(ctx.s, pid);
  let n = 2 + delta;
  if (hasSkill(ctx.s, p, 'yingzi')) {
    emit(ctx, { type: 'skillInvoked', player: pid, skill: 'yingzi' });
    n += 1;
  }
  if (n > 0) drawCards(ctx, pid, n);
}

const drawStep: FrameHandler<DrawStepFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const p = player(s, f.player);
    if (f.step !== 'ask') fail(`draw-step 帧在 ${f.step} 步不应被 run`);
    if (hasSkill(s, p, 'tuxi') && tuxiCandidates(ctx, f.player).length > 0) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['tuxi'], canDecline: true, reason: 'tuxi' });
      f.step = 'tuxi-wait';
      return;
    }
    if (hasSkill(s, p, 'luoyi')) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['luoyi'], canDecline: true, reason: 'luoyi' });
      f.step = 'luoyi-wait';
      return;
    }
    normalDraw(ctx, f.player);
    popFrame(ctx, f);
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'tuxi-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'tuxi' });
        const cands = tuxiCandidates(ctx, f.player);
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: Math.min(2, cands.length),
          candidates: cands, canDecline: false, reason: { kind: 'tuxi' },
        });
        f.step = 'tuxi-players';
        return;
      }
      case 'tuxi-players': {
        if (resp.kind !== 'players') fail('应答类型不符合当前请求');
        const cands = tuxiCandidates(ctx, f.player);
        if (resp.players.length < 1 || resp.players.length > 2
            || new Set(resp.players).size !== resp.players.length
            || !resp.players.every((pid) => cands.includes(pid))) {
          fail('突袭的目标不合法');
        }
        for (const pid of resp.players) {
          const victim = player(s, pid);
          if (victim.hand.length === 0) continue;
          const cid = pickRandomHand(ctx, victim);
          moveCard(ctx, cid, { zone: 'hand', player: f.player }, 'tuxi');
        }
        popFrame(ctx, f);
        return;
      }
      case 'luoyi-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'luoyi' });
        player(s, f.player).flags.luoyi = true;
        normalDraw(ctx, f.player, -1);
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`draw-step 帧在 ${f.step} 步不接受应答`);
    }
  },
};

function tuxiCandidates(ctx: Ctx, me: PlayerId): PlayerId[] {
  return alivePlayers(ctx.s)
    .filter((x) => x.id !== me && x.hand.length > 0)
    .map((x) => x.id);
}

// ---------- 判定阶段:延时锦囊(乐不思蜀) ----------

const delayed: FrameHandler<DelayedFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const who = player(s, f.who);
    switch (f.step) {
      case 'next': {
        if (!who.alive) { popFrame(ctx, f); return; }
        const next = f.queue.shift();
        if (next === undefined) { popFrame(ctx, f); return; }
        if (!who.judgeZone.includes(next)) return; // 已被拆走
        f.current = next;
        pushFrame(ctx, {
          type: 'wuxie', step: 'ask', negated: false, idx: 0,
          info: { cardName: card(s, next).name, source: f.who, target: f.who },
        });
        f.step = 'after-wuxie';
        return;
      }
      case 'after-wuxie': {
        const negated = f.childResult?.negated ?? false;
        f.childResult = undefined;
        const cur = f.current!;
        if (negated) {
          emit(ctx, { type: 'nullified', cardName: card(s, cur).name, target: f.who });
          moveCard(ctx, cur, { zone: 'discard' }, 'delayed');
          f.step = 'next';
          return;
        }
        pushFrame(ctx, {
          type: 'judge', step: 'flip', player: f.who,
          reason: card(s, cur).name === 'shandian' ? 'shandian' : 'lebusishu',
        });
        f.step = 'judged';
        return;
      }
      case 'judged': {
        const res = f.childResult;
        f.childResult = undefined;
        const cur = f.current!;
        const curName = card(s, cur).name;
        if (curName === 'shandian') {
          const jc = res?.cardId !== undefined ? card(s, res.cardId) : null;
          const struck = jc !== null && jc.suit === 'spade' && jc.rank >= 2 && jc.rank <= 9;
          if (struck) {
            if (who.judgeZone.includes(cur)) moveCard(ctx, cur, { zone: 'processing' }, 'shandian');
            pushDamage(ctx, { source: null, target: f.who, amount: 3, causeCardIds: [cur] });
            f.step = 'cleanup';
            return;
          }
          // 未命中:闪电移到下一名判定区没有闪电的存活角色
          const order = orderFrom(s, f.who).filter((pid) => pid !== f.who);
          const nextOwner = order.find((pid) => {
            const q = player(s, pid);
            return q.alive && !q.judgeZone.some((id) => card(s, id).name === 'shandian');
          });
          if (nextOwner !== undefined && who.judgeZone.includes(cur)) {
            moveCard(ctx, cur, { zone: 'judge', player: nextOwner }, 'shandian');
          } else if (who.judgeZone.includes(cur)) {
            moveCard(ctx, cur, { zone: 'discard' }, 'shandian');
          }
          f.step = 'next';
          return;
        }
        // 乐不思蜀:非红桃则跳过出牌阶段
        if (res?.cardId !== undefined && card(s, res.cardId).suit !== 'heart') {
          who.flags.skipPlay = true;
        }
        if (who.judgeZone.includes(cur)) {
          moveCard(ctx, cur, { zone: 'discard' }, 'delayed');
        }
        f.step = 'next';
        return;
      }
      case 'cleanup': {
        discardIfProcessing(ctx, f.current ?? null);
        f.step = 'next';
        return;
      }
      default:
        fail(`delayed 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse() {
    fail('delayed 帧不接受应答');
  },
};

// ---------- 苦肉(失去体力结算完后摸两张) ----------

const kurou: FrameHandler<KurouFrame> = {
  run(ctx, f) {
    if (player(ctx.s, f.player).alive) drawCards(ctx, f.player, 2);
    popFrame(ctx, f);
  },
  onResponse() {
    fail('kurou 帧不接受应答');
  },
};

// ---------- 反间 ----------

const SUITS = ['spade', 'heart', 'club', 'diamond'] as const;

const fanjian: FrameHandler<FanjianFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'reveal') fail(`fanjian 帧在 ${f.step} 步不应被 run`);
    const src = player(s, f.source);
    const tgt = player(s, f.target);
    if (!src.alive || !tgt.alive || src.hand.length === 0) { popFrame(ctx, f); return; }
    const cid = pickRandomHand(ctx, src);
    emit(ctx, { type: 'cardRevealed', player: f.target, cardId: cid, reason: 'fanjian' });
    moveCard(ctx, cid, { zone: 'hand', player: f.target }, 'fanjian');
    const missed = card(s, cid).suit !== f.suit;
    popFrame(ctx, f); // 先弹出自身再压伤害帧,保持栈顶弹出约定
    if (missed) {
      pushDamage(ctx, { source: f.source, target: f.target, amount: 1, causeCardIds: [] });
    }
  },
  onResponse(_ctx, f, resp) {
    if (f.step !== 'suit-wait') fail('fanjian 帧当前不接受应答');
    if (resp.kind !== 'option') fail('必须选择一种花色');
    f.suit = SUITS[resp.index];
    if (!f.suit) fail('花色不合法');
    f.step = 'reveal';
  },
};

// ---------- AOE 锦囊:南蛮入侵/万箭齐发/桃园结义/五谷丰登 ----------

const aoe: FrameHandler<AoeFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'next': {
        if (f.idx >= f.queue.length) {
          // 五谷剩余的牌进弃牌堆
          for (const id of f.shownIds ?? []) discardIfProcessing(ctx, id);
          discardIfProcessing(ctx, f.cardId);
          popFrame(ctx, f);
          return;
        }
        const tgt = player(s, f.queue[f.idx]);
        if (!tgt.alive
            || (f.effName === 'taoyuan' && tgt.hp >= tgt.maxHp)
            || (f.effName === 'wugu' && (f.shownIds ?? []).length === 0)) {
          f.idx++;
          return;
        }
        pushFrame(ctx, {
          type: 'wuxie', step: 'ask', negated: false, idx: 0,
          info: { cardName: f.effName, source: f.source, target: tgt.id },
        });
        f.step = 'after-wuxie';
        return;
      }
      case 'after-wuxie': {
        const negated = f.childResult?.negated ?? false;
        f.childResult = undefined;
        const tgtId = f.queue[f.idx];
        if (negated) {
          emit(ctx, { type: 'nullified', cardName: f.effName, target: tgtId });
          f.idx++;
          f.step = 'next';
          return;
        }
        switch (f.effName) {
          case 'nanman':
            ask(ctx, {
              player: tgtId, type: 'respond-card', pattern: 'sha', canDecline: true,
              reason: { kind: 'aoe', source: f.source, cardName: 'nanman' },
            });
            f.step = 'card-wait';
            return;
          case 'wanjian':
            ask(ctx, {
              player: tgtId, type: 'respond-card', pattern: 'shan', canDecline: true,
              reason: { kind: 'aoe', source: f.source, cardName: 'wanjian' },
            });
            f.step = 'card-wait';
            return;
          case 'taoyuan':
            heal(ctx, tgtId, 1);
            f.idx++;
            f.step = 'next';
            return;
          case 'wugu':
            ask(ctx, {
              player: tgtId, type: 'choose-cards', from: 'shown',
              shownIds: [...f.shownIds!], min: 1, max: 1,
              canDecline: false, reason: { kind: 'wugu' },
            });
            f.step = 'pick-wait';
            return;
        }
        return;
      }
      default:
        fail(`aoe 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    const tgtId = f.queue[f.idx];
    switch (f.step) {
      case 'card-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (!r) {
          pushDamage(ctx, {
            source: f.source, target: tgtId, amount: 1, causeCardIds: [f.cardId],
          });
        } else {
          const pattern = f.effName === 'nanman' ? 'sha' : 'shan';
          const cid = validateResponseCard(ctx, tgtId, r, pattern);
          moveCard(ctx, cid, { zone: 'discard' }, 'respond');
          emit(ctx, { type: 'cardResponded', player: tgtId, cardId: cid, as: r.skill ? pattern : undefined });
        }
        f.idx++;
        f.step = 'next';
        return;
      }
      case 'pick-wait': {
        if (resp.kind !== 'cards' || resp.cardIds.length !== 1) fail('需要选择一张牌');
        const cid = resp.cardIds[0];
        if (!f.shownIds!.includes(cid)) fail('只能选择亮出的牌');
        moveCard(ctx, cid, { zone: 'hand', player: tgtId }, 'wugu');
        f.shownIds = f.shownIds!.filter((id) => id !== cid);
        f.idx++;
        f.step = 'next';
        return;
      }
      default:
        fail(`aoe 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 借刀杀人 ----------

const jiedao: FrameHandler<JiedaoFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'start': {
        pushFrame(ctx, {
          type: 'wuxie', step: 'ask', negated: false, idx: 0,
          info: { cardName: 'jiedao', source: f.source, target: f.a },
        });
        f.step = 'after-wuxie';
        return;
      }
      case 'after-wuxie': {
        const negated = f.childResult?.negated ?? false;
        f.childResult = undefined;
        const a = player(s, f.a);
        const b = player(s, f.b);
        if (negated || !a.alive || !b.alive || a.equips.weapon === undefined) {
          if (negated) emit(ctx, { type: 'nullified', cardName: 'jiedao', target: f.a });
          discardIfProcessing(ctx, f.cardId);
          popFrame(ctx, f);
          return;
        }
        ask(ctx, {
          player: f.a, type: 'respond-card', pattern: 'sha', canDecline: true,
          reason: { kind: 'jiedao', source: f.source, target: f.b },
        });
        f.step = 'sha-wait';
        return;
      }
      default:
        fail(`jiedao 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step !== 'sha-wait') fail('jiedao 帧当前不接受应答');
    const r = expectDeclineOr(resp, 'card');
    discardIfProcessing(ctx, f.cardId);
    if (!r) {
      // 不出杀:武器交给借刀者
      const a = player(s, f.a);
      const weapon = a.equips.weapon;
      popFrame(ctx, f);
      if (weapon !== undefined) {
        moveCard(ctx, weapon, { zone: 'hand', player: f.source }, 'jiedao');
      }
      return;
    }
    const cid = validateResponseCard(ctx, f.a, r, 'sha');
    moveCard(ctx, cid, { zone: 'processing' }, 'play');
    emit(ctx, {
      type: 'cardPlayed', player: f.a, cardId: cid, targets: [f.b],
      as: r.skill ? 'sha' : undefined,
    });
    if (r.skill === 'wusheng') emit(ctx, { type: 'skillInvoked', player: f.a, skill: 'wusheng' });
    if (r.skill === 'longdan') emit(ctx, { type: 'skillInvoked', player: f.a, skill: 'longdan' });
    popFrame(ctx, f);
    pushFrame(ctx, { type: 'slash', step: 'start', source: f.a, target: f.b, cardId: cid });
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const frameHandlers: Record<EffectFrame['type'], FrameHandler<any>> = {
  slash, damage, dying, judge, wuxie, trick, duel,
  guanxing, luoshen, 'draw-step': drawStep, delayed, kurou, fanjian, aoe, jiedao,
};
