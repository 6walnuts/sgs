import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './server';
import type { ClientMessage, ServerMessage } from '../net/protocol';
import { defaultResponse } from '../ai/simpleAi';
import { redactStateFor } from '../engine/view';
import { createGame } from '../engine/engine';

// 用 Node 自带的 WebSocket 客户端连接真实服务器做集成测试

class TestClient {
  private queue: ServerMessage[] = [];
  private waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];
  private ws: WebSocket;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage;
      const wi = this.waiters.findIndex((w) => w.pred(msg));
      if (wi >= 0) {
        const [w] = this.waiters.splice(wi, 1);
        w.resolve(msg);
      } else {
        this.queue.push(msg);
      }
    });
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('连接失败')), { once: true });
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  next(pred: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
    const qi = this.queue.findIndex(pred);
    if (qi >= 0) {
      const [m] = this.queue.splice(qi, 1);
      return Promise.resolve(m);
    }
    return new Promise((resolve, reject) => {
      const waiter = { pred, resolve: (m: ServerMessage) => { clearTimeout(t); resolve(m); } };
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error('等待服务器消息超时'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  close(): void {
    this.ws.close();
  }
}

type Sync = Extract<ServerMessage, { type: 'sync' }>;
const isSync = (m: ServerMessage): m is Sync => m.type === 'sync';

describe('联机服务器', () => {
  let cleanup: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup = [];
  });

  async function setup() {
    const srv = createServer({ port: 0, aiDelayMs: 0, humanTimeoutMs: 60000 });
    cleanup.push(() => srv.close());
    return srv;
  }

  it('创建/加入房间,开始游戏,视角过滤生效', async () => {
    const srv = await setup();
    const a = new TestClient(srv.port);
    const b = new TestClient(srv.port);
    cleanup.push(() => a.close(), () => b.close());
    await a.open();
    await b.open();

    a.send({ type: 'create-room', name: '甲' });
    const welcomeA = await a.next((m) => m.type === 'welcome');
    expect(welcomeA.type).toBe('welcome');
    const roomId = (welcomeA as Extract<ServerMessage, { type: 'welcome' }>).roomId;
    expect(roomId).toHaveLength(4);

    b.send({ type: 'join-room', roomId, name: '乙' });
    const welcomeB = await b.next((m) => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
    expect(welcomeB.seat).toBe(1);

    // 两人都能看到成员列表
    const roomMsg = await a.next((m) => m.type === 'room' && m.members.length === 2) as Extract<ServerMessage, { type: 'room' }>;
    expect(roomMsg.members.map((m) => m.name)).toEqual(['甲', '乙']);
    expect(roomMsg.members[0].isHost).toBe(true);

    // 非房主不能开始
    b.send({ type: 'start-game' });
    const err = await b.next((m) => m.type === 'error');
    expect((err as Extract<ServerMessage, { type: 'error' }>).message).toContain('房主');

    a.send({ type: 'start-game' });
    const syncA = await a.next(isSync) as Sync;
    const syncB = await b.next(isSync) as Sync;
    expect(syncA.you).toBe('p0');
    expect(syncB.you).toBe('p1');

    // 视角过滤:乙看不到甲的手牌与牌堆内容
    // (首个 sync 来自同一次广播,两个视角对应同一状态;
    //  若 p0 恰好是主公,开局已摸 2 张,手牌数不固定为 4)
    const p0FromA = syncA.state.players.find((p) => p.id === 'p0')!;
    const p0FromB = syncB.state.players.find((p) => p.id === 'p0')!;
    expect(p0FromB.hand.length).toBe(p0FromA.hand.length);
    expect(p0FromB.hand.length).toBeGreaterThanOrEqual(4);
    expect(p0FromB.hand.every((id) => id === -1)).toBe(true);
    const p1FromB = syncB.state.players.find((p) => p.id === 'p1')!;
    expect(p1FromB.hand.every((id) => id > 0)).toBe(true);
    expect(syncB.state.drawPile.every((id) => id === -1)).toBe(true);
    expect(syncB.state.rngState).toBe(0);
    expect(syncB.state.stack).toHaveLength(0);
    // 甲的完整视角里自己手牌可见
    expect(p0FromA.hand.every((id) => id > 0)).toBe(true);
  });

  it('两名玩家 + 2 AI 能推进对局(默认应答)', async () => {
    const srv = await setup();
    const a = new TestClient(srv.port);
    const b = new TestClient(srv.port);
    cleanup.push(() => a.close(), () => b.close());
    await a.open();
    await b.open();

    a.send({ type: 'create-room', name: '甲' });
    const welcome = await a.next((m) => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
    b.send({ type: 'join-room', roomId: welcome.roomId, name: '乙' });
    await b.next((m) => m.type === 'welcome');
    a.send({ type: 'start-game' });

    // 两个客户端都:收到 sync 后,若请求属于自己则用默认应答回应
    let turns = 0;
    const seen = new Set<number>();
    const step = async (c: TestClient): Promise<void> => {
      const sync = await c.next(isSync, 8000) as Sync;
      const st = sync.state;
      turns = Math.max(turns, st.turn.turnNumber);
      const req = st.pendingRequest;
      if (req && req.player === sync.you && !seen.has(req.id)) {
        seen.add(req.id);
        c.send({ type: 'action', requestId: req.id, response: defaultResponse(st, req) });
      }
    };
    // 消费足够多的同步消息,直到对局推进数个回合
    for (let i = 0; i < 120 && turns < 4; i++) {
      await Promise.race([step(a), step(b)]);
    }
    expect(turns).toBeGreaterThanOrEqual(4);
  });

  it('断线后可凭 token 重连恢复座位', async () => {
    const srv = await setup();
    const a = new TestClient(srv.port);
    const b = new TestClient(srv.port);
    cleanup.push(() => a.close(), () => b.close());
    await a.open();
    await b.open();

    a.send({ type: 'create-room', name: '甲' });
    const wa = await a.next((m) => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
    b.send({ type: 'join-room', roomId: wa.roomId, name: '乙' });
    const wb = await b.next((m) => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
    a.send({ type: 'start-game' });
    await b.next(isSync);

    b.close();
    // 乙重连
    const b2 = new TestClient(srv.port);
    cleanup.push(() => b2.close());
    await b2.open();
    b2.send({ type: 'rejoin', roomId: wa.roomId, token: wb.token });
    const wb2 = await b2.next((m) => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
    expect(wb2.seat).toBe(1);
    const sync = await b2.next(isSync) as Sync;
    expect(sync.you).toBe('p1');
    expect(sync.state.turn).toBeDefined();
  });

  it('托管:开启后该玩家的回合由 AI 代打并广播状态,重连即取消', async () => {
    // 房主一人局(其余 AI),托管后连自己的回合也由 AI 推进,对局不卡住
    const srv = await setup();
    const a = new TestClient(srv.port);
    cleanup.push(() => a.close());
    await a.open();
    a.send({ type: 'create-room', name: '甲' });
    await a.next((m) => m.type === 'welcome');
    a.send({ type: 'start-game' });
    // 等到轮到房主 p0 应答
    await a.next((m) => isSync(m) && m.state.pendingRequest?.player === 'p0', 8000);

    a.send({ type: 'trust', on: true });
    // 广播的 room 消息里本人 trust=true
    const room = await a.next(
      (m) => m.type === 'room' && m.members.some((mm) => mm.seat === 0 && mm.trust),
    ) as Extract<ServerMessage, { type: 'room' }>;
    expect(room.members[0].trust).toBe(true);

    // 托管后无需本人应答,对局仍推进到后续回合
    const advanced = await a.next(
      (m) => isSync(m) && m.state.turn.turnNumber >= 2, 8000,
    ) as Sync;
    expect(advanced.state.turn.turnNumber).toBeGreaterThanOrEqual(2);

    // 取消托管
    a.send({ type: 'trust', on: false });
    const room2 = await a.next(
      (m) => m.type === 'room' && m.members.every((mm) => !mm.trust),
    ) as Extract<ServerMessage, { type: 'room' }>;
    expect(room2.members[0].trust).toBe(false);
  });
});

describe('视角过滤(redactStateFor)', () => {
  it('隐藏他人手牌、身份、牌堆与随机数状态,且结果可序列化', () => {
    const s = createGame({ seed: 7 }).state;
    const view = redactStateFor(s, 'p1');
    for (const p of view.players) {
      if (p.id === 'p1') {
        expect(p.hand.every((id) => id > 0)).toBe(true);
      } else {
        expect(p.hand.every((id) => id === -1)).toBe(true);
        expect(p.hand).toHaveLength(s.players.find((x) => x.id === p.id)!.hand.length);
        if (!p.roleRevealed) expect(p.role).toBe('loyalist');
      }
    }
    const lord = view.players.find((p) => p.roleRevealed)!;
    expect(lord.role).toBe(s.players.find((p) => p.id === lord.id)!.role);
    expect(view.drawPile.every((id) => id === -1)).toBe(true);
    expect(view.rngState).toBe(0);
    expect(() => JSON.stringify(view)).not.toThrow();
    // 原 state 未被修改
    expect(s.players.some((p) => p.hand.some((id) => id > 0))).toBe(true);
  });
});
