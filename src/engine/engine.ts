// 引擎对外入口:createGame / applyAction。
// applyAction 是纯函数:不修改传入的 state,返回新 state + 本次新增事件;
// 非法 Action 返回 error 且 state 原样返回(pendingRequest 保持未决)。

import type { Action, EngineResult, GameState } from './types';
import { EngineError, emit } from './kernel';
import type { Ctx } from './kernel';
import { frameHandlers } from './frames';
import { flowOnResponse, flowRun } from './flow';
import { buildInitialState } from './setup';
import type { GameConfig } from './setup';

export function createGame(config: GameConfig): EngineResult {
  const s = buildInitialState(config);
  const ctx: Ctx = { s, events: [] };
  emit(ctx, { type: 'turnStarted', player: s.turn.activePlayer, turnNumber: 1 });
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
    if (s.stack.length > 0) {
      const top = s.stack[s.stack.length - 1];
      frameHandlers[top.type].onResponse(ctx, top, action.response, req);
    } else {
      flowOnResponse(ctx, req, action.response);
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

export type { GameConfig };
