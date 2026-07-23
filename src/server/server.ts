// 联机服务器:房间管理 + 权威对局。
// 复用与单机完全相同的引擎(applyAction)与 AI(decide/defaultResponse);
// 每次状态变化后按玩家视角(redactStateFor)分发,客户端永远拿不到完整信息。

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { GameState, PendingRequest, ResponseData } from '../engine/types';
import { applyAction, createGame } from '../engine/engine';
import { redactStateFor } from '../engine/view';
import { decide, defaultResponse } from '../ai/simpleAi';
import type { ClientMessage, MemberInfo, ServerMessage } from '../net/protocol';

export interface ServerOptions {
  port: number;             // 0 = 随机端口(测试用)
  aiDelayMs?: number;       // AI 应答延迟
  humanTimeoutMs?: number;  // 在线玩家应答超时(客户端倒计时 20s,这是服务器兜底)
  offlineTimeoutMs?: number; // 掉线玩家由服务器代答的延迟
  staticDir?: string;       // 生产构建目录(dist):同端口托管游戏页面,便于单端口部署
}

interface Member {
  token: string;
  name: string;
  seat: number;
  isHost: boolean;
  ws: WebSocket | null;
  trust: boolean; // 托管中:虽在线但由 AI 代为决策
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomId(): string {
  const bytes = randomBytes(4);
  return [...bytes].map((b) => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
}

function send(ws: WebSocket | null, msg: ServerMessage): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

class Room {
  phase: 'lobby' | 'playing' = 'lobby';
  members: Member[] = [];
  state: GameState | null = null;
  playerCount: 4 | 5 | 8 = 4;
  pickGenerals = false;
  generalCandidates: number | undefined;
  godGenerals = false;
  aiDelayMs: number | undefined; // 房主设置的 AI 出牌延迟(覆盖服务器默认)
  private timer: NodeJS.Timeout | null = null;

  constructor(
    public readonly id: string,
    private readonly opts: Required<Omit<ServerOptions, 'port' | 'staticDir'>>,
    private readonly onEmpty: (room: Room) => void,
  ) {}

  join(ws: WebSocket, name: string): Member | string {
    if (this.phase !== 'lobby') return '对局已开始,无法加入';
    if (this.members.length >= this.playerCount) return '房间已满';
    const member: Member = {
      token: randomUUID(),
      name: name.trim().slice(0, 12) || '玩家',
      seat: this.members.length,
      isHost: this.members.length === 0,
      ws,
      trust: false,
    };
    this.members.push(member);
    send(ws, { type: 'welcome', roomId: this.id, token: member.token, seat: member.seat });
    this.broadcastRoom();
    return member;
  }

  rejoin(ws: WebSocket, token: string): Member | string {
    const member = this.members.find((m) => m.token === token);
    if (!member) return '重连凭证无效';
    if (member.ws && member.ws !== ws) member.ws.close();
    member.ws = ws;
    member.trust = false; // 重连即视为收回操作权
    send(ws, { type: 'welcome', roomId: this.id, token: member.token, seat: member.seat });
    this.broadcastRoom();
    if (this.phase === 'playing' && this.state) {
      send(ws, { type: 'sync', you: `p${member.seat}`, state: redactStateFor(this.state, `p${member.seat}`) });
      this.pump(); // 若正等待该玩家应答,恢复为真人计时
    }
    return member;
  }

  onDisconnect(member: Member): void {
    if (this.phase === 'lobby') {
      this.members = this.members.filter((m) => m !== member);
      this.members.forEach((m, i) => {
        m.seat = i;
        m.isHost = i === 0;
      });
      if (this.members.length === 0) {
        this.dispose();
        return;
      }
      this.broadcastRoom();
      return;
    }
    member.ws = null;
    if (this.members.every((m) => m.ws === null)) {
      this.dispose();
      return;
    }
    this.broadcastRoom();
    this.pump(); // 若正等待该玩家应答,改用掉线代答计时
  }

  startGame(member: Member): string | null {
    if (!member.isHost) return '只有房主可以开始游戏';
    if (this.phase === 'playing' && this.state && !this.state.winner) return '对局进行中';
    this.phase = 'playing';
    this.state = createGame({
      seed: randomBytes(4).readUInt32BE(0),
      playerCount: this.playerCount,
      pickGenerals: this.pickGenerals,
      generalCandidates: this.generalCandidates,
      godGenerals: this.godGenerals,
    }).state;
    this.broadcastRoom();
    this.broadcastSync();
    this.pump();
    return null;
  }

  setTrust(member: Member, on: boolean): void {
    if (member.trust === on) return;
    member.trust = on;
    this.broadcastRoom();
    // 若此刻正等待该玩家应答:开启托管立即改用 AI 计时,关闭则恢复真人计时
    if (this.phase === 'playing' && this.state?.pendingRequest?.player === `p${member.seat}`) {
      this.pump();
    }
  }

  handleAction(member: Member, requestId: number, response: ResponseData): void {
    if (this.phase !== 'playing' || !this.state) {
      send(member.ws, { type: 'error', message: '对局尚未开始' });
      return;
    }
    const result = applyAction(this.state, { player: `p${member.seat}`, requestId, response });
    if (result.error) {
      send(member.ws, { type: 'error', message: result.error });
      return;
    }
    this.state = result.state;
    this.broadcastSync();
    this.pump();
  }

  // 为当前 pendingRequest 安排服务器侧应答:AI 座位、掉线玩家、超时兜底
  private pump(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.state || this.state.winner || !this.state.pendingRequest) return;
    const req = this.state.pendingRequest;
    const seat = Number(req.player.slice(1));
    const member = this.members.find((m) => m.seat === seat);
    // 空座与托管座都由 AI 决策;掉线座用较短兜底,在线真人用长超时
    const useAi = !member || member.trust;
    const delay = !member
      ? this.aiDelayMs ?? this.opts.aiDelayMs
      : member.trust
        ? this.aiDelayMs ?? this.opts.aiDelayMs
        : member.ws === null
          ? this.opts.offlineTimeoutMs
          : this.opts.humanTimeoutMs;
    this.timer = setTimeout(() => this.autoRespond(req, useAi), delay);
  }

  private autoRespond(req: PendingRequest, useAi: boolean): void {
    if (!this.state || this.state.winner) return;
    if (this.state.pendingRequest?.id !== req.id) return; // 已被应答
    let resp: ResponseData;
    if (useAi) {
      try {
        resp = decide(this.state, req.player, req);
      } catch {
        resp = defaultResponse(this.state, req);
      }
    } else {
      resp = defaultResponse(this.state, req);
    }
    let result = applyAction(this.state, { player: req.player, requestId: req.id, response: resp });
    if (result.error) {
      result = applyAction(this.state, {
        player: req.player, requestId: req.id, response: defaultResponse(this.state, req),
      });
    }
    if (result.error) throw new Error(`服务器代答被拒绝:${result.error}`);
    this.state = result.state;
    this.broadcastSync();
    this.pump();
  }

  private broadcastRoom(): void {
    const members: MemberInfo[] = this.members.map((m) => ({
      seat: m.seat, name: m.name, connected: m.ws !== null, isHost: m.isHost, trust: m.trust,
    }));
    for (const m of this.members) {
      send(m.ws, {
        type: 'room', roomId: this.id, phase: this.phase, you: m.seat,
        playerCount: this.playerCount, members,
      });
    }
  }

  private broadcastSync(): void {
    if (!this.state) return;
    for (const m of this.members) {
      send(m.ws, { type: 'sync', you: `p${m.seat}`, state: redactStateFor(this.state, `p${m.seat}`) });
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.onEmpty(this);
  }
}

// ---------- 静态文件托管:让联机服务器同端口直接提供游戏页面 ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon', '.map': 'application/json',
  '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(staticDir: string | undefined, req: IncomingMessage, res: ServerResponse): void {
  if (!staticDir) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('三国杀联机服务器运行中(未找到 dist/,请先 npm run build 以同端口提供游戏页面)');
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const root = path.resolve(staticDir);
  let file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(root, 'index.html'); // 单页应用回退
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

export function createServer(options: ServerOptions) {
  const opts = {
    aiDelayMs: options.aiDelayMs ?? 900,
    humanTimeoutMs: options.humanTimeoutMs ?? 45000,
    offlineTimeoutMs: options.offlineTimeoutMs ?? 3000,
  };
  const rooms = new Map<string, Room>();
  const httpServer = createHttpServer((req, res) => serveStatic(options.staticDir, req, res));
  const wss = new WebSocketServer({ server: httpServer });
  httpServer.listen(options.port);

  wss.on('connection', (ws) => {
    let bound: { room: Room; member: Member } | null = null;

    ws.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data));
      } catch {
        send(ws, { type: 'error', message: '消息格式错误' });
        return;
      }
      switch (msg.type) {
        case 'create-room': {
          if (bound) return;
          let id = makeRoomId();
          while (rooms.has(id)) id = makeRoomId();
          const room = new Room(id, opts, (r) => rooms.delete(r.id));
          if (msg.playerCount === 5 || msg.playerCount === 8) room.playerCount = msg.playerCount;
          room.pickGenerals = !!msg.pickGenerals;
          room.godGenerals = !!msg.godGenerals;
          if (typeof msg.generalCandidates === 'number') {
            room.generalCandidates = Math.max(3, Math.min(6, Math.floor(msg.generalCandidates)));
          }
          if (typeof msg.aiDelayMs === 'number') {
            room.aiDelayMs = Math.max(200, Math.min(3000, Math.floor(msg.aiDelayMs)));
          }
          rooms.set(id, room);
          const member = room.join(ws, msg.name);
          if (typeof member === 'string') send(ws, { type: 'error', message: member });
          else bound = { room, member };
          return;
        }
        case 'join-room': {
          if (bound) return;
          const room = rooms.get(msg.roomId.trim().toUpperCase());
          if (!room) {
            send(ws, { type: 'error', message: '房间不存在' });
            return;
          }
          const member = room.join(ws, msg.name);
          if (typeof member === 'string') send(ws, { type: 'error', message: member });
          else bound = { room, member };
          return;
        }
        case 'rejoin': {
          if (bound) return;
          const room = rooms.get(msg.roomId.trim().toUpperCase());
          if (!room) {
            send(ws, { type: 'error', message: '房间已关闭' });
            return;
          }
          const member = room.rejoin(ws, msg.token);
          if (typeof member === 'string') send(ws, { type: 'error', message: member });
          else bound = { room, member };
          return;
        }
        case 'start-game': {
          if (!bound) return;
          const err = bound.room.startGame(bound.member);
          if (err) send(ws, { type: 'error', message: err });
          return;
        }
        case 'trust': {
          if (!bound) return;
          bound.room.setTrust(bound.member, msg.on);
          return;
        }
        case 'action': {
          if (!bound) return;
          bound.room.handleAction(bound.member, msg.requestId, msg.response);
          return;
        }
      }
    });

    ws.on('close', () => {
      if (bound && bound.member.ws === ws) bound.room.onDisconnect(bound.member);
      bound = null;
    });
  });

  return {
    wss,
    get port(): number {
      const addr = httpServer.address();
      return typeof addr === 'object' && addr ? addr.port : options.port;
    },
    close(): Promise<void> {
      for (const room of rooms.values()) room.dispose();
      rooms.clear();
      for (const client of wss.clients) client.terminate();
      return new Promise((resolve) => {
        wss.close(() => httpServer.close(() => resolve()));
      });
    },
  };
}
