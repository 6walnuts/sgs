// 联机协议:客户端与服务器之间的 WebSocket 消息(JSON)。
// 服务器是权威:客户端只发送"对 PendingRequest 的应答",与本地版 Action 一致。

import type { GameState, PlayerId, ResponseData } from '../engine/types';

export interface MemberInfo {
  seat: number;
  name: string;
  connected: boolean;
  isHost: boolean;
  trust: boolean; // 托管中:本人在线但把操作权交给 AI
}

export type ClientMessage =
  | { type: 'create-room'; name: string; playerCount?: 4 | 5 | 8; pickGenerals?: boolean;
      generalCandidates?: number; aiDelayMs?: number; godGenerals?: boolean }
  | { type: 'join-room'; roomId: string; name: string }
  | { type: 'rejoin'; roomId: string; token: string }
  | { type: 'start-game' }
  | { type: 'trust'; on: boolean } // 切换托管:交给 AI / 收回操作权
  | { type: 'action'; requestId: number; response: ResponseData };

export type ServerMessage =
  | { type: 'welcome'; roomId: string; token: string; seat: number }
  | { type: 'room'; roomId: string; phase: 'lobby' | 'playing'; you: number;
      playerCount: number; members: MemberInfo[] }
  | { type: 'sync'; you: PlayerId; state: GameState } // state 已按 you 的视角过滤
  | { type: 'error'; message: string };

export const DEFAULT_PORT = 8081;
