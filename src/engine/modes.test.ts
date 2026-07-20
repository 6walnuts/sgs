// 五人局 / 八人局:身份分配与完整对局

import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import type { ResponseData, Role } from './types';
import { decide, defaultResponse } from '../ai/simpleAi';

function roleCounts(roles: Role[]): Record<Role, number> {
  const c: Record<Role, number> = { lord: 0, loyalist: 0, rebel: 0, spy: 0 };
  for (const r of roles) c[r]++;
  return c;
}

describe('多人局', () => {
  it('五人局:主1 忠1 反2 内1,主公先手', () => {
    const s = createGame({ seed: 11, playerCount: 5 }).state;
    expect(s.players).toHaveLength(5);
    expect(roleCounts(s.players.map((p) => p.role))).toEqual({
      lord: 1, loyalist: 1, rebel: 2, spy: 1,
    });
    const lord = s.players.find((p) => p.role === 'lord')!;
    expect(s.turn.activePlayer).toBe(lord.id);
    expect(lord.maxHp).toBe(lord.hp);
    // 武将不重复
    expect(new Set(s.players.map((p) => p.general)).size).toBe(5);
  });

  it('八人局:主1 忠2 反4 内1', () => {
    const s = createGame({ seed: 12, playerCount: 8 }).state;
    expect(s.players).toHaveLength(8);
    expect(roleCounts(s.players.map((p) => p.role))).toEqual({
      lord: 1, loyalist: 2, rebel: 4, spy: 1,
    });
    expect(new Set(s.players.map((p) => p.general)).size).toBe(8);
    // 每人起手 4 张(主公已进入回合并摸牌,手牌更多)
    for (const p of s.players) {
      if (p.id === s.turn.activePlayer) expect(p.hand.length).toBeGreaterThanOrEqual(4);
      else expect(p.hand).toHaveLength(4);
    }
  });

  it('五人局与八人局 AI 对战能正常终局', () => {
    for (const [seed, playerCount] of [[21, 5], [22, 5], [31, 8], [32, 8]] as const) {
      let s = createGame({ seed, playerCount }).state;
      let steps = 0;
      while (!s.winner && steps < 12000) {
        const req = s.pendingRequest!;
        let resp: ResponseData;
        try {
          resp = decide(s, req.player, req);
        } catch {
          resp = defaultResponse(s, req);
        }
        let r = applyAction(s, { player: req.player, requestId: req.id, response: resp });
        if (r.error) {
          r = applyAction(s, { player: req.player, requestId: req.id, response: defaultResponse(s, req) });
        }
        expect(r.error).toBeUndefined();
        s = r.state;
        steps++;
      }
      expect(s.winner).not.toBeNull();
    }
  });
});
