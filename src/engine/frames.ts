// 结算栈帧处理器。advance 循环反复调用栈顶帧的 run,直到产生请求或栈空;
// 玩家应答到达时调用栈顶帧的 onResponse。所有进度都记录在帧对象里(纯数据),
// 因此任意暂停点序列化/反序列化后都能继续结算。

import type {
  AoeFrame, BenghuaiFrame, CardId, ChooseGeneralsFrame, DamageFrame,
  DelayedFrame, DrawStepFrame, DuelFrame, DyingFrame, EffectFrame,
  FanjianFrame, GuanxingFrame, GuhuoFrame, HuogongFrame, JiedaoFrame,
  JudgeFrame, JushouFrame, KurouFrame, LeijiFrame, LierenFrame, LuanwuFrame,
  LuoshenFrame, PendingRequest, PindianFrame, PlayerId, QuhuFrame,
  ResponseData, ShensuFrame, SlashFrame, TianyiFrame, TiesuoFrame, TrickFrame,
  WuhunFrame, WuxieFrame, XuanfengFrame, XuanhuoFrame, MingceFrame,
  GongxinFrame, GodFactionFrame, YinghunFrame,
  TuntianFrame, QiaobianFrame, TiaoxinFrame, ZhijiFrame,
  FangquanFrame, GuzhengFrame, HuashenFrame, SkillName,
  JrendeFrame, YijueFrame, JfanjianFrame, JlianyingFrame, FenjiFrame, QimouFrame,
} from './types';
import {
  EngineError, alivePlayers, ask, card, drawCards, emit, equipCardIds, fail,
  cardCategory, factionOf, flipToProcessing, grantHuashen, hasSkill, heal, inProcessing, loseHp, markShaUsage, maybeShangshi,
  moveCard, moveCards, orderFrom, performDeath, pickRandomHand, player,
  popFrame, pushFrame, refillDrawPile, toggleChain, totalCardCount,
} from './kernel';
import type { Ctx } from './kernel';
import { equipSlotOf, isBlack, isRed, shaElement } from './deck';
import { armorName, attackRange, distance, effectiveSuit, kongchengProtected, validateResponseCard, weaponName } from './rules';
import { GENERALS } from './generals';

// 蛊惑结算需要按声明的牌名走出牌逻辑;由 flow.ts 在模块加载时注入,避免循环依赖
type PlayAsFn = (
  ctx: Ctx, p: ReturnType<typeof player>, cardId: CardId,
  asName: GuhuoFrame['declared'], targets: PlayerId[],
) => void;
let resolvePlayAs: PlayAsFn = () => fail('resolvePlayAs 未注入');
export function registerPlayAs(fn: PlayAsFn): void {
  resolvePlayAs = fn;
}

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
    element?: 'fire' | 'thunder'; propagated?: boolean;
  },
): void {
  pushFrame(ctx, { type: 'damage', step: 'pre', ...args });
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

// 能打出无懈可击(含看破:卧龙的黑色手牌)
function canWuxie(ctx: Ctx, p: import('./types').PlayerState): boolean {
  if (!p.alive) return false;
  if (p.hand.some((id) => card(ctx.s, id).name === 'wuxie')) return true;
  return hasSkill(ctx.s, p, 'kanpo') && p.hand.some((id) => isBlack(card(ctx.s, id).suit));
}

function wuxieHolders(ctx: Ctx): PlayerId[] {
  return orderFrom(ctx.s).filter((pid) => canWuxie(ctx, player(ctx.s, pid)));
}

// 八卦阵判定可用性:装备了八卦阵,或卧龙"八阵"(防具区为空视为装备八卦阵)
function hasBaguaEffect(s: import('./types').GameState, p: import('./types').PlayerState): boolean {
  return armorName(s, p) === 'baguazhen'
    || (hasSkill(s, p, 'bazhen') && p.equips.armor === undefined);
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
        // 享乐:杀指定刘禅为目标时,使用者须弃一张基本牌,否则杀无效
        if (!f.xlAsked && hasSkill(s, tgt, 'xiangle')) {
          f.xlAsked = true;
          if (src.hand.length > 0) {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'xiangle' });
            ask(ctx, {
              player: f.source, type: 'choose-cards', from: 'hand',
              min: 1, max: 1, canDecline: true, reason: { kind: 'xiangle' },
            });
            f.step = 'xiangle-wait';
            return;
          }
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'xiangle' });
          f.step = 'finish';
          return;
        }
        if (f.dodgesNeeded === undefined) {
          // 界烈弓:目标手牌数不大于你则不能闪;体力值不小于你则伤害 +1
          if (f.cardId !== null && hasSkill(s, src, 'jliegong')) {
            if (tgt.hand.length <= src.hand.length) f.noDodge = true;
            if (tgt.hp >= src.hp) f.lgPlus = true;
            if (f.noDodge || f.lgPlus) emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'jliegong' });
          }
          // 诈降(界黄盖):本阶段的红色杀不能被闪响应
          if (src.flags.zhaxiang && f.cardId !== null && isRed(card(s, f.cardId).suit)) {
            f.noDodge = true;
          }
          // 肉林:董卓对女性使用杀、女性对董卓使用杀,均需两张闪
          const roulin = (hasSkill(s, src, 'roulin') && GENERALS[tgt.general].gender === 'f')
            || (hasSkill(s, tgt, 'roulin') && GENERALS[src.general].gender === 'f');
          f.dodgesNeeded = hasSkill(s, src, 'wushuang') || roulin ? 2 : 1;
          f.dodgesGot = 0;
          if (f.element === undefined) {
            f.element = f.cardId === null ? undefined : shaElement(card(s, f.cardId).name);
          }
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
        if (!f.tiejiDone && (hasSkill(s, src, 'tieji') || hasSkill(s, src, 'jtieji'))) {
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
        if (hasSkill(s, src, 'jtieji')) {
          // 界铁骑:目标须弃置一张与判定结果花色相同的牌,否则不能使用闪
          if (res && tgt.alive && totalCardCount(tgt) > 0) {
            f.jtjSuit = card(s, res.cardId).suit;
            ask(ctx, {
              player: f.target, type: 'choose-cards', from: 'hand-equips',
              min: 1, max: 1, canDecline: true,
              reason: { kind: 'jtieji', suit: f.jtjSuit as import('./types').Suit },
            });
            f.step = 'jtieji-discard';
            return;
          }
          if (res) f.noDodge = true;
          f.step = 'cixiong';
          return;
        }
        if (res && isRed(card(s, res.cardId).suit)) f.noDodge = true;
        f.step = 'cixiong';
        return;
      }
      case 'liegong-wait':
        fail('liegong-wait 由 onResponse 处理');
        return;
      case 'cixiong': {
        // 烈弓:出牌阶段使用杀,目标手牌数≥你的体力或≤你的攻击范围时可令其不能闪
        if (!f.lgDone && hasSkill(s, src, 'liegong') && tgt.alive
            && s.turn.activePlayer === f.source
            && (tgt.hand.length >= src.hp || tgt.hand.length <= attackRange(s, src))) {
          f.lgDone = true;
          ask(ctx, { player: f.source, type: 'choose-option', options: ['liegong'], canDecline: true, reason: 'liegong' });
          f.step = 'liegong-wait';
          return;
        }
        f.lgDone = true;
        return cixiongStep(ctx, f);
      }
      case 'cycle': {
        if (!tgt.alive) { f.step = 'finish'; return; }
        // 朱雀羽扇:普通杀可当火杀使用
        if (!f.zqAsked && f.element === undefined && weaponName(s, src) === 'zhuque') {
          f.zqAsked = true;
          ask(ctx, { player: f.source, type: 'choose-option', options: ['zhuque'], canDecline: true, reason: 'zhuque' });
          f.step = 'zhuque-wait';
          return;
        }
        f.zqAsked = true;
        if (!f.rwChecked) {
          f.rwChecked = true;
          // 智迟:陈宫回合外受伤后,本回合杀对其无效
          if (tgt.flags.zhichi) {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'zhichi' });
            f.step = 'finish';
            return;
          }
          // 毅重:于禁没有防具时,黑色的杀无效
          if (!f.noSuit && f.cardId !== null && hasSkill(s, tgt, 'yizhong')
              && tgt.equips.armor === undefined && isBlack(card(s, f.cardId).suit)) {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'yizhong' });
            f.step = 'finish';
            return;
          }
          // 仁王盾:黑色的杀无效(无花色的杀除外;红颜使黑桃视为红桃)
          if (!f.ignoreArmor && !f.noSuit && f.cardId !== null && armorName(s, tgt) === 'renwang'
              && effectiveSuit(s, f.cardId, f.source) !== 'heart'
              && isBlack(card(s, f.cardId).suit)
              && effectiveSuit(s, f.cardId, f.source) !== 'diamond') {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'renwang' });
            f.step = 'finish';
            return;
          }
          // 藤甲:普通杀无效(火杀/雷杀不受影响)
          if (!f.ignoreArmor && f.element === undefined && armorName(s, tgt) === 'tengjia') {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'tengjia' });
            f.step = 'finish';
            return;
          }
        }
        if (f.noDodge) { f.step = 'hit'; return; }
        if ((f.dodgesGot ?? 0) >= (f.dodgesNeeded ?? 1)) { f.step = 'dodged'; return; }
        if (!f.ignoreArmor && hasBaguaEffect(s, tgt)) {
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
        if (res && ['heart', 'diamond'].includes(effectiveSuit(s, res.cardId, f.target))) {
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
        // 猛进:庞德的杀被闪抵消后,可弃置目标一张牌
        if (!f.mjDone && src.alive && tgt.alive && hasSkill(s, src, 'mengjin')
            && totalCardCount(tgt) > 0) {
          f.mjDone = true;
          ask(ctx, { player: f.source, type: 'choose-option', options: ['mengjin'], canDecline: true, reason: 'mengjin' });
          f.step = 'mengjin-wait';
          return;
        }
        f.mjDone = true;
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
        let bonus = src.flags.luoyi ? 1 : 0; // 裸衣:杀的伤害 +1
        if (f.jiuBonus) bonus += 1;          // 酒
        if (f.lgPlus) bonus += 1;            // 界烈弓
        if (weaponName(s, src) === 'gudingdao' && tgt.hand.length === 0) {
          emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'gudingdao' });
          bonus += 1;                        // 古锭刀:目标无手牌伤害 +1
        }
        pushDamage(ctx, {
          source: f.source, target: f.target, amount: 1 + bonus,
          causeCardIds: [...(f.cardId !== null ? [f.cardId] : []), ...(f.extraCardIds ?? [])],
          causeKind: 'sha', element: f.element,
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
        emit(ctx, {
          type: 'skillInvoked', player: f.source,
          skill: hasSkill(s, player(s, f.source), 'jtieji') ? 'jtieji' : 'tieji',
        });
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.source, reason: 'tieji' });
        f.step = 'tieji-judged';
        return;
      }
      case 'jtieji-discard': {
        const r = expectDeclineOr(resp, 'cards');
        f.step = 'cixiong';
        if (!r) { f.noDodge = true; return; }
        const tgt2 = player(s, f.target);
        const cid = r.cardIds[0];
        if (r.cardIds.length !== 1
            || (!tgt2.hand.includes(cid) && !equipCardIds(tgt2).includes(cid))) {
          fail('需要弃置一张牌');
        }
        if (card(s, cid).suit !== f.jtjSuit) fail('界铁骑:需要弃置与判定结果花色相同的牌');
        moveCard(ctx, cid, { zone: 'discard' }, 'jtieji');
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
      case 'liegong-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (r) {
          emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'liegong' });
          f.noDodge = true;
        }
        return cixiongStep(ctx, f);
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
        maybeLeiji(ctx, f.target); // 张角:使用/打出闪时可发动雷击
        return;
      }
      case 'xiangle-wait': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { f.step = 'finish'; return; } // 不弃基本牌:杀无效
        const src2 = player(s, f.source);
        const basic = ['sha', 'huosha', 'leisha', 'shan', 'tao', 'jiu'];
        if (r.cardIds.length !== 1 || !src2.hand.includes(r.cardIds[0])
            || !basic.includes(card(s, r.cardIds[0]).name)) {
          fail('享乐:需要弃置一张基本牌');
        }
        moveCard(ctx, r.cardIds[0], { zone: 'discard' }, 'xiangle');
        f.step = 'start';
        return;
      }
      case 'mengjin-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'dodged'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'mengjin' });
        const tgtP = player(s, f.target);
        ask(ctx, {
          player: f.source, type: 'pick-card', target: f.target,
          handCount: tgtP.hand.length, equips: equipCardIds(tgtP), judges: [], reason: 'mengjin',
        });
        f.step = 'mengjin-pick';
        return;
      }
      case 'mengjin-pick': {
        const cid = resolvePick(ctx, f.target, resp);
        moveCard(ctx, cid, { zone: 'discard' }, 'mengjin');
        f.step = 'dodged';
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
        // 新的一次杀结算:流离/铁骑/八卦/雌雄/仁王/朱雀/属性重新生效
        f.step = 'start';
        f.dodgesNeeded = undefined;
        f.zqAsked = false;
        f.jiuBonus = false;
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
      case 'zhuque-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (r) {
          emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'zhuque' });
          f.element = 'fire';
        }
        f.step = 'cycle';
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

// 雌雄双股剑检查(烈弓询问后继续)
function cixiongStep(ctx: Ctx, f: SlashFrame): void {
  const s = ctx.s;
  const src = player(s, f.source);
  const tgt = player(s, f.target);
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
}

// 张角雷击:打出/使用闪后压入雷击帧(在当前结算之上先行处理)
function maybeLeiji(ctx: Ctx, pid: PlayerId): void {
  const p = player(ctx.s, pid);
  if ((hasSkill(ctx.s, p, 'leiji') || hasSkill(ctx.s, p, 'jleiji'))
      && alivePlayers(ctx.s).some((x) => x.id !== pid)) {
    pushFrame(ctx, { type: 'leiji', step: 'ask', player: pid });
  }
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
      case 'pre': {
        // 绝情:张春华造成的伤害均视为体力流失(不触发受伤类技能与连环)
        if (f.source !== null && hasSkill(s, player(s, f.source), 'jueqing')) {
          emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'jueqing' });
          const amount = f.amount;
          const target = f.target;
          popFrame(ctx, f);
          loseHp(ctx, target, amount);
          return;
        }
        // 天香:小乔受到伤害时可弃一张红桃手牌转移给其他角色
        if (!f.txAsked && (hasSkill(s, tgt, 'tianxiang') || hasSkill(s, tgt, 'jtianxiang'))
            && tgt.hand.some((id) => effectiveSuit(s, id, tgt.id) === 'heart')
            && alivePlayers(s).some((x) => x.id !== tgt.id)) {
          f.txAsked = true;
          ask(ctx, { player: f.target, type: 'choose-option', options: ['tianxiang'], canDecline: true, reason: 'tianxiang' });
          f.step = 'tianxiang-wait';
          return;
        }
        f.step = 'apply';
        return;
      }
      case 'apply': {
        let amount = f.amount;
        // 白银狮子:超过 1 点的伤害改为 1 点
        if (armorName(s, tgt) === 'baiyin' && amount > 1) {
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'baiyin' });
          amount = 1;
        }
        // 藤甲:火焰伤害 +1
        if (f.element === 'fire' && armorName(s, tgt) === 'tengjia') {
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'tengjia' });
          amount += 1;
        }
        // 铁索连环:属性伤害解除横置并传导
        if (f.element !== undefined && tgt.chained) {
          toggleChain(ctx, f.target);
          if (!f.propagated) {
            f.spreadTo = alivePlayers(s)
              .filter((x) => x.chained && x.id !== f.target)
              .map((x) => x.id);
          }
        }
        tgt.hp -= amount;
        emit(ctx, { type: 'damage', source: f.source, target: f.target, amount, element: f.element });
        emit(ctx, { type: 'hpChanged', player: f.target, hp: tgt.hp, delta: -amount });
        // 智迟:陈宫回合外受到伤害后,本回合杀与非延时锦囊对其无效
        if (hasSkill(s, tgt, 'zhichi') && s.turn.activePlayer !== f.target) {
          tgt.flags.zhichi = true;
        }
        // 记录伤害来源合计(武魂用)
        if (f.source !== null) {
          if (!tgt.damageTaken) tgt.damageTaken = {};
          tgt.damageTaken[f.source] = (tgt.damageTaken[f.source] ?? 0) + amount;
        }
        maybeShangshi(ctx, f.target);
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
        if (s.winner) { popFrame(ctx, f); return; }
        // 天香转移来的伤害:结算后按已损失体力摸牌(存活时)
        if (f.txDraw) {
          f.txDraw = false;
          if (tgt.alive && tgt.maxHp - tgt.hp > 0) {
            drawCards(ctx, f.target, Math.min(5, tgt.maxHp - tgt.hp));
          }
        }
        // 狂骨:魏延对距离 1 以内的角色造成伤害后可回复 1 点
        if (!f.kgAsked && f.source !== null) {
          const src = player(s, f.source);
          const jkg = hasSkill(s, src, 'jkuanggu');
          if ((jkg || (hasSkill(s, src, 'kuanggu') && src.hp < src.maxHp))
              && distance(s, f.source, f.target) <= 1) {
            f.kgAsked = true;
            ask(ctx, {
              player: f.source, type: 'choose-option',
              options: jkg ? ['kuanggu-heal', 'kuanggu-draw'] : ['kuanggu'],
              canDecline: true, reason: 'kuanggu',
            });
            f.step = 'kuanggu-wait';
            return;
          }
          f.kgAsked = true;
        }
        if (!tgt.alive) { finishDamage(ctx, f); return; }
        if (!f.jxAsked && ((hasSkill(s, tgt, 'jianxiong')
            && f.causeCardIds.some((id) => inProcessing(s, id)))
            || hasSkill(s, tgt, 'jjianxiong'))) {
          f.jxAsked = true;
          ask(ctx, { player: f.target, type: 'choose-option', options: ['jianxiong'], canDecline: true, reason: 'jianxiong' });
          f.step = 'jianxiong-wait';
          return;
        }
        if ((hasSkill(s, tgt, 'fankui') || hasSkill(s, tgt, 'jfankui')) && f.source !== null) {
          const src = player(s, f.source);
          // 界反馈:每受到 1 点伤害均可发动一次
          if (f.fkTimes === undefined) f.fkTimes = hasSkill(s, tgt, 'jfankui') ? f.amount : 1;
          if (f.fkTimes > 0 && src.alive && totalCardCount(src) > 0) {
            f.fkTimes -= 1;
            ask(ctx, { player: f.target, type: 'choose-option', options: ['fankui'], canDecline: true, reason: 'fankui' });
            f.step = 'fankui-wait';
            return;
          }
        }
        if ((hasSkill(s, tgt, 'ganglie') || hasSkill(s, tgt, 'jganglie')) && f.source !== null
            && player(s, f.source).alive) {
          // 界刚烈:每受到 1 点伤害均可发动一次
          if (f.glTimes === undefined) f.glTimes = hasSkill(s, tgt, 'jganglie') ? f.amount : 1;
          if (f.glTimes > 0) {
            f.glTimes -= 1;
            ask(ctx, { player: f.target, type: 'choose-option', options: ['ganglie'], canDecline: true, reason: 'ganglie' });
            f.step = 'ganglie-wait';
            return;
          }
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
        // 悲歌:任意角色受到杀的伤害后,蔡文姬可弃一张牌令其判定
        if (!f.bgAsked && f.causeKind === 'sha') {
          const bard = alivePlayers(s).find(
            (x) => hasSkill(s, x, 'beige') && totalCardCount(x) > 0,
          );
          if (bard) {
            f.bgAsked = true;
            f.beigeBy = bard.id;
            ask(ctx, {
              player: bard.id, type: 'choose-cards', from: 'hand-equips',
              min: 1, max: 1, canDecline: true, reason: { kind: 'beige' },
            });
            f.step = 'beige-card';
            return;
          }
          f.bgAsked = true;
        }
        // 恩怨:其他角色对法正造成伤害后,须交一张红桃手牌,否则失去 1 点体力
        if (!f.eyAsked && hasSkill(s, tgt, 'enyuan') && f.source !== null
            && f.source !== f.target && player(s, f.source).alive) {
          f.eyAsked = true;
          ask(ctx, {
            player: f.source, type: 'choose-cards', from: 'hand',
            min: 1, max: 1, canDecline: true, reason: { kind: 'enyuan' },
          });
          f.step = 'enyuan-card';
          return;
        }
        // 破军:徐盛的杀造成伤害后,可令目标摸 X 张(X=其体力值,至多5)并翻面
        if (!f.pjAsked && f.causeKind === 'sha' && f.source !== null
            && hasSkill(s, player(s, f.source), 'pojun') && tgt.alive) {
          f.pjAsked = true;
          ask(ctx, { player: f.source, type: 'choose-option', options: ['pojun'], canDecline: true, reason: 'pojun' });
          f.step = 'pojun-wait';
          return;
        }
        // 新生:左慈受到伤害后获得一张化身牌(简化为自动发动)
        if (!f.xsDone && hasSkill(s, tgt, 'xinsheng') && tgt.alive) {
          f.xsDone = true;
          grantHuashen(s, f.target, 1);
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'xinsheng' });
        }
        // 归心:神曹操受到伤害后,可从每名其他角色处获得一张随机手牌,然后翻面
        if (!f.gxAsked && hasSkill(s, tgt, 'guixin')
            && alivePlayers(s).some((x) => x.id !== f.target && x.hand.length > 0)) {
          f.gxAsked = true;
          ask(ctx, { player: f.target, type: 'choose-option', options: ['guixin'], canDecline: true, reason: 'guixin' });
          f.step = 'guixin-wait';
          return;
        }
        // 放逐:曹丕受到伤害后,可令一名其他角色翻面并摸 X 张牌(X=已损失体力)
        if (!f.fzAsked && hasSkill(s, tgt, 'fangzhu')
            && alivePlayers(s).some((x) => x.id !== f.target)) {
          f.fzAsked = true;
          ask(ctx, { player: f.target, type: 'choose-option', options: ['fangzhu'], canDecline: true, reason: 'fangzhu' });
          f.step = 'fangzhu-wait';
          return;
        }
        // 烈刃:祝融的杀造成伤害后,可与目标拼点,赢则获得其一张牌
        if (!f.lrAsked && f.causeKind === 'sha' && f.source !== null) {
          const src = player(s, f.source);
          if (hasSkill(s, src, 'lieren') && src.alive && tgt.alive
              && src.hand.length > 0 && tgt.hand.length > 0) {
            f.lrAsked = true;
            ask(ctx, { player: f.source, type: 'choose-option', options: ['lieren'], canDecline: true, reason: 'lieren' });
            f.step = 'lieren-wait';
            return;
          }
          f.lrAsked = true;
        }
        // 利驭(界吕布):杀造成伤害后,可获得目标区域一张牌;非装备则其摸一张,装备则其指定角色与你决斗
        if (!f.lyAsked && f.causeKind === 'sha' && f.source !== null) {
          const srcLy = player(s, f.source);
          if (hasSkill(s, srcLy, 'liyu') && srcLy.alive && tgt.alive && totalCardCount(tgt) > 0) {
            f.lyAsked = true;
            ask(ctx, { player: f.source, type: 'choose-option', options: ['liyu'], canDecline: true, reason: 'liyu' });
            f.step = 'liyu-wait';
            return;
          }
          f.lyAsked = true;
        }
        // 暴虐:其他群势力角色造成伤害后,可判定,黑桃则主公董卓回复 1 点
        if (!f.bnAsked && f.source !== null) {
          const src = player(s, f.source);
          const tyrant = alivePlayers(s).find((x) => hasSkill(s, x, 'baonve'));
          if (tyrant && src.alive && src.id !== tyrant.id
              && factionOf(s, src) === 'qun' && tyrant.hp < tyrant.maxHp) {
            f.bnAsked = true;
            ask(ctx, { player: f.source, type: 'choose-option', options: ['baonve'], canDecline: true, reason: 'baonve' });
            f.step = 'baonve-wait';
            return;
          }
          f.bnAsked = true;
        }
        // 酒诗:曹丕/曹植武将牌背面时受到伤害,结算后翻回正面(自动)
        if (tgt.flipped && hasSkill(s, tgt, 'jiushi')) {
          tgt.flipped = false;
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'jiushi' });
          emit(ctx, { type: 'flipped', player: f.target, flipped: false });
        }
        // 节命:荀彧每受到 1 点伤害,可令一名角色将手牌补至体力上限
        if (hasSkill(s, tgt, 'jieming')) {
          if (f.jmTimes === undefined) f.jmTimes = f.amount;
          if (f.jmTimes > 0) {
            f.jmTimes -= 1;
            ask(ctx, {
              player: f.target, type: 'choose-player', min: 1, max: 1,
              candidates: alivePlayers(s).map((x) => x.id),
              canDecline: true, reason: { kind: 'jieming' },
            });
            f.step = 'jieming-player';
            return;
          }
        }
        finishDamage(ctx, f);
        return;
      }
      case 'beige-judged': {
        const res = f.childResult;
        f.childResult = undefined;
        f.step = 'post';
        if (!res) return;
        const suit = card(s, res.cardId).suit;
        const victim = player(s, f.target);
        if (suit === 'heart') {
          if (victim.alive) heal(ctx, f.target, 1);
        } else if (suit === 'diamond') {
          if (victim.alive) drawCards(ctx, f.target, 2);
        } else if (f.source !== null && player(s, f.source).alive) {
          const src2 = player(s, f.source);
          if (suit === 'club') {
            const junk = [...src2.hand, ...equipCardIds(src2)].slice(0, 2);
            if (junk.length > 0) moveCards(ctx, junk, { zone: 'discard' }, 'beige');
          } else {
            src2.flipped = !src2.flipped;
            emit(ctx, { type: 'flipped', player: f.source, flipped: !!src2.flipped });
          }
        }
        return;
      }
      case 'baonve-judged': {
        const res = f.childResult;
        f.childResult = undefined;
        f.step = 'post';
        if (res && f.source !== null
            && effectiveSuit(s, res.cardId, f.source) === 'spade') {
          const tyrant = alivePlayers(s).find((x) => hasSkill(s, x, 'baonve'));
          if (tyrant && tyrant.hp < tyrant.maxHp) heal(ctx, tyrant.id, 1);
        }
        return;
      }
      case 'ganglie-judged': {
        const res = f.childResult;
        f.childResult = undefined;
        f.step = 'post';
        if (!res || effectiveSuit(s, res.cardId, f.target) === 'heart') return;
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
          const jjx = hasSkill(s, player(s, f.target), 'jjianxiong');
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: jjx ? 'jjianxiong' : 'jianxiong' });
          if (jjx) drawCards(ctx, f.target, 1); // 界奸雄:先摸一张
          const gain = f.causeCardIds.filter((id) => inProcessing(s, id));
          moveCards(ctx, gain, { zone: 'hand', player: f.target }, 'jianxiong');
        }
        return;
      }
      case 'fankui-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.fkTimes = 0; f.step = 'post'; return; }
        emit(ctx, {
          type: 'skillInvoked', player: f.target,
          skill: hasSkill(s, player(s, f.target), 'jfankui') ? 'jfankui' : 'fankui',
        });
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
      case 'tianxiang-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'apply'; return; }
        ask(ctx, {
          player: f.target, type: 'choose-cards', from: 'hand',
          min: 1, max: 1, canDecline: true, reason: { kind: 'tianxiang' },
        });
        f.step = 'tianxiang-card';
        return;
      }
      case 'tianxiang-card': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { f.step = 'apply'; return; }
        if (r.cardIds.length !== 1 || !player(s, f.target).hand.includes(r.cardIds[0])) fail('需要弃置一张手牌');
        if (effectiveSuit(s, r.cardIds[0], f.target) !== 'heart') fail('天香需要红桃手牌');
        f.txCard = r.cardIds[0];
        ask(ctx, {
          player: f.target, type: 'choose-player', min: 1, max: 1,
          candidates: alivePlayers(s).filter((x) => x.id !== f.target).map((x) => x.id),
          canDecline: true, reason: { kind: 'tianxiang' },
        });
        f.step = 'tianxiang-player';
        return;
      }
      case 'tianxiang-player': {
        const r = expectDeclineOr(resp, 'players');
        if (!r) { f.txCard = undefined; f.step = 'apply'; return; }
        if (r.players.length !== 1 || !player(s, r.players[0]).alive || r.players[0] === f.target) {
          fail('天香的目标不合法');
        }
        if (hasSkill(s, player(s, f.target), 'jtianxiang')) {
          // 界天香:选择令其受此伤害并摸牌,或令其失去 1 点体力并获得弃置的红桃
          f.txTarget = r.players[0];
          ask(ctx, {
            player: f.target, type: 'choose-option',
            options: ['jtx-damage', 'jtx-losehp'], canDecline: false, reason: 'jtianxiang-mode',
          });
          f.step = 'jtianxiang-mode';
          return;
        }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'tianxiang' });
        moveCard(ctx, f.txCard!, { zone: 'discard' }, 'tianxiang');
        f.txCard = undefined;
        f.target = r.players[0]; // 伤害整体转移
        f.txDraw = true;
        f.step = 'pre'; // 新目标同样有机会天香(若也是小乔——不可能,但保持一致)
        return;
      }
      case 'kuanggu-wait': {
        const r = expectDeclineOr(resp, 'option');
        f.step = 'post';
        if (r) {
          const jkg = hasSkill(s, player(s, f.source!), 'jkuanggu');
          emit(ctx, { type: 'skillInvoked', player: f.source!, skill: jkg ? 'jkuanggu' : 'kuanggu' });
          if (jkg && r.index === 1) drawCards(ctx, f.source!, 1);
          else heal(ctx, f.source!, 1);
        }
        return;
      }
      case 'jieming-player': {
        const r = expectDeclineOr(resp, 'players');
        f.step = 'post';
        if (!r) { f.jmTimes = 0; return; }
        if (r.players.length !== 1 || !player(s, r.players[0]).alive) fail('节命的目标不合法');
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'jieming' });
        const beneficiary = player(s, r.players[0]);
        const n = beneficiary.maxHp - beneficiary.hand.length;
        if (n > 0) drawCards(ctx, beneficiary.id, n);
        return;
      }
      case 'fangzhu-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'post'; return; }
        ask(ctx, {
          player: f.target, type: 'choose-player', min: 1, max: 1,
          candidates: alivePlayers(s).filter((x) => x.id !== f.target).map((x) => x.id),
          canDecline: true, reason: { kind: 'fangzhu' },
        });
        f.step = 'fangzhu-player';
        return;
      }
      case 'fangzhu-player': {
        const r = expectDeclineOr(resp, 'players');
        f.step = 'post';
        if (!r) return;
        if (r.players.length !== 1 || r.players[0] === f.target
            || !player(s, r.players[0]).alive) {
          fail('放逐的目标不合法');
        }
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'fangzhu' });
        const exiled = player(s, r.players[0]);
        exiled.flipped = !exiled.flipped;
        emit(ctx, { type: 'flipped', player: exiled.id, flipped: !!exiled.flipped });
        const me = player(s, f.target);
        const x = me.maxHp - me.hp;
        if (x > 0) drawCards(ctx, exiled.id, x);
        return;
      }
      case 'lieren-wait': {
        const r = expectDeclineOr(resp, 'option');
        f.step = 'post';
        if (r) {
          pushFrame(ctx, { type: 'lieren', step: 'start', source: f.source!, target: f.target });
        }
        return;
      }
      case 'beige-card': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { f.step = 'post'; return; }
        const bard = player(s, f.beigeBy!);
        if (r.cardIds.length !== 1
            || (!bard.hand.includes(r.cardIds[0]) && !equipCardIds(bard).includes(r.cardIds[0]))) {
          fail('悲歌:需要弃置一张牌');
        }
        emit(ctx, { type: 'skillInvoked', player: f.beigeBy!, skill: 'beige' });
        moveCard(ctx, r.cardIds[0], { zone: 'discard' }, 'beige');
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.target, reason: 'beige' });
        f.step = 'beige-judged';
        return;
      }
      case 'guixin-wait': {
        const r = expectDeclineOr(resp, 'option');
        f.step = 'post';
        if (!r) return;
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'guixin' });
        for (const pid of orderFrom(s)) {
          if (pid === f.target) continue;
          const victim = player(s, pid);
          if (victim.hand.length === 0) continue;
          const cid = pickRandomHand(ctx, victim);
          moveCard(ctx, cid, { zone: 'hand', player: f.target }, 'guixin');
        }
        const me = player(s, f.target);
        me.flipped = !me.flipped;
        emit(ctx, { type: 'flipped', player: f.target, flipped: !!me.flipped });
        return;
      }
      case 'jtianxiang-mode': {
        if (resp.kind !== 'option') fail('必须选择一项');
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'jtianxiang' });
        const tid = f.txTarget!;
        f.txTarget = undefined;
        if (resp.index === 0) {
          moveCard(ctx, f.txCard!, { zone: 'discard' }, 'tianxiang');
          f.txCard = undefined;
          f.target = tid; // 伤害整体转移,其后按已损失体力摸牌
          f.txDraw = true;
          f.step = 'pre';
          return;
        }
        const heart = f.txCard!;
        f.txCard = undefined;
        moveCard(ctx, heart, { zone: 'hand', player: tid }, 'tianxiang');
        popFrame(ctx, f); // 此伤害被防止
        loseHp(ctx, tid, 1);
        return;
      }
      case 'liyu-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'post'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.source!, skill: 'liyu' });
        const victim = player(s, f.target);
        ask(ctx, {
          player: f.source!, type: 'pick-card', target: f.target,
          handCount: victim.hand.length, equips: equipCardIds(victim), judges: [], reason: 'liyu',
        });
        f.step = 'liyu-pick';
        return;
      }
      case 'liyu-pick': {
        const victim = player(s, f.target);
        const wasEquip = resp.kind === 'pick' && resp.zone === 'equip';
        const cid = resolvePick(ctx, f.target, resp);
        moveCard(ctx, cid, { zone: 'hand', player: f.source! }, 'liyu');
        if (!wasEquip) {
          if (victim.alive) drawCards(ctx, f.target, 1);
          f.step = 'post';
          return;
        }
        const cands = alivePlayers(s)
          .filter((x) => x.id !== f.source && x.id !== f.target).map((x) => x.id);
        if (cands.length === 0) { f.step = 'post'; return; }
        ask(ctx, {
          player: f.target, type: 'choose-player', min: 1, max: 1,
          candidates: cands, canDecline: false, reason: { kind: 'liyu' },
        });
        f.step = 'liyu-player';
        return;
      }
      case 'liyu-player': {
        if (resp.kind !== 'players' || resp.players.length !== 1) fail('利驭需要指定一名角色');
        const t2 = player(s, resp.players[0]);
        if (!t2.alive || t2.id === f.source || t2.id === f.target) fail('利驭的目标不合法');
        f.step = 'post';
        // 简化:视为吕布对其使用决斗(不经过无懈)
        emit(ctx, { type: 'virtualCard', player: f.source!, as: 'juedou', targets: [t2.id] });
        pushFrame(ctx, { type: 'duel', step: 'ask', cardId: null, a: f.source!, b: t2.id, turn: t2.id });
        return;
      }
      case 'enyuan-card': {
        const r = expectDeclineOr(resp, 'cards');
        f.step = 'post';
        emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'enyuan' });
        const giver = player(s, f.source!);
        if (!r) {
          loseHp(ctx, f.source!, 1);
          return;
        }
        if (r.cardIds.length !== 1 || !giver.hand.includes(r.cardIds[0])) fail('需要选择一张手牌');
        if (card(s, r.cardIds[0]).suit !== 'heart') fail('恩怨需要交出红桃手牌');
        moveCard(ctx, r.cardIds[0], { zone: 'hand', player: f.target }, 'enyuan');
        return;
      }
      case 'pojun-wait': {
        const r = expectDeclineOr(resp, 'option');
        f.step = 'post';
        if (!r) return;
        emit(ctx, { type: 'skillInvoked', player: f.source!, skill: 'pojun' });
        const victim = player(s, f.target);
        if (victim.alive) {
          const n = Math.min(Math.max(victim.hp, 0), 5);
          if (n > 0) drawCards(ctx, f.target, n);
          victim.flipped = !victim.flipped;
          emit(ctx, { type: 'flipped', player: f.target, flipped: !!victim.flipped });
        }
        return;
      }
      case 'baonve-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'post'; return; }
        emit(ctx, { type: 'skillInvoked', player: f.source!, skill: 'baonve' });
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.source!, reason: 'baonve' });
        f.step = 'baonve-judged';
        return;
      }
      case 'ganglie-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.glTimes = 0; f.step = 'post'; return; }
        emit(ctx, {
          type: 'skillInvoked', player: f.target,
          skill: hasSkill(s, player(s, f.target), 'jganglie') ? 'jganglie' : 'ganglie',
        });
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

// 伤害结算收尾:弹出伤害帧;若需连环传导,为其余横置角色压入同源属性伤害
function finishDamage(ctx: Ctx, f: DamageFrame): void {
  const spread = f.spreadTo ?? [];
  popFrame(ctx, f);
  for (let i = spread.length - 1; i >= 0; i--) {
    const pid = spread[i];
    const p = player(ctx.s, pid);
    if (!p.alive || !p.chained) continue; // 可能已被其他结算解除
    pushDamage(ctx, {
      source: f.source, target: pid, amount: f.amount,
      causeCardIds: [], element: f.element, propagated: true,
    });
  }
}

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
    // 涅槃:庞统的限定技,濒死时弃置所有牌并复原,回复到 3 点体力
    if (!f.npAsked && hasSkill(s, w, 'niepan') && !(w.usedLimit ?? []).includes('niepan')) {
      f.npAsked = true;
      ask(ctx, { player: f.who, type: 'choose-option', options: ['niepan'], canDecline: true, reason: 'niepan' });
      f.step = 'niepan-wait';
      return;
    }
    // 补益:吴国太可展示濒死者一张手牌,非基本牌则弃之回复 1 点
    if (!f.byAsked && w.hand.length > 0) {
      const healer = alivePlayers(s).find((x) => hasSkill(s, x, 'buyi'));
      if (healer) {
        f.byAsked = true;
        ask(ctx, { player: healer.id, type: 'choose-option', options: ['buyi'], canDecline: true, reason: 'buyi' });
        f.step = 'buyi-wait';
        return;
      }
    }
    if (f.idx >= f.queue.length) {
      // 不屈:周泰翻开牌堆顶一张作"创",点数与已有创重复才死亡
      if (hasSkill(s, w, 'buqu')) {
        const cid = flipToProcessing(ctx);
        emit(ctx, { type: 'cardRevealed', player: f.who, cardId: cid, reason: 'buqu' });
        const dup = (w.buqu ?? []).some((old) => card(s, old).rank === card(s, cid).rank);
        moveCard(ctx, cid, dup ? { zone: 'discard' } : { zone: 'buqu', player: f.who }, 'buqu');
        if (dup) {
          performDeath(ctx, f.who, f.source);
        } else {
          emit(ctx, { type: 'skillInvoked', player: f.who, skill: 'buqu' });
        }
        popFrame(ctx, f);
        return;
      }
      performDeath(ctx, f.who, f.source);
      popFrame(ctx, f);
      return;
    }
    const askerId = f.queue[f.idx];
    const asker = player(s, askerId);
    // 完杀:贾诩的回合内,除贾诩和濒死者外,其他角色不能使用桃
    const active = player(s, s.turn.activePlayer);
    if (hasSkill(s, active, 'wansha') && askerId !== active.id && askerId !== f.who) {
      f.idx++;
      return;
    }
    const canJijiu = hasSkill(s, asker, 'jijiu') && s.turn.activePlayer !== askerId
      && asker.hand.some((id) => isRed(card(s, id).suit));
    const hasTao = asker.hand.some((id) => card(s, id).name === 'tao');
    const canJiu = askerId === f.who && asker.hand.some((id) => card(s, id).name === 'jiu');
    if (!asker.alive || (!hasTao && !canJijiu && !canJiu)) { f.idx++; return; }
    ask(ctx, {
      player: askerId, type: 'respond-card', pattern: 'tao', canDecline: true,
      reason: { kind: 'dying', who: f.who },
    });
    f.step = 'wait';
    return;
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step === 'buyi-wait') {
      f.step = 'ask';
      const r = expectDeclineOr(resp, 'option');
      if (!r) return;
      const healer = alivePlayers(s).find((x) => hasSkill(s, x, 'buyi'));
      const w = player(s, f.who);
      if (!healer || w.hand.length === 0) return;
      emit(ctx, { type: 'skillInvoked', player: healer.id, skill: 'buyi' });
      const shown = pickRandomHand(ctx, w);
      emit(ctx, { type: 'cardRevealed', player: f.who, cardId: shown, reason: 'buyi' });
      const basic = ['sha', 'huosha', 'leisha', 'shan', 'tao', 'jiu'].includes(card(s, shown).name);
      if (!basic) {
        moveCard(ctx, shown, { zone: 'discard' }, 'buyi');
        heal(ctx, f.who, 1, healer.id);
      }
      return;
    }
    if (f.step === 'niepan-wait') {
      f.step = 'ask';
      const r = expectDeclineOr(resp, 'option');
      if (!r) return;
      const w = player(s, f.who);
      w.usedLimit = [...(w.usedLimit ?? []), 'niepan'];
      emit(ctx, { type: 'skillInvoked', player: f.who, skill: 'niepan' });
      const all = [...w.hand, ...equipCardIds(w), ...w.judgeZone];
      if (all.length > 0) moveCards(ctx, all, { zone: 'discard' }, 'niepan');
      if (w.chained) toggleChain(ctx, f.who);
      if (w.flipped) {
        w.flipped = false;
        emit(ctx, { type: 'flipped', player: f.who, flipped: false });
      }
      drawCards(ctx, f.who, 3);
      heal(ctx, f.who, Math.min(3, w.maxHp) - w.hp);
      return;
    }
    f.step = 'ask';
    const r = expectDeclineOr(resp, 'card');
    if (!r) { f.idx++; return; }
    const askerId = f.queue[f.idx];
    let cid: CardId;
    if (card(s, r.cardId)?.name === 'jiu') {
      // 酒:只能濒死者自己使用,回复 1 点
      if (askerId !== f.who) fail('酒只能由濒死者自己使用');
      if (!player(s, askerId).hand.includes(r.cardId)) fail('这张牌不在你的手牌中');
      cid = r.cardId;
    } else {
      cid = validateResponseCard(ctx, askerId, r, 'tao');
    }
    moveCard(ctx, cid, { zone: 'discard' }, 'respond');
    emit(ctx, { type: 'cardResponded', player: askerId, cardId: cid, as: r.skill === 'jijiu' ? 'tao' : undefined });
    if (r.skill === 'jijiu') emit(ctx, { type: 'skillInvoked', player: askerId, skill: 'jijiu' });
    // 救援:其他吴势力角色对濒死的主公孙权使用桃,回复 +1
    const who = player(s, f.who);
    let amount = 1;
    if (askerId !== f.who && hasSkill(s, who, 'jiuyuan')
        && factionOf(s, player(s, askerId)) === 'wu') {
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
        f.queue = orderFrom(s).flatMap((pid): Array<{ pid: PlayerId; skill: 'guicai' | 'guidao' }> => {
          const q = player(s, pid);
          if (hasSkill(s, q, 'guicai')) return [{ pid, skill: 'guicai' as const }];
          if (hasSkill(s, q, 'guidao')) return [{ pid, skill: 'guidao' as const }];
          return [];
        });
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
          // 颂威:其他魏势力角色的黑色判定牌生效后,主公曹丕摸一张(简化为自动)
          if (isBlack(card(s, cid).suit) && factionOf(s, judged) === 'wei') {
            const kaiser = alivePlayers(s).find(
              (x) => x.id !== f.player && hasSkill(s, x, 'songwei'),
            );
            if (kaiser) {
              emit(ctx, { type: 'skillInvoked', player: kaiser.id, skill: 'songwei' });
              drawCards(ctx, kaiser.id, 1);
            }
          }
          popFrame(ctx, f, { cardId: cid });
          return;
        }
        const entry = queue[f.idx!];
        const p = player(s, entry.pid);
        const usable = entry.skill === 'guidao'
          ? [...p.hand, ...equipCardIds(p)].some((id) => isBlack(card(s, id).suit))
          : p.hand.length > 0;
        if (!p.alive || !usable) { f.idx!++; return; }
        ask(ctx, {
          player: p.id, type: 'choose-cards',
          from: entry.skill === 'guidao' ? 'hand-equips' : 'hand',
          min: 1, max: 1,
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
    const entry = f.queue![f.idx!];
    const pid = entry.pid;
    const p = player(ctx.s, pid);
    if (r.cardIds.length !== 1) fail('需要打出一张牌替换判定');
    if (entry.skill === 'guidao') {
      const cid = r.cardIds[0];
      if (!p.hand.includes(cid) && !equipCardIds(p).includes(cid)) fail('所选牌不属于你');
      if (!isBlack(card(ctx.s, cid).suit)) fail('鬼道需要黑色牌');
    } else if (!p.hand.includes(r.cardIds[0])) {
      fail('鬼才需要打出一张手牌');
    }
    emit(ctx, { type: 'skillInvoked', player: pid, skill: entry.skill });
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
      if (canWuxie(ctx, p)) {
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
    emit(ctx, { type: 'cardResponded', player: pid, cardId: cid, as: r.skill === 'kanpo' ? 'wuxie' : undefined });
    if (r.skill === 'kanpo') emit(ctx, { type: 'skillInvoked', player: pid, skill: 'kanpo' });
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
        // 智迟:回合外受过伤的陈宫,本回合非延时锦囊对其无效
        if (tgt.flags.zhichi && f.target !== f.source) {
          emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'zhichi' });
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
      const want = hasSkill(s, player(s, f.player), 'jguanxing')
        ? (alivePlayers(s).length >= 4 ? 5 : 3)   // 界观星:固定 5 张,人少时 3 张
        : Math.min(5, alivePlayers(s).length);
      const n = Math.min(want, s.drawPile.length);
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
            if (hasSkill(s, player(s, f.player), 'jluoshen')) {
              // 界洛神:获得的判定牌本回合不计入手牌上限
              const me = player(s, f.player);
              me.flags.luoshenBonus = Number(me.flags.luoshenBonus ?? 0) + 1;
            }
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
  if (hasSkill(ctx.s, p, 'yingzi') || hasSkill(ctx.s, p, 'jyingzi')) {
    emit(ctx, {
      type: 'skillInvoked', player: pid,
      skill: hasSkill(ctx.s, p, 'jyingzi') ? 'jyingzi' : 'yingzi',
    });
    n += 1;
  }
  if (n > 0) drawCards(ctx, pid, n);
}

const drawStep: FrameHandler<DrawStepFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const p = player(s, f.player);
    if (f.step === 'shuangxiong-judged') {
      const cid = f.childResult!.cardId;
      f.childResult = undefined;
      // 获得判定牌;本回合可将与其颜色不同的手牌当决斗使用(牌 id 存 flags)
      moveCard(ctx, cid, { zone: 'hand', player: f.player }, 'shuangxiong');
      p.flags.shuangxiong = cid;
      popFrame(ctx, f);
      return;
    }
    if (f.step !== 'ask') fail(`draw-step 帧在 ${f.step} 步不应被 run`);
    if (hasSkill(s, p, 'shelie')) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['shelie'], canDecline: true, reason: 'shelie' });
      f.step = 'shelie-wait';
      return;
    }
    if (hasSkill(s, p, 'zaiqi') && p.hp < p.maxHp) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['zaiqi'], canDecline: true, reason: 'zaiqi' });
      f.step = 'zaiqi-wait';
      return;
    }
    if (hasSkill(s, p, 'haoshi')) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['haoshi'], canDecline: true, reason: 'haoshi' });
      f.step = 'haoshi-wait';
      return;
    }
    if (hasSkill(s, p, 'shuangxiong')) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['shuangxiong'], canDecline: true, reason: 'shuangxiong' });
      f.step = 'shuangxiong-wait';
      return;
    }
    if ((hasSkill(s, p, 'tuxi') || hasSkill(s, p, 'jtuxi'))
        && tuxiCandidates(ctx, f.player).length > 0) {
      ask(ctx, { player: f.player, type: 'choose-option', options: ['tuxi'], canDecline: true, reason: 'tuxi' });
      f.step = 'tuxi-wait';
      return;
    }
    if (hasSkill(s, p, 'luoyi') || hasSkill(s, p, 'jluoyi')) {
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
        // 界突袭:少摸 X 张改为获得 X 名角色各一张(X<2 时补摸)
        if (hasSkill(s, player(s, f.player), 'jtuxi') && resp.players.length < 2) {
          drawCards(ctx, f.player, 2 - resp.players.length);
        }
        popFrame(ctx, f);
        return;
      }
      case 'shelie-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'shelie' });
        const seen = new Set<string>();
        for (let i = 0; i < 5; i++) {
          refillDrawPile(ctx);
          if (s.drawPile.length === 0) break;
          const cid = flipToProcessing(ctx);
          emit(ctx, { type: 'cardRevealed', player: f.player, cardId: cid, reason: 'shelie' });
          const suit = card(s, cid).suit;
          if (!seen.has(suit)) {
            seen.add(suit);
            moveCard(ctx, cid, { zone: 'hand', player: f.player }, 'shelie');
          } else {
            moveCard(ctx, cid, { zone: 'discard' }, 'shelie');
          }
        }
        popFrame(ctx, f);
        return;
      }
      case 'zaiqi-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'zaiqi' });
        const p = player(s, f.player);
        const x = p.maxHp - p.hp;
        for (let i = 0; i < x; i++) {
          refillDrawPile(ctx);
          if (s.drawPile.length === 0) break;
          const cid = flipToProcessing(ctx);
          emit(ctx, { type: 'cardRevealed', player: f.player, cardId: cid, reason: 'zaiqi' });
          if (card(s, cid).suit === 'heart') {
            moveCard(ctx, cid, { zone: 'discard' }, 'zaiqi');
            heal(ctx, f.player, 1);
          } else {
            moveCard(ctx, cid, { zone: 'hand', player: f.player }, 'zaiqi');
          }
        }
        popFrame(ctx, f);
        return;
      }
      case 'haoshi-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'haoshi' });
        normalDraw(ctx, f.player, 2); // 额外摸两张
        const p = player(s, f.player);
        const others = alivePlayers(s).filter((x) => x.id !== f.player);
        if (p.hand.length <= 5 || others.length === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.player, type: 'choose-cards', from: 'hand',
          min: Math.floor(p.hand.length / 2), max: Math.floor(p.hand.length / 2),
          canDecline: false, reason: { kind: 'haoshi' },
        });
        f.step = 'haoshi-cards';
        return;
      }
      case 'haoshi-cards': {
        if (resp.kind !== 'cards') fail('应答类型不符合当前请求');
        const p = player(s, f.player);
        const need = Math.floor(p.hand.length / 2);
        if (resp.cardIds.length !== need
            || new Set(resp.cardIds).size !== resp.cardIds.length
            || !resp.cardIds.every((id) => p.hand.includes(id))) {
          fail(`好施需要交出 ${need} 张手牌`);
        }
        f.hsCards = resp.cardIds;
        const others = alivePlayers(s).filter((x) => x.id !== f.player);
        const min = Math.min(...others.map((x) => x.hand.length));
        const cands = others.filter((x) => x.hand.length === min).map((x) => x.id);
        if (cands.length === 1) {
          moveCards(ctx, f.hsCards, { zone: 'hand', player: cands[0] }, 'haoshi');
          popFrame(ctx, f);
          return;
        }
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: 1,
          candidates: cands, canDecline: false, reason: { kind: 'haoshi' },
        });
        f.step = 'haoshi-player';
        return;
      }
      case 'haoshi-player': {
        if (resp.kind !== 'players' || resp.players.length !== 1) fail('好施需要选择一名角色');
        const others = alivePlayers(s).filter((x) => x.id !== f.player);
        const min = Math.min(...others.map((x) => x.hand.length));
        const cands = others.filter((x) => x.hand.length === min).map((x) => x.id);
        if (!cands.includes(resp.players[0])) fail('好施只能交给手牌最少的角色');
        moveCards(ctx, f.hsCards!, { zone: 'hand', player: resp.players[0] }, 'haoshi');
        popFrame(ctx, f);
        return;
      }
      case 'shuangxiong-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'shuangxiong' });
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.player, reason: 'shuangxiong' });
        f.step = 'shuangxiong-judged';
        return;
      }
      case 'luoyi-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { normalDraw(ctx, f.player); popFrame(ctx, f); return; }
        if (hasSkill(s, player(s, f.player), 'jluoyi')) {
          // 界裸衣:放弃摸牌,亮出三张,获得其中的基本牌/武器牌/决斗
          emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'jluoyi' });
          for (let i = 0; i < 3; i++) {
            refillDrawPile(ctx);
            if (s.drawPile.length === 0) break;
            const cid = flipToProcessing(ctx);
            emit(ctx, { type: 'cardRevealed', player: f.player, cardId: cid, reason: 'luoyi' });
            const keep = cardCategory(s, cid) === 'basic'
              || equipSlotOf(card(s, cid).name) === 'weapon'
              || card(s, cid).name === 'juedou';
            moveCard(ctx, cid, keep ? { zone: 'hand', player: f.player } : { zone: 'discard' }, 'luoyi');
          }
          player(s, f.player).flags.luoyi = true;
          popFrame(ctx, f);
          return;
        }
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
        const cn = card(s, cur).name;
        pushFrame(ctx, {
          type: 'judge', step: 'flip', player: f.who,
          reason: cn === 'shandian' ? 'shandian' : cn === 'bingliang' ? 'bingliang' : 'lebusishu',
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
          const struck = jc !== null && effectiveSuit(s, jc.id, f.who) === 'spade'
            && jc.rank >= 2 && jc.rank <= 9;
          if (struck) {
            if (who.judgeZone.includes(cur)) moveCard(ctx, cur, { zone: 'processing' }, 'shandian');
            pushDamage(ctx, { source: null, target: f.who, amount: 3, causeCardIds: [cur], element: 'thunder' });
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
        if (curName === 'bingliang') {
          // 兵粮寸断:非梅花则跳过摸牌阶段
          if (res?.cardId !== undefined && effectiveSuit(s, res.cardId, f.who) !== 'club') {
            who.flags.skipDraw = true;
          }
          if (who.judgeZone.includes(cur)) {
            moveCard(ctx, cur, { zone: 'discard' }, 'delayed');
          }
          f.step = 'next';
          return;
        }
        // 乐不思蜀:非红桃则跳过出牌阶段
        if (res?.cardId !== undefined && effectiveSuit(s, res.cardId, f.who) !== 'heart') {
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
        // 奋威(界甘宁,限定技):群体锦囊指定目标后,可令其对任意名目标无效
        if (!f.fwAsked && (f.effName === 'nanman' || f.effName === 'wanjian')) {
          f.fwAsked = true;
          const gan = alivePlayers(s).find(
            (x) => hasSkill(s, x, 'fenwei') && !(x.usedLimit ?? []).includes('fenwei'),
          );
          if (gan && f.queue.some((q) => player(s, q).alive)) {
            f.fwWho = gan.id;
            ask(ctx, { player: gan.id, type: 'choose-option', options: ['fenwei'], canDecline: true, reason: 'fenwei' });
            f.step = 'fenwei-wait';
            return;
          }
        }
        if (f.idx >= f.queue.length) {
          // 五谷剩余的牌进弃牌堆
          for (const id of f.shownIds ?? []) discardIfProcessing(ctx, id);
          for (const id of f.extraCardIds ?? []) discardIfProcessing(ctx, id);
          // 巨象:其他角色使用的南蛮入侵结算完毕后,祝融获得之
          if (f.effName === 'nanman' && inProcessing(s, f.cardId)) {
            const zr = alivePlayers(s).find(
              (x) => x.id !== f.source && hasSkill(s, x, 'juxiang'),
            );
            if (zr) {
              emit(ctx, { type: 'skillInvoked', player: zr.id, skill: 'juxiang' });
              moveCard(ctx, f.cardId, { zone: 'hand', player: zr.id }, 'juxiang');
            }
          }
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
        // 藤甲:南蛮入侵/万箭齐发无效
        if ((f.effName === 'nanman' || f.effName === 'wanjian')
            && armorName(s, tgt) === 'tengjia') {
          emit(ctx, { type: 'skillInvoked', player: tgt.id, skill: 'tengjia' });
          f.idx++;
          return;
        }
        // 祸首/巨象:南蛮入侵对孟获/祝融无效;帷幕:黑色锦囊(南蛮)不能指定贾诩
        if (f.effName === 'nanman') {
          const immune = (['huoshou', 'juxiang', 'weimu'] as const)
            .find((sk) => hasSkill(s, tgt, sk));
          if (immune) {
            emit(ctx, { type: 'skillInvoked', player: tgt.id, skill: immune });
            f.idx++;
            return;
          }
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
        // 智迟:非延时锦囊对陈宫无效
        if (player(s, tgtId).flags.zhichi && tgtId !== f.source) {
          emit(ctx, { type: 'skillInvoked', player: tgtId, skill: 'zhichi' });
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
    const s = ctx.s;
    const tgtId = f.queue[f.idx];
    switch (f.step) {
      case 'card-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (!r) {
          // 祸首:其他角色使用的南蛮入侵,由孟获代替成为伤害来源
          let dmgSource = f.source;
          if (f.effName === 'nanman') {
            const mh = alivePlayers(s).find(
              (x) => x.id !== f.source && hasSkill(s, x, 'huoshou'),
            );
            if (mh) dmgSource = mh.id;
          }
          pushDamage(ctx, {
            source: dmgSource, target: tgtId, amount: 1, causeCardIds: [f.cardId],
          });
        } else {
          const pattern = f.effName === 'nanman' ? 'sha' : 'shan';
          const cid = validateResponseCard(ctx, tgtId, r, pattern);
          moveCard(ctx, cid, { zone: 'discard' }, 'respond');
          emit(ctx, { type: 'cardResponded', player: tgtId, cardId: cid, as: r.skill ? pattern : undefined });
          if (pattern === 'shan') maybeLeiji(ctx, tgtId);
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
      case 'fenwei-wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { f.step = 'next'; return; }
        const gan = player(s, f.fwWho!);
        gan.usedLimit = [...(gan.usedLimit ?? []), 'fenwei'];
        emit(ctx, { type: 'skillInvoked', player: f.fwWho!, skill: 'fenwei' });
        const cands = f.queue.filter((q) => player(s, q).alive);
        ask(ctx, {
          player: f.fwWho!, type: 'choose-player', min: 1, max: cands.length,
          candidates: cands, canDecline: false, reason: { kind: 'fenwei' },
        });
        f.step = 'fenwei-players';
        return;
      }
      case 'fenwei-players': {
        if (resp.kind !== 'players' || resp.players.length === 0) fail('奋威需要选择目标');
        if (!resp.players.every((pid) => f.queue.includes(pid))) fail('奋威只能指定此牌的目标');
        f.queue = f.queue.filter((q) => !resp.players.includes(q));
        emit(ctx, { type: 'targeted', source: f.fwWho!, targets: [...resp.players] });
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

// ---------- 火攻 ----------

const huogong: FrameHandler<HuogongFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'start': {
        pushFrame(ctx, {
          type: 'wuxie', step: 'ask', negated: false, idx: 0,
          info: { cardName: 'huogong', source: f.source, target: f.target },
        });
        f.step = 'after-wuxie';
        return;
      }
      case 'after-wuxie': {
        const negated = f.childResult?.negated ?? false;
        f.childResult = undefined;
        const tgt = player(s, f.target);
        const src = player(s, f.source);
        if (negated || !tgt.alive || !src.alive || tgt.hand.length === 0
            || (tgt.flags.zhichi && f.target !== f.source)) {
          if (negated) emit(ctx, { type: 'nullified', cardName: 'huogong', target: f.target });
          if (tgt.flags.zhichi && !negated && f.target !== f.source) {
            emit(ctx, { type: 'skillInvoked', player: f.target, skill: 'zhichi' });
          }
          discardIfProcessing(ctx, f.cardId);
          popFrame(ctx, f);
          return;
        }
        ask(ctx, {
          player: f.target, type: 'choose-cards', from: 'hand',
          min: 1, max: 1, canDecline: false, reason: { kind: 'huogong-show' },
        });
        f.step = 'show-wait';
        return;
      }
      default:
        fail(`huogong 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'show-wait': {
        if (resp.kind !== 'cards' || resp.cardIds.length !== 1) fail('需要展示一张手牌');
        const tgt = player(s, f.target);
        if (!tgt.hand.includes(resp.cardIds[0])) fail('所选牌不在手牌中');
        f.shownCard = resp.cardIds[0];
        emit(ctx, { type: 'cardRevealed', player: f.target, cardId: f.shownCard, reason: 'huogong' });
        ask(ctx, {
          player: f.source, type: 'choose-cards', from: 'hand',
          min: 1, max: 1, canDecline: true,
          reason: { kind: 'huogong-match', suit: card(s, f.shownCard).suit, target: f.target },
        });
        f.step = 'match-wait';
        return;
      }
      case 'match-wait': {
        const r = expectDeclineOr(resp, 'cards');
        discardIfProcessing(ctx, f.cardId);
        if (!r) { popFrame(ctx, f); return; }
        const src = player(s, f.source);
        if (r.cardIds.length !== 1 || !src.hand.includes(r.cardIds[0])) fail('所选牌不在手牌中');
        if (card(s, r.cardIds[0]).suit !== card(s, f.shownCard!).suit) {
          fail('需要弃置与展示牌相同花色的手牌');
        }
        emit(ctx, { type: 'cardRevealed', player: f.source, cardId: r.cardIds[0], reason: 'huogong' });
        moveCard(ctx, r.cardIds[0], { zone: 'discard' }, 'huogong');
        popFrame(ctx, f);
        pushDamage(ctx, {
          source: f.source, target: f.target, amount: 1,
          causeCardIds: [], element: 'fire',
        });
        return;
      }
      default:
        fail(`huogong 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 铁索连环(横置/重置,逐目标可无懈) ----------

const tiesuo: FrameHandler<TiesuoFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'next': {
        if (f.idx >= f.queue.length) {
          discardIfProcessing(ctx, f.cardId);
          popFrame(ctx, f);
          return;
        }
        const tgt = player(s, f.queue[f.idx]);
        if (!tgt.alive) { f.idx++; return; }
        pushFrame(ctx, {
          type: 'wuxie', step: 'ask', negated: false, idx: 0,
          info: { cardName: 'tiesuo', source: f.source, target: tgt.id },
        });
        f.step = 'after-wuxie';
        return;
      }
      case 'after-wuxie': {
        const negated = f.childResult?.negated ?? false;
        f.childResult = undefined;
        const tgtId = f.queue[f.idx];
        if (negated) {
          emit(ctx, { type: 'nullified', cardName: 'tiesuo', target: tgtId });
        } else if (player(s, tgtId).alive) {
          toggleChain(ctx, tgtId);
        }
        f.idx++;
        f.step = 'next';
        return;
      }
      default:
        fail(`tiesuo 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse() {
    fail('tiesuo 帧不接受应答');
  },
};

// ---------- 神速(夏侯渊) ----------

export function pushVirtualSlash(ctx: Ctx, source: PlayerId, target: PlayerId): void {
  emit(ctx, { type: 'virtualCard', player: source, as: 'sha', targets: [target] });
  pushFrame(ctx, {
    type: 'slash', step: 'start', source, target, cardId: null, noSuit: true,
  });
}

const shensu: FrameHandler<ShensuFrame> = {
  run(ctx, f) {
    if (f.step !== 'wait') fail(`shensu 帧在 ${f.step} 步不应被 run`);
    const opt = f.variant === 1 ? 'shensu1' : f.variant === 2 ? 'shensu2' : 'shensu3';
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: [opt], canDecline: true,
      reason: opt,
    });
    f.step = f.variant === 2 ? 'equip-wait' : 'target-wait';
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const p = player(s, f.player);
    switch (f.step) {
      case 'equip-wait': {
        // 变体2:先应答是否发动,再弃一张装备
        if (resp.kind === 'decline') { popFrame(ctx, f); return; }
        if (resp.kind === 'option') {
          ask(ctx, {
            player: f.player, type: 'choose-cards', from: 'hand-equips',
            excludeIds: [...p.hand],
            min: 1, max: 1, canDecline: true, reason: { kind: 'shensu-equip' },
          });
          return;
        }
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { popFrame(ctx, f); return; }
        if (r.cardIds.length !== 1 || !equipCardIds(p).includes(r.cardIds[0])) {
          fail('神速需要弃置一张装备区的牌');
        }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'shensu' });
        p.flags.playEnded = true;
        emit(ctx, { type: 'phaseSkipped', player: f.player, phase: 'play', reason: 'shensu' });
        moveCard(ctx, r.cardIds[0], { zone: 'discard' }, 'shensu');
        askShensuTarget(ctx, f);
        f.step = 'target-wait';
        return;
      }
      case 'target-wait': {
        if (resp.kind === 'decline') { popFrame(ctx, f); return; }
        if (resp.kind === 'option') {
          emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'shensu' });
          if (f.variant === 3) {
            // 神速③(界夏侯渊):跳过弃牌阶段并翻面,视为使用一张杀
            p.flags.qbSkipDiscard = true;
            p.flipped = true;
            emit(ctx, { type: 'flipped', player: f.player, flipped: true });
          } else {
            // 变体1:发动,跳过判定与摸牌
            p.flags.skipJudge = true;
            p.flags.skipDraw = true;
          }
          askShensuTarget(ctx, f);
          return;
        }
        const r = expectDeclineOr(resp, 'players');
        if (!r || r.players.length !== 1) fail('神速需要选择一个目标');
        const t = player(s, r.players[0]);
        if (!t.alive || t.id === f.player) fail('神速的目标不合法');
        popFrame(ctx, f);
        pushVirtualSlash(ctx, f.player, t.id); // 视为使用杀,无距离限制
        return;
      }
      default:
        fail(`shensu 帧在 ${f.step} 步不接受应答`);
    }
  },
};

function askShensuTarget(ctx: Ctx, f: ShensuFrame): void {
  ask(ctx, {
    player: f.player, type: 'choose-player', min: 1, max: 1,
    candidates: alivePlayers(ctx.s).filter((x) => x.id !== f.player).map((x) => x.id),
    canDecline: true, reason: { kind: 'slash' },
  });
}

// ---------- 据守(曹仁) ----------

const jushou: FrameHandler<JushouFrame> = {
  run(ctx, f) {
    if (f.step !== 'wait') fail(`jushou 帧在 ${f.step} 步不应被 run`);
    ask(ctx, { player: f.player, type: 'choose-option', options: ['jushou'], canDecline: true, reason: 'jushou' });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const p = player(s, f.player);
    if (f.step === 'discard-wait') {
      // 界据守:摸四张后弃一张,然后翻面
      if (resp.kind !== 'cards' || resp.cardIds.length !== 1 || !p.hand.includes(resp.cardIds[0])) {
        fail('据守:需要弃置一张手牌');
      }
      moveCard(ctx, resp.cardIds[0], { zone: 'discard' }, 'jushou');
      popFrame(ctx, f);
      p.flipped = true;
      emit(ctx, { type: 'flipped', player: f.player, flipped: true });
      return;
    }
    const r = expectDeclineOr(resp, 'option');
    if (!r) { popFrame(ctx, f); return; }
    if (hasSkill(s, p, 'jjushou')) {
      emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'jjushou' });
      drawCards(ctx, f.player, 4);
      ask(ctx, {
        player: f.player, type: 'choose-cards', from: 'hand',
        min: 1, max: 1, canDecline: false, reason: { kind: 'jjushou' },
      });
      f.step = 'discard-wait';
      return;
    }
    popFrame(ctx, f);
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'jushou' });
    drawCards(ctx, f.player, 3);
    p.flipped = true;
    emit(ctx, { type: 'flipped', player: f.player, flipped: true });
  },
};

// ---------- 雷击(张角) ----------

const leiji: FrameHandler<LeijiFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'ask': {
        if (!player(s, f.player).alive) { popFrame(ctx, f); return; }
        ask(ctx, { player: f.player, type: 'choose-option', options: ['leiji'], canDecline: true, reason: 'leiji' });
        f.step = 'wait';
        return;
      }
      case 'judged': {
        const res = f.childResult;
        f.childResult = undefined;
        const suit = res !== undefined ? effectiveSuit(s, res.cardId, f.target) : '';
        const jl = hasSkill(s, player(s, f.player), 'jleiji');
        popFrame(ctx, f);
        if (!player(s, f.target!).alive) return;
        if (suit === 'spade') {
          pushDamage(ctx, {
            source: f.player, target: f.target!, amount: 2,
            causeCardIds: [], element: 'thunder',
          });
        } else if (jl && suit === 'club') {
          // 界雷击:梅花则造成 1 点雷电伤害,你回复 1 点体力
          pushDamage(ctx, {
            source: f.player, target: f.target!, amount: 1,
            causeCardIds: [], element: 'thunder',
          });
          heal(ctx, f.player, 1);
        }
        return;
      }
      default:
        fail(`leiji 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: 1,
          candidates: alivePlayers(s).filter((x) => x.id !== f.player).map((x) => x.id),
          canDecline: true, reason: { kind: 'leiji' },
        });
        f.step = 'player-wait';
        return;
      }
      case 'player-wait': {
        const r = expectDeclineOr(resp, 'players');
        if (!r) { popFrame(ctx, f); return; }
        if (r.players.length !== 1 || !player(s, r.players[0]).alive) fail('雷击的目标不合法');
        emit(ctx, {
          type: 'skillInvoked', player: f.player,
          skill: hasSkill(s, player(s, f.player), 'jleiji') ? 'jleiji' : 'leiji',
        });
        f.target = r.players[0];
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.target, reason: 'leiji' });
        f.step = 'judged';
        return;
      }
      default:
        fail(`leiji 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 蛊惑(于吉,简化裁定:质疑真牌者失去 1 点体力) ----------

const guhuo: FrameHandler<GuhuoFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'next': {
        while (f.idx < f.queue.length) {
          const pid = f.queue[f.idx];
          // 缠怨:不能质疑蛊惑
          if (player(s, pid).alive && !(player(s, pid).usedLimit ?? []).includes('chanyuan')) {
            ask(ctx, {
              player: pid, type: 'choose-option', options: ['guhuo-challenge'],
              canDecline: true, reason: 'guhuo-challenge',
            });
            f.step = 'challenge-wait';
            return;
          }
          f.idx++;
        }
        f.step = 'resolve';
        return;
      }
      case 'resolve': {
        const real = card(s, f.cardId).name === f.declared;
        emit(ctx, { type: 'cardRevealed', player: f.player, cardId: f.cardId, reason: 'guhuo' });
        popFrame(ctx, f); // 先弹出自身,后续 loseHp/结算才能安全压栈
        if (f.challenger !== undefined && !real) {
          // 假牌被质疑:弃置,无效
          moveCard(ctx, f.cardId, { zone: 'discard' }, 'guhuo');
          return;
        }
        try {
          resolvePlayAs(ctx, player(s, f.player), f.cardId, f.declared, f.targets);
        } catch (e) {
          if (e instanceof EngineError) {
            // 结算时目标已不合法等:牌作废
            if (player(s, f.player).hand.includes(f.cardId)) {
              moveCard(ctx, f.cardId, { zone: 'discard' }, 'guhuo');
            } else {
              discardIfProcessing(ctx, f.cardId);
            }
          } else {
            throw e;
          }
        }
        if (f.challenger !== undefined && real) {
          if (hasSkill(s, player(s, f.player), 'jguhuo')) {
            // 界蛊惑:质疑真牌者获得"缠怨"(不能再质疑;体力为 1 时其他技能失效)
            const ch = player(s, f.challenger);
            if (!(ch.usedLimit ?? []).includes('chanyuan')) {
              ch.usedLimit = [...(ch.usedLimit ?? []), 'chanyuan'];
              emit(ctx, { type: 'skillInvoked', player: f.challenger, skill: 'chanyuan' });
            }
          } else {
            // 真牌被质疑:质疑者失去 1 点体力(压栈在牌的结算帧之上,先行结算)
            loseHp(ctx, f.challenger, 1);
          }
        }
        return;
      }
      default:
        fail(`guhuo 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(_ctx, f, resp) {
    if (f.step !== 'challenge-wait') fail('guhuo 帧当前不接受应答');
    const r = expectDeclineOr(resp, 'option');
    if (r) {
      f.challenger = f.queue[f.idx];
      f.step = 'resolve';
      return;
    }
    f.idx++;
    f.step = 'next';
  },
};

// ---------- 拼点(驱虎/天义共用) ----------

function askPindianCard(ctx: Ctx, who: PlayerId, other: PlayerId): void {
  ask(ctx, {
    player: who, type: 'choose-cards', from: 'hand',
    min: 1, max: 1, canDecline: false, reason: { kind: 'pindian', target: other },
  });
}

const pindian: FrameHandler<PindianFrame> = {
  run(ctx, f) {
    if (f.step !== 'start') fail(`pindian 帧在 ${f.step} 步不应被 run`);
    askPindianCard(ctx, f.a, f.b);
    f.step = 'a-wait';
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (resp.kind !== 'cards' || resp.cardIds.length !== 1) fail('拼点需要选择一张手牌');
    const cid = resp.cardIds[0];
    if (f.step === 'a-wait') {
      if (!player(s, f.a).hand.includes(cid)) fail('这张牌不在你的手牌中');
      moveCard(ctx, cid, { zone: 'processing' }, 'pindian');
      f.cardA = cid;
      askPindianCard(ctx, f.b, f.a);
      f.step = 'b-wait';
      return;
    }
    if (f.step !== 'b-wait') fail('pindian 帧当前不接受应答');
    if (!player(s, f.b).hand.includes(cid)) fail('这张牌不在你的手牌中');
    moveCard(ctx, cid, { zone: 'processing' }, 'pindian');
    const cardA = f.cardA!;
    emit(ctx, { type: 'cardRevealed', player: f.a, cardId: cardA, reason: 'pindian' });
    emit(ctx, { type: 'cardRevealed', player: f.b, cardId: cid, reason: 'pindian' });
    const won = card(s, cardA).rank > card(s, cid).rank;
    emit(ctx, { type: 'pindian', a: f.a, b: f.b, cardA, cardB: cid, won });
    moveCard(ctx, cardA, { zone: 'discard' }, 'pindian');
    moveCard(ctx, cid, { zone: 'discard' }, 'pindian');
    popFrame(ctx, f, { won });
  },
};

// ---------- 驱虎(荀彧) ----------

const quhu: FrameHandler<QuhuFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'start': {
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'quhu' });
        f.step = 'pindian-done';
        pushFrame(ctx, { type: 'pindian', step: 'start', a: f.source, b: f.target });
        return;
      }
      case 'pindian-done': {
        const won = f.childResult?.won ?? false;
        f.childResult = undefined;
        const tgt = player(s, f.target);
        if (!won) {
          // 拼点没赢:目标对你造成 1 点伤害
          popFrame(ctx, f);
          if (tgt.alive && player(s, f.source).alive) {
            pushDamage(ctx, { source: f.target, target: f.source, amount: 1, causeCardIds: [] });
          }
          return;
        }
        const victims = alivePlayers(s)
          .filter((x) => x.id !== f.target
            && distance(s, f.target, x.id) <= attackRange(s, tgt))
          .map((x) => x.id);
        if (!tgt.alive || victims.length === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.source, type: 'choose-player', min: 1, max: 1,
          candidates: victims, canDecline: false, reason: { kind: 'quhu' },
        });
        f.step = 'victim-wait';
        return;
      }
      default:
        fail(`quhu 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step !== 'victim-wait') fail('quhu 帧当前不接受应答');
    if (resp.kind !== 'players' || resp.players.length !== 1) fail('驱虎需要选择一个目标');
    const victim = resp.players[0];
    const tgt = player(s, f.target);
    if (victim === f.target || !player(s, victim).alive
        || distance(s, f.target, victim) > attackRange(s, tgt)) {
      fail('驱虎的目标须在拼点对象的攻击范围内');
    }
    popFrame(ctx, f);
    pushDamage(ctx, { source: f.target, target: victim, amount: 1, causeCardIds: [] });
  },
};

// ---------- 天义(太史慈) ----------

const tianyi: FrameHandler<TianyiFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const skill = f.skill ?? 'tianyi';
    switch (f.step) {
      case 'start': {
        emit(ctx, { type: 'skillInvoked', player: f.source, skill });
        f.step = 'done';
        pushFrame(ctx, { type: 'pindian', step: 'start', a: f.source, b: f.target });
        return;
      }
      case 'done': {
        const won = f.childResult?.won ?? false;
        const p = player(s, f.source);
        if (skill === 'xianzhen') {
          if (won) p.flags.xianzhen = player(s, f.target).seat;
          else p.flags.xianzhenLose = true;
        } else if (won) {
          p.flags.tianyiWin = true;
        } else {
          p.flags.tianyiLose = true;
        }
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`tianyi 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse() {
    fail('tianyi 帧不接受应答');
  },
};

// ---------- 屯田(邓艾) ----------

const tuntian: FrameHandler<TuntianFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'ask': {
        if (!player(s, f.player).alive) { popFrame(ctx, f); return; }
        ask(ctx, { player: f.player, type: 'choose-option', options: ['tuntian'], canDecline: true, reason: 'tuntian' });
        f.step = 'wait';
        return;
      }
      case 'judged': {
        const res = f.childResult;
        f.childResult = undefined;
        popFrame(ctx, f);
        if (res && card(s, res.cardId).suit !== 'heart' && player(s, f.player).alive) {
          moveCard(ctx, res.cardId, { zone: 'tian', player: f.player }, 'tuntian');
        }
        return;
      }
      default:
        fail(`tuntian 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    if (f.step !== 'wait') fail('tuntian 帧当前不接受应答');
    const r = expectDeclineOr(resp, 'option');
    if (!r) { popFrame(ctx, f); return; }
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'tuntian' });
    pushFrame(ctx, { type: 'judge', step: 'flip', player: f.player, reason: 'tuntian' });
    f.step = 'judged';
  },
};

// ---------- 巧变(张郃) ----------

// 目标角色可被"移动牌"的候选:装备(接收方对应槽为空)与延时锦囊(接收方无同名)
function qiaobianMovable(ctx: Ctx, pid: PlayerId): CardId[] {
  const p = player(ctx.s, pid);
  return [...equipCardIds(p), ...p.judgeZone];
}

const qiaobian: FrameHandler<QiaobianFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step === 'move-start') {
      // 解围(界曹仁):翻回正面后可直接移动场上一张牌(无需弃牌)
      const srcs = alivePlayers(s)
        .filter((x) => qiaobianMovable(ctx, x.id).length > 0)
        .map((x) => x.id);
      if (srcs.length === 0) { popFrame(ctx, f); return; }
      ask(ctx, {
        player: f.player, type: 'choose-player', min: 1, max: 1,
        candidates: srcs, canDecline: true, reason: { kind: 'qiaobian' },
      });
      f.step = 'move-src';
      return;
    }
    if (f.step !== 'ask') fail(`qiaobian 帧在 ${f.step} 步不应被 run`);
    if (player(s, f.player).hand.length === 0) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.player, type: 'choose-cards', from: 'hand',
      min: 1, max: 1, canDecline: true, reason: { kind: 'qiaobian' },
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const me = player(s, f.player);
    switch (f.step) {
      case 'ask': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { popFrame(ctx, f); return; }
        if (r.cardIds.length !== 1 || !me.hand.includes(r.cardIds[0])) fail('巧变需要弃置一张手牌');
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'qiaobian' });
        moveCard(ctx, r.cardIds[0], { zone: 'discard' }, 'qiaobian');
        emit(ctx, { type: 'phaseSkipped', player: f.player, phase: f.phase, reason: 'qiaobian' });
        if (f.phase === 'judge') {
          me.flags._judge = true;
          popFrame(ctx, f);
          return;
        }
        if (f.phase === 'discard') {
          me.flags.qbSkipDiscard = true;
          popFrame(ctx, f);
          return;
        }
        if (f.phase === 'draw') {
          me.flags._draw = true;
          const cands = alivePlayers(s)
            .filter((x) => x.id !== f.player && x.hand.length > 0)
            .map((x) => x.id);
          if (cands.length === 0) { popFrame(ctx, f); return; }
          ask(ctx, {
            player: f.player, type: 'choose-player', min: 1, max: Math.min(2, cands.length),
            candidates: cands, canDecline: true, reason: { kind: 'qiaobian' },
          });
          f.step = 'draw-players';
          return;
        }
        // play:跳过出牌,改为移动场上一张牌
        me.flags.playEnded = true;
        const srcs = alivePlayers(s)
          .filter((x) => qiaobianMovable(ctx, x.id).length > 0)
          .map((x) => x.id);
        if (srcs.length === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: 1,
          candidates: srcs, canDecline: true, reason: { kind: 'qiaobian' },
        });
        f.step = 'move-src';
        return;
      }
      case 'draw-players': {
        const r = expectDeclineOr(resp, 'players');
        popFrame(ctx, f);
        if (!r) return;
        if (r.players.length < 1 || r.players.length > 2
            || new Set(r.players).size !== r.players.length) {
          fail('巧变至多选择两名角色');
        }
        for (const pid of r.players) {
          const victim = player(s, pid);
          if (!victim.alive || pid === f.player || victim.hand.length === 0) continue;
          const cid = pickRandomHand(ctx, victim);
          moveCard(ctx, cid, { zone: 'hand', player: f.player }, 'qiaobian');
        }
        return;
      }
      case 'move-src': {
        const r = expectDeclineOr(resp, 'players');
        if (!r) { popFrame(ctx, f); return; }
        if (r.players.length !== 1) fail('请选择一名角色');
        const from = player(s, r.players[0]);
        const movable = qiaobianMovable(ctx, from.id);
        if (movable.length === 0) fail('该角色没有可移动的牌');
        f.moveFrom = from.id;
        ask(ctx, {
          player: f.player, type: 'pick-card', target: from.id,
          handCount: 0, equips: equipCardIds(from), judges: [...from.judgeZone],
          reason: 'qiaobian',
        });
        f.step = 'move-pick';
        return;
      }
      case 'move-pick': {
        const cid = resolvePick(ctx, f.moveFrom!, resp);
        f.moveCard = cid;
        const isEquip = equipSlotOf(card(s, cid).name) !== null && !player(s, f.moveFrom!).judgeZone.includes(cid);
        const cname = card(s, cid).name;
        const dests = alivePlayers(s).filter((x) => {
          if (x.id === f.moveFrom) return false;
          if (isEquip) {
            const slot = equipSlotOf(cname)!;
            return x.equips[slot] === undefined;
          }
          return !x.judgeZone.some((jid) => card(s, jid).name === cname)
            && !hasSkill(s, x, 'qianxun');
        }).map((x) => x.id);
        if (dests.length === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: 1,
          candidates: dests, canDecline: true, reason: { kind: 'qiaobian' },
        });
        f.step = 'move-dest';
        return;
      }
      case 'move-dest': {
        const r = expectDeclineOr(resp, 'players');
        popFrame(ctx, f);
        if (!r) return;
        if (r.players.length !== 1) fail('请选择目标角色');
        const cid = f.moveCard!;
        const dest = player(s, r.players[0]);
        const inJudge = player(s, f.moveFrom!).judgeZone.includes(cid);
        if (inJudge) {
          if (dest.judgeZone.some((jid) => card(s, jid).name === card(s, cid).name)) {
            fail('目标判定区已有同名牌');
          }
          moveCard(ctx, cid, { zone: 'judge', player: dest.id }, 'qiaobian');
        } else {
          const slot = equipSlotOf(card(s, cid).name)!;
          if (dest.equips[slot] !== undefined) fail('目标对应装备栏已有牌');
          moveCard(ctx, cid, { zone: 'equip', player: dest.id }, 'qiaobian');
        }
        return;
      }
      default:
        fail(`qiaobian 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 挑衅(姜维) ----------

const tiaoxin: FrameHandler<TiaoxinFrame> = {
  run(ctx, f) {
    if (f.step !== 'sha-wait') fail(`tiaoxin 帧在 ${f.step} 步不应被 run`);
    ask(ctx, {
      player: f.target, type: 'respond-card', pattern: 'sha', canDecline: true,
      reason: { kind: 'tiaoxin', target: f.source },
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'sha-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (r) {
          const cid = validateResponseCard(ctx, f.target, r, 'sha');
          f.step = 'pick-wait'; // 占位防重入
          popFrame(ctx, f);
          moveCard(ctx, cid, { zone: 'processing' }, 'play');
          emit(ctx, { type: 'cardPlayed', player: f.target, cardId: cid, targets: [f.source] });
          pushFrame(ctx, { type: 'slash', step: 'start', source: f.target, target: f.source, cardId: cid });
          return;
        }
        const victim = player(s, f.target);
        if (totalCardCount(victim) === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.source, type: 'pick-card', target: f.target,
          handCount: victim.hand.length, equips: equipCardIds(victim), judges: [], reason: 'tiaoxin',
        });
        f.step = 'pick-wait';
        return;
      }
      case 'pick-wait': {
        const cid = resolvePick(ctx, f.target, resp);
        moveCard(ctx, cid, { zone: 'discard' }, 'tiaoxin');
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`tiaoxin 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 志继(姜维觉醒) ----------

const zhiji: FrameHandler<ZhijiFrame> = {
  run(ctx, f) {
    void ctx;
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: ['zhiji-heal', 'zhiji-draw'], canDecline: false, reason: 'zhiji',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (resp.kind !== 'option') fail('志继必须选择一项');
    const p = player(s, f.player);
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'zhiji' });
    p.usedLimit = [...(p.usedLimit ?? []), 'zhiji'];
    p.maxHp -= 1;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    emit(ctx, { type: 'hpChanged', player: f.player, hp: p.hp, delta: 0 });
    popFrame(ctx, f);
    if (resp.index === 0) heal(ctx, f.player, 1);
    else drawCards(ctx, f.player, 2);
  },
};

// ---------- 放权(刘禅) ----------

const fangquan: FrameHandler<FangquanFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const p = player(s, f.player);
    if (f.step === 'skip-wait') {
      ask(ctx, {
        player: f.player, type: 'choose-option', options: ['fangquan'],
        canDecline: true, reason: 'fangquan',
      });
      return;
    }
    if (f.step !== 'card-wait') fail(`fangquan 帧在 ${f.step} 步不应被 run`);
    if (p.hand.length === 0) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.player, type: 'choose-cards', from: 'hand',
      min: 1, max: 1, canDecline: true, reason: { kind: 'fangquan' },
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'skip-wait': {
        popFrame(ctx, f);
        if (resp.kind === 'decline') return;
        const p = player(s, f.player);
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'fangquan' });
        emit(ctx, { type: 'phaseSkipped', player: f.player, phase: 'play', reason: 'fangquan' });
        p.flags.playEnded = true;
        p.flags.fangquan = true;
        return;
      }
      case 'card-wait': {
        const r = expectDeclineOr(resp, 'cards');
        if (!r) { popFrame(ctx, f); return; }
        const p = player(s, f.player);
        if (r.cardIds.length !== 1 || !p.hand.includes(r.cardIds[0])) fail('放权需要弃置一张手牌');
        f.card = r.cardIds[0];
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: 1,
          candidates: alivePlayers(s).filter((x) => x.id !== f.player).map((x) => x.id),
          canDecline: true, reason: { kind: 'fangquan' },
        });
        f.step = 'player-wait';
        return;
      }
      case 'player-wait': {
        const r = expectDeclineOr(resp, 'players');
        popFrame(ctx, f);
        if (!r) return;
        if (r.players.length !== 1 || !player(s, r.players[0]).alive) fail('放权的目标不合法');
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'fangquan' });
        moveCard(ctx, f.card!, { zone: 'discard' }, 'fangquan');
        emit(ctx, { type: 'targeted', source: f.player, targets: [r.players[0]] });
        s.extraTurn = { player: r.players[0], resumeSeat: player(s, f.player).seat };
        return;
      }
      default:
        fail(`fangquan 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 固政(张昭张纮) ----------

const guzheng: FrameHandler<GuzhengFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'ask') fail(`guzheng 帧在 ${f.step} 步不应被 run`);
    const cards = f.cards.filter((id) => s.discardPile.includes(id));
    if (!player(s, f.holder).alive || cards.length === 0) { popFrame(ctx, f); return; }
    f.cards = cards;
    ask(ctx, { player: f.holder, type: 'choose-option', options: ['guzheng'], canDecline: true, reason: 'guzheng' });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step === 'ask') {
      const r = expectDeclineOr(resp, 'option');
      if (!r) { popFrame(ctx, f); return; }
      ask(ctx, {
        player: f.holder, type: 'choose-cards', from: 'shown',
        shownIds: [...f.cards], min: 1, max: 1, canDecline: false, reason: { kind: 'guzheng' },
      });
      f.step = 'pick-wait';
      return;
    }
    if (f.step !== 'pick-wait') fail('guzheng 帧当前不接受应答');
    if (resp.kind !== 'cards' || resp.cardIds.length !== 1
        || !f.cards.includes(resp.cardIds[0])) {
      fail('固政:请选择一张返还的弃牌');
    }
    emit(ctx, { type: 'skillInvoked', player: f.holder, skill: 'guzheng' });
    const back = resp.cardIds[0];
    moveCard(ctx, back, { zone: 'hand', player: f.who }, 'guzheng');
    const rest = f.cards.filter((id) => id !== back && s.discardPile.includes(id));
    if (rest.length > 0) moveCards(ctx, rest, { zone: 'hand', player: f.holder }, 'guzheng');
    popFrame(ctx, f);
  },
};

// ---------- 化身(左慈,简化) ----------

// 化身可声明的技能:化身牌上的普通技能(排除主公技/觉醒技/化身系)
const HUASHEN_EXCLUDED: SkillName[] = [
  'jiuyuan', 'xueyi', 'songwei', 'baonve',
  'zaoxian', 'zhiji', 'hunzi', 'huashen', 'xinsheng', 'wuhun',
  'qinxue', 'chanyuan',
];

export function huashenOptions(_s: import('./types').GameState, p: import('./types').PlayerState): SkillName[] {
  const out: SkillName[] = [];
  for (const g of p.huashen ?? []) {
    for (const sk of GENERALS[g].skills) {
      if (!HUASHEN_EXCLUDED.includes(sk) && !out.includes(sk)) out.push(sk);
    }
  }
  return out;
}

const huashen: FrameHandler<HuashenFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const p = player(s, f.player);
    const opts = huashenOptions(s, p);
    if (opts.length === 0) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: opts, canDecline: true, reason: 'huashen',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const r = expectDeclineOr(resp, 'option');
    const p = player(s, f.player);
    popFrame(ctx, f);
    if (!r) return;
    const opts = huashenOptions(s, p);
    const skill = opts[r.index];
    if (!skill) fail('化身:无效的技能选择');
    p.huashenSkill = skill;
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'huashen' });
    emit(ctx, { type: 'skillInvoked', player: f.player, skill });
  },
};

// ---------- 武魂(神关羽) ----------

const wuhun: FrameHandler<WuhunFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'start': {
        if (!player(s, f.victim).alive) { popFrame(ctx, f); return; }
        emit(ctx, { type: 'targeted', source: f.victim, targets: [f.victim] });
        f.step = 'judged';
        pushFrame(ctx, { type: 'judge', step: 'flip', player: f.victim, reason: 'wuhun' });
        return;
      }
      case 'judged': {
        const res = f.childResult;
        f.childResult = undefined;
        popFrame(ctx, f);
        if (res && !['tao', 'taoyuan'].includes(card(s, res.cardId).name)
            && player(s, f.victim).alive) {
          performDeath(ctx, f.victim, null);
        }
        return;
      }
      default:
        fail(`wuhun 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse() {
    fail('wuhun 帧不接受应答');
  },
};

// ---------- 攻心(神吕蒙) ----------

const gongxin: FrameHandler<GongxinFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'pick-wait') fail(`gongxin 帧在 ${f.step} 步不应被 run`);
    const tgt = player(s, f.target);
    if (tgt.hand.length === 0) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.source, type: 'choose-cards', from: 'shown',
      shownIds: [...tgt.hand], min: 1, max: 1,
      canDecline: true, reason: { kind: 'gongxin' },
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step === 'pick-wait') {
      const r = expectDeclineOr(resp, 'cards');
      if (!r) { popFrame(ctx, f); return; }
      const cid = r.cardIds[0];
      if (r.cardIds.length !== 1 || !player(s, f.target).hand.includes(cid)) fail('只能选择其手牌');
      if (card(s, cid).suit !== 'heart') fail('攻心只能展示红桃牌');
      emit(ctx, { type: 'cardRevealed', player: f.target, cardId: cid, reason: 'gongxin' });
      f.picked = cid;
      ask(ctx, {
        player: f.source, type: 'choose-option',
        options: ['gongxin-discard', 'gongxin-top'], canDecline: false, reason: 'gongxin-where',
      });
      f.step = 'where-wait';
      return;
    }
    if (f.step !== 'where-wait') fail('gongxin 帧当前不接受应答');
    if (resp.kind !== 'option') fail('攻心必须选择一项');
    const cid = f.picked!;
    popFrame(ctx, f);
    if (resp.index === 0) {
      moveCard(ctx, cid, { zone: 'discard' }, 'gongxin');
    } else {
      moveCard(ctx, cid, { zone: 'draw' }, 'gongxin');
      // moveCard 把牌放到牌堆底,搬到牌堆顶
      const i = s.drawPile.lastIndexOf(cid);
      s.drawPile.splice(i, 1);
      s.drawPile.unshift(cid);
    }
  },
};

// ---------- 神武将登场选势力 ----------

const godFaction: FrameHandler<GodFactionFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    while (f.idx < f.queue.length) {
      const p = player(s, f.queue[f.idx]);
      if (p.alive && p.faction === undefined) {
        ask(ctx, {
          player: p.id, type: 'choose-option',
          options: ['faction-wei', 'faction-shu', 'faction-wu', 'faction-qun'],
          canDecline: false, reason: 'god-faction',
        });
        f.step = 'wait';
        return;
      }
      f.idx++;
    }
    popFrame(ctx, f);
    // 随机分配模式:选完势力后宣布回合开始
    emit(ctx, { type: 'turnStarted', player: s.turn.activePlayer, turnNumber: 1 });
  },
  onResponse(ctx, f, resp) {
    if (resp.kind !== 'option') fail('请选择一个势力');
    const factions = ['wei', 'shu', 'wu', 'qun'] as const;
    const pick = factions[resp.index] ?? 'qun';
    const p = player(ctx.s, f.queue[f.idx]);
    p.faction = pick;
    emit(ctx, { type: 'factionChosen', player: p.id, faction: pick });
    f.idx++;
    f.step = 'next';
  },
};

// ---------- 眩惑(法正) ----------

const xuanhuo: FrameHandler<XuanhuoFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'pick-wait') fail(`xuanhuo 帧在 ${f.step} 步不应被 run`);
    const tgt = player(s, f.target);
    if (!tgt.alive || totalCardCount(tgt) === 0) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.source, type: 'pick-card', target: f.target,
      handCount: tgt.hand.length, equips: equipCardIds(tgt), judges: [], reason: 'xuanhuo',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step === 'pick-wait') {
      const cid = resolvePick(ctx, f.target, resp);
      moveCard(ctx, cid, { zone: 'hand', player: f.source }, 'xuanhuo');
      f.gained = cid;
      const cands = alivePlayers(s)
        .filter((x) => x.id !== f.source && x.id !== f.target)
        .map((x) => x.id);
      if (cands.length === 0) { popFrame(ctx, f); return; }
      ask(ctx, {
        player: f.source, type: 'choose-player', min: 1, max: 1,
        candidates: cands, canDecline: false, reason: { kind: 'xuanhuo' },
      });
      f.step = 'give-wait';
      return;
    }
    if (f.step !== 'give-wait') fail('xuanhuo 帧当前不接受应答');
    if (resp.kind !== 'players' || resp.players.length !== 1) fail('眩惑需要选择一名角色');
    const to = resp.players[0];
    if (to === f.target || to === f.source || !player(s, to).alive) fail('眩惑的目标不合法');
    moveCard(ctx, f.gained!, { zone: 'hand', player: to }, 'xuanhuo');
    popFrame(ctx, f);
  },
};

// ---------- 明策(陈宫) ----------

const mingce: FrameHandler<MingceFrame> = {
  run(ctx, f) {
    ask(ctx, {
      player: f.receiver, type: 'choose-option',
      options: ['mingce-sha', 'mingce-draw'], canDecline: false, reason: 'mingce',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (resp.kind !== 'option') fail('明策必须选择一项');
    popFrame(ctx, f);
    if (resp.index === 0 && player(s, f.target).alive && player(s, f.receiver).alive) {
      pushVirtualSlash(ctx, f.receiver, f.target);
    } else {
      drawCards(ctx, f.receiver, 1);
    }
  },
};

// ---------- 旋风(凌统) ----------

const xuanfeng: FrameHandler<XuanfengFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'wait') fail(`xuanfeng 帧在 ${f.step} 步不应被 run`);
    if (!player(s, f.player).alive || alivePlayers(s).length <= 1) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: ['xuanfeng-sha', 'xuanfeng-damage'], canDecline: true, reason: 'xuanfeng',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    switch (f.step) {
      case 'wait': {
        const r = expectDeclineOr(resp, 'option');
        if (!r) { popFrame(ctx, f); return; }
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'xuanfeng' });
        const near = alivePlayers(s)
          .filter((x) => x.id !== f.player && (r.index === 0 || distance(s, f.player, x.id) <= 1))
          .map((x) => x.id);
        if (near.length === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.player, type: 'choose-player', min: 1, max: 1,
          candidates: near, canDecline: true, reason: { kind: 'xuanfeng' },
        });
        f.step = r.index === 0 ? 'sha-target' : 'damage-target';
        return;
      }
      case 'sha-target':
      case 'damage-target': {
        const r = expectDeclineOr(resp, 'players');
        const mode = f.step;
        popFrame(ctx, f);
        if (!r) return;
        if (r.players.length !== 1 || !player(s, r.players[0]).alive) fail('旋风的目标不合法');
        if (mode === 'sha-target') {
          pushVirtualSlash(ctx, f.player, r.players[0]);
        } else {
          if (distance(s, f.player, r.players[0]) > 1) fail('旋风只能对距离 1 以内的角色造成伤害');
          pushDamage(ctx, { source: f.player, target: r.players[0], amount: 1, causeCardIds: [] });
        }
        return;
      }
      default:
        fail(`xuanfeng 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 英魂(孙坚) ----------

const yinghun: FrameHandler<YinghunFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'start') fail(`yinghun 帧在 ${f.step} 步不应被 run`);
    const cands = alivePlayers(s).filter((x) => x.id !== f.player).map((x) => x.id);
    if (cands.length === 0) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.player, type: 'choose-player', min: 1, max: 1,
      candidates: cands, canDecline: true, reason: { kind: 'yinghun' },
    });
    f.step = 'target-wait';
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const me = player(s, f.player);
    const x = me.maxHp - me.hp;
    switch (f.step) {
      case 'target-wait': {
        const r = expectDeclineOr(resp, 'players');
        if (!r) { popFrame(ctx, f); return; }
        if (r.players.length !== 1 || r.players[0] === f.player
            || !player(s, r.players[0]).alive) {
          fail('英魂的目标不合法');
        }
        f.target = r.players[0];
        if (x <= 1) {
          // X=1 时两种选择等价:摸一弃一
          emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'yinghun' });
          drawCards(ctx, f.target, 1);
          f.need = 1;
          askYinghunDiscard(ctx, f);
          return;
        }
        ask(ctx, {
          player: f.player, type: 'choose-option',
          options: ['yinghun-a', 'yinghun-b'], canDecline: false, reason: 'yinghun',
        });
        f.step = 'mode-wait';
        return;
      }
      case 'mode-wait': {
        if (resp.kind !== 'option') fail('英魂需要选择一项');
        emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'yinghun' });
        if (resp.index === 0) {
          drawCards(ctx, f.target!, x); // 摸X弃一
          f.need = 1;
        } else {
          drawCards(ctx, f.target!, 1); // 摸一弃X
          f.need = x;
        }
        askYinghunDiscard(ctx, f);
        return;
      }
      case 'discard-wait': {
        if (resp.kind !== 'cards') fail('应答类型不符合当前请求');
        const t = player(s, f.target!);
        const need = Math.min(f.need!, t.hand.length);
        if (resp.cardIds.length !== need
            || new Set(resp.cardIds).size !== resp.cardIds.length
            || !resp.cardIds.every((id) => t.hand.includes(id))) {
          fail(`英魂需要弃置 ${need} 张手牌`);
        }
        if (resp.cardIds.length > 0) moveCards(ctx, resp.cardIds, { zone: 'discard' }, 'yinghun');
        popFrame(ctx, f);
        return;
      }
      default:
        fail(`yinghun 帧在 ${f.step} 步不接受应答`);
    }
  },
};

function askYinghunDiscard(ctx: Ctx, f: YinghunFrame): void {
  const t = player(ctx.s, f.target!);
  const need = Math.min(f.need!, t.hand.length);
  if (need === 0) { popFrame(ctx, f); return; }
  ask(ctx, {
    player: f.target!, type: 'choose-cards', from: 'hand',
    min: need, max: need, canDecline: false, reason: { kind: 'yinghun' },
  });
  f.step = 'discard-wait';
}

// ---------- 烈刃(祝融) ----------

const lieren: FrameHandler<LierenFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    switch (f.step) {
      case 'start': {
        emit(ctx, { type: 'skillInvoked', player: f.source, skill: 'lieren' });
        f.step = 'pindian-done';
        pushFrame(ctx, { type: 'pindian', step: 'start', a: f.source, b: f.target });
        return;
      }
      case 'pindian-done': {
        const won = f.childResult?.won ?? false;
        f.childResult = undefined;
        const tgt = player(s, f.target);
        if (!won || !tgt.alive || totalCardCount(tgt) === 0) { popFrame(ctx, f); return; }
        ask(ctx, {
          player: f.source, type: 'pick-card', target: f.target,
          handCount: tgt.hand.length, equips: equipCardIds(tgt), judges: [], reason: 'lieren',
        });
        f.step = 'pick-wait';
        return;
      }
      default:
        fail(`lieren 帧在 ${f.step} 步不应被 run`);
    }
  },
  onResponse(ctx, f, resp) {
    if (f.step !== 'pick-wait') fail('lieren 帧当前不接受应答');
    const cid = resolvePick(ctx, f.target, resp);
    moveCard(ctx, cid, { zone: 'hand', player: f.source }, 'lieren');
    popFrame(ctx, f);
  },
};

// ---------- 崩坏(董卓) ----------

const benghuai: FrameHandler<BenghuaiFrame> = {
  run(ctx, f) {
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: ['benghuai-hp', 'benghuai-maxhp'], canDecline: false, reason: 'benghuai',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (resp.kind !== 'option') fail('崩坏必须选择一项');
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'benghuai' });
    popFrame(ctx, f);
    const p = player(s, f.player);
    if (resp.index === 0) {
      loseHp(ctx, f.player, 1);
    } else {
      p.maxHp -= 1;
      if (p.hp > p.maxHp) {
        p.hp = p.maxHp;
        emit(ctx, { type: 'hpChanged', player: f.player, hp: p.hp, delta: 0 });
      }
      if (p.maxHp <= 0) performDeath(ctx, f.player, null);
    }
  },
};

// ---------- 乱武(贾诩,限定技) ----------

function luanwuNearest(ctx: Ctx, pid: PlayerId): PlayerId[] {
  const others = alivePlayers(ctx.s).filter((x) => x.id !== pid);
  if (others.length === 0) return [];
  const min = Math.min(...others.map((x) => distance(ctx.s, pid, x.id)));
  return others.filter((x) => distance(ctx.s, pid, x.id) === min).map((x) => x.id);
}

const luanwu: FrameHandler<LuanwuFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'next') fail(`luanwu 帧在 ${f.step} 步不应被 run`);
    while (f.idx < f.queue.length) {
      const pid = f.queue[f.idx];
      if (player(s, pid).alive && luanwuNearest(ctx, pid).length > 0) {
        ask(ctx, {
          player: pid, type: 'respond-card', pattern: 'sha', canDecline: true,
          reason: { kind: 'luanwu', source: f.source },
        });
        f.step = 'sha-wait';
        return;
      }
      f.idx++;
    }
    popFrame(ctx, f);
  },
  onResponse(ctx, f, resp) {
    const pid = f.queue[f.idx];
    switch (f.step) {
      case 'sha-wait': {
        const r = expectDeclineOr(resp, 'card');
        if (!r) {
          f.idx++;
          f.step = 'next';
          loseHp(ctx, pid, 1);
          return;
        }
        const cid = validateResponseCard(ctx, pid, r, 'sha');
        const nearest = luanwuNearest(ctx, pid);
        if (nearest.length === 1) {
          f.idx++;
          f.step = 'next';
          moveCard(ctx, cid, { zone: 'processing' }, 'play');
          emit(ctx, { type: 'cardPlayed', player: pid, cardId: cid, targets: [nearest[0]] });
          pushFrame(ctx, { type: 'slash', step: 'start', source: pid, target: nearest[0], cardId: cid });
          return;
        }
        f.pendingCard = cid;
        ask(ctx, {
          player: pid, type: 'choose-player', min: 1, max: 1,
          candidates: nearest, canDecline: false, reason: { kind: 'luanwu' },
        });
        f.step = 'target-wait';
        return;
      }
      case 'target-wait': {
        if (resp.kind !== 'players' || resp.players.length !== 1) fail('乱武需要选择一个目标');
        const nearest = luanwuNearest(ctx, pid);
        if (!nearest.includes(resp.players[0])) fail('乱武只能指定距离最近的角色');
        const cid = f.pendingCard!;
        f.pendingCard = undefined;
        f.idx++;
        f.step = 'next';
        moveCard(ctx, cid, { zone: 'processing' }, 'play');
        emit(ctx, { type: 'cardPlayed', player: pid, cardId: cid, targets: [resp.players[0]] });
        pushFrame(ctx, { type: 'slash', step: 'start', source: pid, target: resp.players[0], cardId: cid });
        return;
      }
      default:
        fail(`luanwu 帧在 ${f.step} 步不接受应答`);
    }
  },
};

// ---------- 界仁德(界刘备):给出第二张仁德牌时,可视为使用一张基本牌 ----------

const jrende: FrameHandler<JrendeFrame> = {
  run(ctx, f) {
    if (f.step !== 'wait') fail(`jrende 帧在 ${f.step} 步不应被 run`);
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: ['jrende-sha', 'jrende-tao', 'jrende-jiu'], canDecline: true, reason: 'jrende',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const p = player(s, f.player);
    if (f.step === 'wait') {
      const r = expectDeclineOr(resp, 'option');
      if (!r) { popFrame(ctx, f); return; }
      if (r.index === 1) {
        popFrame(ctx, f);
        emit(ctx, { type: 'virtualCard', player: f.player, as: 'tao', targets: [f.player] });
        heal(ctx, f.player, 1);
        return;
      }
      if (r.index === 2) {
        popFrame(ctx, f);
        emit(ctx, { type: 'virtualCard', player: f.player, as: 'jiu', targets: [f.player] });
        p.flags.jiuUsed = true;
        p.flags.jiuBuff = true;
        return;
      }
      const cands = alivePlayers(s)
        .filter((x) => x.id !== f.player
          && distance(s, f.player, x.id) <= attackRange(s, p)
          && !kongchengProtected(s, x))
        .map((x) => x.id);
      if (cands.length === 0) { popFrame(ctx, f); return; }
      ask(ctx, {
        player: f.player, type: 'choose-player', min: 1, max: 1,
        candidates: cands, canDecline: true, reason: { kind: 'slash' },
      });
      f.step = 'sha-player';
      return;
    }
    const r = expectDeclineOr(resp, 'players');
    popFrame(ctx, f);
    if (!r) return;
    const t = player(s, r.players[0]);
    if (r.players.length !== 1 || !t.alive || t.id === f.player) fail('目标不合法');
    emit(ctx, { type: 'virtualCard', player: f.player, as: 'sha', targets: [t.id] });
    pushFrame(ctx, { type: 'slash', step: 'start', source: f.player, target: t.id, cardId: null });
  },
};

// ---------- 义绝(界关羽) ----------

const yijue: FrameHandler<YijueFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.step !== 'show-wait') fail(`yijue 帧在 ${f.step} 步不应被 run`);
    if (!player(s, f.target).alive || player(s, f.target).hand.length === 0) {
      popFrame(ctx, f);
      return;
    }
    ask(ctx, {
      player: f.target, type: 'choose-cards', from: 'hand',
      min: 1, max: 1, canDecline: false, reason: { kind: 'yijue' },
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (f.step === 'show-wait') {
      if (resp.kind !== 'cards' || resp.cardIds.length !== 1) fail('义绝:需要展示一张手牌');
      const tgt = player(s, f.target);
      const cid = resp.cardIds[0];
      if (!tgt.hand.includes(cid)) fail('这张牌不在你的手牌中');
      emit(ctx, { type: 'cardRevealed', player: f.target, cardId: cid, reason: 'yijue' });
      if (isBlack(card(s, cid).suit)) {
        // 黑色:其本回合技能失效(简化:含锁定技;不限制其使用手牌)
        tgt.flags.yijueOff = true;
        popFrame(ctx, f);
        return;
      }
      // 红色:你获得之,然后可令其回复 1 点体力
      moveCard(ctx, cid, { zone: 'hand', player: f.source }, 'yijue');
      if (tgt.hp < tgt.maxHp) {
        ask(ctx, {
          player: f.source, type: 'choose-option',
          options: ['yijue-heal'], canDecline: true, reason: 'yijue-heal',
        });
        f.step = 'heal-wait';
        return;
      }
      popFrame(ctx, f);
      return;
    }
    const r = expectDeclineOr(resp, 'option');
    popFrame(ctx, f);
    if (r) heal(ctx, f.target, 1);
  },
};

// ---------- 界反间(界周瑜) ----------

const jfanjian: FrameHandler<JfanjianFrame> = {
  run(ctx, f) {
    ask(ctx, {
      player: f.target, type: 'choose-option',
      options: ['jfanjian-show', 'jfanjian-hp'], canDecline: false, reason: 'jfanjian',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    if (resp.kind !== 'option') fail('必须选择一项');
    popFrame(ctx, f);
    const tgt = player(s, f.target);
    if (resp.index === 0) {
      // 展示所有手牌,弃置与交来的牌花色相同的所有牌
      for (const id of tgt.hand) {
        emit(ctx, { type: 'cardRevealed', player: f.target, cardId: id, reason: 'jfanjian' });
      }
      const match = tgt.hand.filter((id) => card(s, id).suit === f.suit);
      if (match.length > 0) moveCards(ctx, match, { zone: 'discard' }, 'jfanjian');
      return;
    }
    loseHp(ctx, f.target, 1);
  },
};

// ---------- 界连营(界陆逊) ----------

const jlianying: FrameHandler<JlianyingFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (!player(s, f.player).alive) { popFrame(ctx, f); return; }
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'jlianying' });
    ask(ctx, {
      player: f.player, type: 'choose-player', min: 1, max: Math.max(1, f.count),
      candidates: alivePlayers(s).map((x) => x.id),
      canDecline: true, reason: { kind: 'jlianying' },
    });
  },
  onResponse(ctx, f, resp) {
    const r = expectDeclineOr(resp, 'players');
    popFrame(ctx, f);
    if (!r) return;
    if (r.players.length < 1 || r.players.length > Math.max(1, f.count)
        || new Set(r.players).size !== r.players.length) {
      fail('连营:目标数量不合法');
    }
    for (const pid of r.players) {
      if (player(ctx.s, pid).alive) drawCards(ctx, pid, 1);
    }
  },
};

// ---------- 奋激(界周泰) ----------

const fenji: FrameHandler<FenjiFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    const holder = player(s, f.holder);
    if (!holder.alive || holder.hp < 1 || !player(s, f.who).alive) {
      popFrame(ctx, f);
      return;
    }
    ask(ctx, { player: f.holder, type: 'choose-option', options: ['fenji'], canDecline: true, reason: 'fenji' });
  },
  onResponse(ctx, f, resp) {
    const r = expectDeclineOr(resp, 'option');
    popFrame(ctx, f);
    if (!r) return;
    emit(ctx, { type: 'skillInvoked', player: f.holder, skill: 'fenji' });
    drawCards(ctx, f.who, 2);
    loseHp(ctx, f.holder, 1);
  },
};

// ---------- 奇谋(界魏延,限定技) ----------

const qimou: FrameHandler<QimouFrame> = {
  run(ctx, f) {
    const p = player(ctx.s, f.player);
    const maxX = Math.min(3, p.hp);
    if (maxX < 1) { popFrame(ctx, f); return; }
    ask(ctx, {
      player: f.player, type: 'choose-option',
      options: ['qimou-1', 'qimou-2', 'qimou-3'].slice(0, maxX),
      canDecline: true, reason: 'qimou',
    });
  },
  onResponse(ctx, f, resp) {
    const s = ctx.s;
    const r = expectDeclineOr(resp, 'option');
    popFrame(ctx, f);
    if (!r) return;
    const p = player(s, f.player);
    const x = r.index + 1;
    p.usedLimit = [...(p.usedLimit ?? []), 'qimou'];
    emit(ctx, { type: 'skillInvoked', player: f.player, skill: 'qimou' });
    p.flags.qimou = x;
    loseHp(ctx, f.player, x);
  },
};

// ---------- 开局选将 ----------

const chooseGenerals: FrameHandler<ChooseGeneralsFrame> = {
  run(ctx, f) {
    const s = ctx.s;
    if (f.idx >= f.queue.length) {
      // 全部选定:发起始手牌,开始主公回合
      for (const pid of orderFrom(s)) drawCards(ctx, pid, 4);
      popFrame(ctx, f);
      emit(ctx, { type: 'turnStarted', player: s.turn.activePlayer, turnNumber: 1 });
      return;
    }
    const pid = f.queue[f.idx];
    ask(ctx, { player: pid, type: 'choose-general', candidates: f.candidates[pid] });
    f.step = 'wait';
  },
  onResponse(ctx, f, resp) {
    const pid = f.queue[f.idx];
    if (f.step === 'faction-wait') {
      if (resp.kind !== 'option') fail('请选择一个势力');
      const factions = ['wei', 'shu', 'wu', 'qun'] as const;
      const p = player(ctx.s, pid);
      p.faction = factions[resp.index] ?? 'qun';
      emit(ctx, { type: 'factionChosen', player: pid, faction: p.faction });
      f.idx++;
      f.step = 'next';
      return;
    }
    if (resp.kind !== 'general') fail('请从候选中选择一名武将');
    if (!f.candidates[pid].includes(resp.general)) fail('只能从你的候选武将中选择');
    const p = player(ctx.s, pid);
    p.general = resp.general;
    p.maxHp = GENERALS[resp.general].hp + (p.role === 'lord' ? 1 : 0);
    p.hp = p.maxHp;
    delete p.unpicked;
    emit(ctx, { type: 'generalChosen', player: pid, general: resp.general });
    if (GENERALS[resp.general].skills.includes('huashen')) grantHuashen(ctx.s, pid, 2);
    if (GENERALS[resp.general].faction === 'god') {
      ask(ctx, {
        player: pid, type: 'choose-option',
        options: ['faction-wei', 'faction-shu', 'faction-wu', 'faction-qun'],
        canDecline: false, reason: 'god-faction',
      });
      f.step = 'faction-wait';
      return;
    }
    f.idx++;
    f.step = 'next';
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const frameHandlers: Record<EffectFrame['type'], FrameHandler<any>> = {
  slash, damage, dying, judge, wuxie, trick, duel,
  guanxing, luoshen, 'draw-step': drawStep, delayed, kurou, fanjian, aoe, jiedao,
  huogong, tiesuo, shensu, jushou, leiji, guhuo,
  pindian, quhu, tianyi,
  lieren, benghuai, luanwu, yinghun,
  xuanhuo, mingce, xuanfeng,
  wuhun, gongxin, 'god-faction': godFaction,
  tuntian, qiaobian, tiaoxin, zhiji, fangquan, guzheng, huashen,
  jrende, yijue, jfanjian, jlianying, fenji, qimou,
  'choose-generals': chooseGenerals,
};
