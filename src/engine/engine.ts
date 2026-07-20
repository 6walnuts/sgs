// 引擎对外入口:createGame / applyAction。
// applyAction 是纯函数:不修改传入的 state,返回新 state + 本次新增事件;
// 非法 Action 返回 error 且 state 原样返回(pendingRequest 保持未决)。

import type { Action, EngineResult, GameState, PendingRequest, ResponseData } from './types';
import { EngineError, ask, emit, factionOf, fail, hasSkill, orderFrom, player } from './kernel';
import type { Ctx } from './kernel';
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
    if (!handleHelp(ctx, req, action.response)) {
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
