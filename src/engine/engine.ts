// 引擎对外入口:createGame / applyAction。
// applyAction 是纯函数:不修改传入的 state,返回新 state + 本次新增事件;
// 非法 Action 返回 error 且 state 原样返回(pendingRequest 保持未决)。

import type { Action, EngineResult, GameState, PendingRequest, ResponseData } from './types';
import { EngineError, ask, card, emit, factionOf, fail, hasSkill, loseHp, moveCard, orderFrom, player } from './kernel';
import type { Ctx } from './kernel';
import { isShaCard } from './deck';
import { validateResponseCard } from './rules';
import { frameHandlers } from './frames';
import { flowOnResponse, flowRun } from './flow';
import { buildInitialState } from './setup';
import type { GameConfig, PlayerCount } from './setup';

// ---------- 护驾/激将:主公把"需要杀/闪"的响应转给同势力角色代打 ----------

function askHelper(ctx: Ctx): void {
  const st = ctx.s.help!;
  const pattern = st.skill === 'hujia' ? 'shan' : 'sha';
  ask(ctx, {
    player: st.queue[st.idx], type: 'respond-card', pattern, canDecline: true,
    reason: { kind: st.skill, who: st.original.player },
  });
}

// 返回 true 表示该应答已被代打机制消化,不再交给结算帧
function handleHelp(ctx: Ctx, req: PendingRequest, resp: ResponseData): boolean {
  const s = ctx.s;
  // ① 正在等待帮手应答(此时 pendingRequest 是发给帮手的)
  if (s.help) {
    const st = s.help;
    const pattern = st.skill === 'hujia' ? 'shan' : 'sha';
    if (resp.kind === 'card') {
      if (resp.skill === 'guhuo') fail('代打不能使用蛊惑');
      const helper = st.queue[st.idx];
      validateResponseCard(ctx, helper, resp, pattern);
      emit(ctx, { type: 'skillInvoked', player: helper, skill: st.skill });
      const original = st.original;
      delete s.help;
      // 以主公名义把这张牌交给原结算;校验层会改用帮手的手牌
      s.helpDelivery = { lord: original.player, helper };
      try {
        const top = s.stack[s.stack.length - 1];
        if (top) frameHandlers[top.type].onResponse(ctx, top, resp, original);
        else flowOnResponse(ctx, original, resp);
      } finally {
        delete s.helpDelivery;
      }
      return true;
    }
    if (resp.kind !== 'decline') fail('代打只能打出对应的牌或放弃');
    // 放弃:问下一名存活帮手;全部放弃则恢复主公的原请求
    st.idx += 1;
    while (st.idx < st.queue.length && !player(s, st.queue[st.idx]).alive) st.idx += 1;
    if (st.idx < st.queue.length) {
      askHelper(ctx);
      return true;
    }
    s.helpSpentId = st.original.id;
    s.pendingRequest = st.original;
    delete s.help;
    return true;
  }
  // ② 主公发起护驾/激将
  if (resp.kind === 'help') {
    if (req.type !== 'respond-card' || (req.pattern !== 'shan' && req.pattern !== 'sha')) {
      fail('当前请求不能发动护驾/激将');
    }
    const lord = player(s, req.player);
    const skill = req.pattern === 'shan' ? 'hujia' : 'jijiang';
    if (!hasSkill(s, lord, skill)) {
      fail(skill === 'hujia' ? '你没有护驾技能' : '你没有激将技能');
    }
    if (s.helpSpentId === req.id) fail('本次响应已发动过代打');
    const faction = skill === 'hujia' ? 'wei' : 'shu';
    const queue = orderFrom(s, req.player)
      .filter((pid) => pid !== req.player && factionOf(s, player(s, pid)) === faction);
    if (queue.length === 0) fail('场上没有可以代打的同势力角色');
    emit(ctx, { type: 'skillInvoked', player: req.player, skill });
    s.help = { original: req, skill, queue, idx: 0 };
    askHelper(ctx);
    return true;
  }
  return false;
}

// ---------- 蛊惑响应声明:于吉把任意手牌声明为需要的杀/闪/桃/无懈 ----------

function askGuhuoChallenger(ctx: Ctx): void {
  const st = ctx.s.guhuoRespond!;
  ask(ctx, {
    player: st.queue[st.idx], type: 'choose-option', options: ['guhuo-challenge'],
    canDecline: true, reason: 'guhuo-challenge',
  });
}

// 质疑流程结束:亮牌裁定,真则交付原结算,假则作废并恢复原请求
function resolveGuhuoRespond(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.guhuoRespond!;
  delete s.guhuoRespond;
  const yuji = st.original.player;
  const real = st.pattern === 'sha'
    ? isShaCard(card(s, st.cardId).name)
    : card(s, st.cardId).name === st.pattern;
  emit(ctx, { type: 'cardRevealed', player: yuji, cardId: st.cardId, reason: 'guhuo' });
  if (st.challenger !== undefined && !real) {
    // 假牌被质疑:弃置,声明作废,回到原请求(不能再次声明)
    moveCard(ctx, st.cardId, { zone: 'discard' }, 'guhuo');
    s.guhuoSpentId = st.original.id;
    s.pendingRequest = st.original;
    return;
  }
  // 为真或无人质疑:这张牌按声明交付原结算
  const delivered: ResponseData = { kind: 'card', cardId: st.cardId, skill: 'guhuo' };
  const top = s.stack[s.stack.length - 1];
  if (top) frameHandlers[top.type].onResponse(ctx, top, delivered, st.original);
  else flowOnResponse(ctx, st.original, delivered);
  if (st.challenger !== undefined && real) {
    // 真牌被质疑:质疑者付出代价(界蛊惑:获得缠怨)
    if (hasSkill(s, player(s, yuji), 'jguhuo')) {
      const ch = player(s, st.challenger);
      if (!(ch.usedLimit ?? []).includes('chanyuan')) {
        ch.usedLimit = [...(ch.usedLimit ?? []), 'chanyuan'];
        emit(ctx, { type: 'skillInvoked', player: st.challenger, skill: 'chanyuan' });
      }
    } else {
      loseHp(ctx, st.challenger, 1);
    }
  }
}

// 返回 true 表示该应答已被蛊惑声明机制消化
function handleGuhuoRespond(ctx: Ctx, req: PendingRequest, resp: ResponseData): boolean {
  const s = ctx.s;
  // ① 正在询问质疑
  if (s.guhuoRespond) {
    const st = s.guhuoRespond;
    if (resp.kind === 'option') {
      st.challenger = st.queue[st.idx];
      resolveGuhuoRespond(ctx);
      return true;
    }
    if (resp.kind !== 'decline') fail('请选择是否质疑');
    st.idx += 1;
    while (st.idx < st.queue.length && !player(s, st.queue[st.idx]).alive) st.idx += 1;
    if (st.idx < st.queue.length) askGuhuoChallenger(ctx);
    else resolveGuhuoRespond(ctx);
    return true;
  }
  // ② 于吉发起响应声明:respond-card 请求上打出任意手牌并标记 skill: 'guhuo'
  if (req.type === 'respond-card' && resp.kind === 'card' && resp.skill === 'guhuo') {
    const yuji = player(s, req.player);
    if (!hasSkill(s, yuji, 'guhuo') && !hasSkill(s, yuji, 'jguhuo')) fail('你没有蛊惑技能');
    if (!yuji.hand.includes(resp.cardId)) fail('这张牌不在你的手牌中');
    if (s.guhuoSpentId === req.id) fail('本次响应的蛊惑已被识破');
    if (req.reason.kind === 'hujia' || req.reason.kind === 'jijiang') fail('代打不能使用蛊惑');
    emit(ctx, { type: 'skillInvoked', player: req.player, skill: hasSkill(s, yuji, 'jguhuo') ? 'jguhuo' : 'guhuo' });
    emit(ctx, { type: 'virtualCard', player: req.player, as: req.pattern, targets: [] });
    // 缠怨者不能质疑
    const queue = orderFrom(s, req.player).filter(
      (pid) => pid !== req.player && !(player(s, pid).usedLimit ?? []).includes('chanyuan'),
    );
    s.guhuoRespond = {
      original: req, cardId: resp.cardId, pattern: req.pattern, queue, idx: 0,
    };
    if (queue.length === 0) resolveGuhuoRespond(ctx);
    else askGuhuoChallenger(ctx);
    return true;
  }
  return false;
}

export function createGame(config: GameConfig): EngineResult {
  const s = buildInitialState(config);
  const ctx: Ctx = { s, events: [] };
  // 选将模式下由 choose-generals 帧在选定后发牌并宣布回合开始
  if (s.stack.length === 0) {
    emit(ctx, { type: 'turnStarted', player: s.turn.activePlayer, turnNumber: 1 });
  }
  advance(ctx);
  return { state: s, events: ctx.events };
}

export function applyAction(prev: GameState, action: Action): EngineResult {
  if (prev.winner) return { state: prev, events: [], error: '对局已结束' };
  const req = prev.pendingRequest;
  if (!req) return { state: prev, events: [], error: '当前没有待应答的请求' };
  if (req.id !== action.requestId) return { state: prev, events: [], error: '请求已过期' };
  if (req.player !== action.player) return { state: prev, events: [], error: '不是你的应答时机' };
  if (action.response.kind === 'decline' && 'canDecline' in req && !req.canDecline) {
    return { state: prev, events: [], error: '此请求不能放弃' };
  }

  const s = structuredClone(prev);
  const ctx: Ctx = { s, events: [] };
  s.pendingRequest = null;
  try {
    if (!handleHelp(ctx, req, action.response)
        && !handleGuhuoRespond(ctx, req, action.response)) {
      if (s.stack.length > 0) {
        const top = s.stack[s.stack.length - 1];
        frameHandlers[top.type].onResponse(ctx, top, action.response, req);
      } else {
        flowOnResponse(ctx, req, action.response);
      }
    }
    advance(ctx);
  } catch (e) {
    if (e instanceof EngineError) {
      return { state: prev, events: [], error: e.message };
    }
    throw e;
  }
  return { state: s, events: ctx.events };
}

function advance(ctx: Ctx): void {
  const s = ctx.s;
  let guard = 0;
  while (!s.winner && !s.pendingRequest) {
    if (++guard > 10000) throw new Error('引擎结算陷入死循环');
    if (s.stack.length > 0) {
      const top = s.stack[s.stack.length - 1];
      frameHandlers[top.type].run(ctx, top);
    } else {
      flowRun(ctx);
    }
  }
}

export type { GameConfig, PlayerCount };
