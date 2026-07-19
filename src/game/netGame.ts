// 联机客户端会话:与 LocalGame 暴露同构的接口(state / submitHuman / start / stop),
// UI 不感知本地或联机。所有输入仍是对 pendingRequest 的应答;服务器是权威,
// 本地 state 是服务器按视角过滤后的副本。支持断线自动重连(凭 token 恢复座位)。

import type { GameState, PlayerId, ResponseData } from '../engine/types';
import { defaultResponse } from '../ai/simpleAi';
import type { ClientMessage, ServerMessage } from '../net/protocol';

export type NetIntent =
  | { kind: 'create'; name: string; playerCount?: 4 | 5 | 8; pickGenerals?: boolean }
  | { kind: 'join'; roomId: string; name: string };

export type NetStatus = 'connecting' | 'open' | 'closed' | 'failed';

const MAX_RETRIES = 5;

export class NetGame {
  state: GameState | null = null;
  you: PlayerId | null = null;
  room: Extract<ServerMessage, { type: 'room' }> | null = null;
  status: NetStatus = 'connecting';

  onUpdate: (() => void) | null = null;
  onError: ((msg: string) => void) | null = null;

  private ws: WebSocket | null = null;
  private token: string | null = null;
  private roomId: string | null = null;
  private stopped = true;
  private retries = 0;

  constructor(private readonly url: string, private readonly intent: NetIntent) {}

  get isHost(): boolean {
    if (!this.room) return false;
    return this.room.members.some((m) => m.seat === this.room!.you && m.isHost);
  }

  start(): void {
    this.stopped = false;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.connect();
    }
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }

  startGame(): void {
    this.send({ type: 'start-game' });
  }

  submitHuman(response: ResponseData): string | null {
    const req = this.state?.pendingRequest;
    if (!req || req.player !== this.you) return '当前不是你的应答时机';
    this.send({ type: 'action', requestId: req.id, response });
    return null; // 服务器校验失败会通过 error 消息回报
  }

  submitHumanDefault(): void {
    const req = this.state?.pendingRequest;
    if (!req || req.player !== this.you || !this.state) return;
    this.send({ type: 'action', requestId: req.id, response: defaultResponse(this.state, req) });
  }

  private connect(): void {
    this.status = 'connecting';
    this.notify();
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.stopped) {
        ws.close();
        return;
      }
      this.status = 'open';
      this.retries = 0;
      if (this.token && this.roomId) {
        this.send({ type: 'rejoin', roomId: this.roomId, token: this.token });
      } else if (this.intent.kind === 'create') {
        this.send({
          type: 'create-room', name: this.intent.name,
          playerCount: this.intent.playerCount, pickGenerals: this.intent.pickGenerals,
        });
      } else {
        this.send({ type: 'join-room', roomId: this.intent.roomId, name: this.intent.name });
      }
      this.notify();
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.handle(msg);
    };

    ws.onclose = () => {
      if (this.stopped || this.ws !== ws) return;
      if (this.retries < MAX_RETRIES) {
        this.status = 'connecting';
        this.retries++;
        this.notify();
        setTimeout(() => {
          if (!this.stopped) this.connect();
        }, 1500);
      } else {
        this.status = 'failed';
        this.notify();
      }
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.token = msg.token;
        this.roomId = msg.roomId;
        this.you = `p${msg.seat}`;
        break;
      case 'room':
        this.room = msg;
        this.you = `p${msg.you}`;
        break;
      case 'sync':
        this.state = msg.state;
        this.you = msg.you;
        break;
      case 'error':
        this.onError?.(msg.message);
        return;
    }
    this.notify();
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private notify(): void {
    this.onUpdate?.();
  }
}

export function defaultWsUrl(): string {
  const fromEnv = import.meta.env?.VITE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:8081`;
}
