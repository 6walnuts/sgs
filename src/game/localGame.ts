// 本地对局宿主:持有权威 GameState,把人类(UI)与 AI 的应答统一转成 Action
// 喂给引擎。联机时这一层由服务器 + WebSocket 替代,引擎与 AI 无需改动。

import type { Action, GameState, PendingRequest, ResponseData } from '../engine/types';
import { applyAction, createGame } from '../engine/engine';
import { decide, defaultResponse } from '../ai/simpleAi';

export const HUMAN_ID = 'p0';
const DEFAULT_AI_DELAY_MS = 900; // 出牌间隔,便于观察局势

export interface LocalGameOptions {
  seed: number;
  playerCount?: 4 | 5 | 8;
  pickGenerals?: boolean;
  generalCandidates?: number; // 每人候选武将数(主公 +2)
  aiDelayMs?: number;         // AI 出牌延迟
}

export class LocalGame {
  state: GameState;
  private listeners: Array<(s: GameState) => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = true;
  private readonly aiDelayMs: number;

  constructor(opts: LocalGameOptions) {
    this.aiDelayMs = opts.aiDelayMs ?? DEFAULT_AI_DELAY_MS;
    this.state = createGame({
      seed: opts.seed,
      playerCount: opts.playerCount ?? 4,
      pickGenerals: opts.pickGenerals,
      generalCandidates: opts.generalCandidates,
    }).state;
  }

  onChange(fn: (s: GameState) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  // start/stop 与 React effect 的挂载/清理对应,StrictMode 双调用下可安全反复启停
  start(): void {
    this.paused = false;
    this.scheduleAi();
  }

  stop(): void {
    this.paused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // 人类提交应答;返回错误信息(null 表示成功)
  submitHuman(response: ResponseData): string | null {
    const req = this.state.pendingRequest;
    if (!req || req.player !== HUMAN_ID) return '当前不是你的应答时机';
    const err = this.submit(req, response);
    if (!err) this.scheduleAi();
    return err;
  }

  // 人类超时:提交默认应答
  submitHumanDefault(): void {
    const req = this.state.pendingRequest;
    if (!req || req.player !== HUMAN_ID) return;
    this.submit(req, defaultResponse(this.state, req));
    this.scheduleAi();
  }

  private submit(req: PendingRequest, response: ResponseData): string | null {
    const action: Action = { player: req.player, requestId: req.id, response };
    const result = applyAction(this.state, action);
    if (result.error) return result.error;
    this.state = result.state;
    for (const fn of this.listeners) fn(this.state);
    return null;
  }

  private scheduleAi(): void {
    if (this.timer) clearTimeout(this.timer);
    const req = this.state.pendingRequest;
    if (this.paused || !req || req.player === HUMAN_ID || this.state.winner) return;
    this.timer = setTimeout(() => this.stepAi(), this.aiDelayMs);
  }

  private stepAi(): void {
    const req = this.state.pendingRequest;
    if (this.paused || !req || req.player === HUMAN_ID || this.state.winner) return;
    let resp: ResponseData;
    try {
      resp = decide(this.state, req.player, req);
    } catch {
      resp = defaultResponse(this.state, req);
    }
    let err = this.submit(req, resp);
    if (err) {
      // AI 给出非法应答:回退到默认应答,保证对局不会卡死
      err = this.submit(req, defaultResponse(this.state, req));
      if (err) throw new Error(`默认应答也被拒绝:${err}`);
    }
    this.scheduleAi();
  }
}
