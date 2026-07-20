// 开局选将:主公 5 选 1,其余按座次 3 选 1,全部选定后发牌开局

import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { ALL_GENERAL_IDS, BASE_GENERAL_IDS, GENERALS, jieOf } from './generals';
import { redactStateFor } from './view';
import { decide, defaultResponse } from '../ai/simpleAi';
import { act, actErr } from './testUtils';
import { applyAction } from './engine';

describe('选将模式', () => {
  it('主公先从 5 名候选选,其余各 3 名;候选互不重复;非候选武将被拒绝', () => {
    const s0 = createGame({ seed: 7, pickGenerals: true }).state;
    const lord = s0.players.find((p) => p.role === 'lord')!;
    const req = s0.pendingRequest!;
    expect(req.type).toBe('choose-general');
    expect(req.player).toBe(lord.id);
    if (req.type !== 'choose-general') throw new Error('unreachable');
    expect(req.candidates).toHaveLength(5);
    // 全部候选互不重复
    const frame = s0.stack[0];
    if (frame.type !== 'choose-generals') throw new Error('栈顶应为选将帧');
    const all = Object.values(frame.candidates).flat();
    expect(new Set(all).size).toBe(5 + 3 * (s0.players.length - 1));
    // 不能选候选之外的武将
    const outside = ALL_GENERAL_IDS.find((g) => !req.candidates.includes(g))!;
    expect(actErr(s0, { kind: 'general', general: outside })).toContain('候选');
    expect(actErr(s0, { kind: 'decline' })).toBeTruthy(); // 不能放弃选将
  });

  it('全部选定后:体力按所选武将设置(主公+1),各发 4 张手牌,主公回合开始', () => {
    let s = createGame({ seed: 11, pickGenerals: true }).state;
    const lord = s.players.find((p) => p.role === 'lord')!;
    const picks: Record<string, string> = {};
    while (s.pendingRequest?.type === 'choose-general') {
      const r = s.pendingRequest;
      if (r.player !== lord.id) expect(r.candidates).toHaveLength(3);
      const g = r.candidates[1] ?? r.candidates[0];
      picks[r.player] = g;
      s = act(s, { kind: 'general', general: g });
    }
    for (const p of s.players) {
      expect(p.general).toBe(picks[p.id]);
      expect(p.unpicked).toBeUndefined();
      expect(p.maxHp).toBe(GENERALS[p.general].hp + (p.role === 'lord' ? 1 : 0));
      expect(p.hp).toBe(p.maxHp);
      // 主公开局后立刻进入自己的摸牌阶段(4+2),其余为起手 4 张
      expect(p.hand).toHaveLength(p.id === lord.id ? 6 : 4);
    }
    expect(s.turn.activePlayer).toBe(lord.id);
    expect(s.pendingRequest).toMatchObject({ player: lord.id });
  });

  it('视角过滤:他人的候选与未选定武将不可见', () => {
    const s0 = createGame({ seed: 7, pickGenerals: true }).state;
    const lord = s0.players.find((p) => p.role === 'lord')!;
    const other = s0.players.find((p) => p.id !== lord.id)!;
    const view = redactStateFor(s0, other.id);
    // 主公正在选将:候选对旁观者不可见
    expect(view.pendingRequest).toMatchObject({ type: 'choose-general', candidates: [] });
    // 他人的占位武将被隐藏为固定值
    expect(view.players.find((p) => p.id === lord.id)!.general).toBe('liubei');
    // 自己的候选保留(轮到自己时可见)
    expect(view.players.find((p) => p.id === other.id)!.unpicked).toBe(true);
  });

  it('候选数设置生效:主公 = 每人 +2;8 人局按武将池自动下调', () => {
    // 4 人局请求 5:主公 7,其余 5
    const s = createGame({ seed: 3, pickGenerals: true, generalCandidates: 5 }).state;
    const frame = s.stack[0];
    if (frame.type !== 'choose-generals') throw new Error('栈顶应为选将帧');
    const lord = s.players.find((p) => p.role === 'lord')!;
    expect(frame.candidates[lord.id]).toHaveLength(7);
    for (const p of s.players) {
      if (p.id !== lord.id) expect(frame.candidates[p.id]).toHaveLength(5);
    }
    // 8 人局请求 99:候选数被钳制到 min(6, 池子容量);池子按原版武将数计
    const cap = Math.floor((BASE_GENERAL_IDS.length - 2) / 8);
    const expected = Math.min(6, cap);
    const s8 = createGame({ seed: 3, playerCount: 8, pickGenerals: true, generalCandidates: 99 }).state;
    const f8 = s8.stack[0];
    if (f8.type !== 'choose-generals') throw new Error('栈顶应为选将帧');
    const lord8 = s8.players.find((p) => p.role === 'lord')!;
    expect(f8.candidates[lord8.id]).toHaveLength(expected + 2);
    for (const p of s8.players) {
      if (p.id !== lord8.id) expect(f8.candidates[p.id]).toHaveLength(expected);
    }
  });

  it('界限突破与原版同一武将:候选只列原版,可直接选其界版', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s0 = createGame({ seed, pickGenerals: true }).state;
      const req = s0.pendingRequest!;
      if (req.type !== 'choose-general') throw new Error('unreachable');
      // 候选里永远不会出现界版(不会同场两个"关羽")
      expect(req.candidates.every((g) => !g.startsWith('jie'))).toBe(true);
      const withJie = req.candidates.find((g) => jieOf(g));
      if (!withJie) continue;
      const jieId = jieOf(withJie)!;
      const s1 = act(s0, { kind: 'general', general: jieId });
      const p = s1.players.find((x) => x.id === req.player)!;
      expect(p.general).toBe(jieId);
      expect(p.maxHp).toBe(GENERALS[jieId].hp + (p.role === 'lord' ? 1 : 0));
      // 候选之外的武将,其界版同样不能选
      const outsideBase = BASE_GENERAL_IDS.find(
        (g) => !req.candidates.includes(g) && jieOf(g) !== undefined,
      )!;
      expect(actErr(s0, { kind: 'general', general: jieOf(outsideBase)! })).toContain('候选');
      return;
    }
    throw new Error('60 个 seed 里竟无一含界版候选');
  });

  it('选将模式下 AI 对战能正常终局', () => {
    for (const seed of [21, 22]) {
      let s = createGame({ seed, pickGenerals: true, playerCount: 5 }).state;
      let steps = 0;
      while (!s.winner) {
        if (++steps > 20000) throw new Error('对局未在限定步数内结束');
        const req = s.pendingRequest!;
        let resp;
        try {
          resp = decide(s, req.player, req);
        } catch {
          resp = defaultResponse(s, req);
        }
        let r = applyAction(s, { player: req.player, requestId: req.id, response: resp });
        if (r.error) {
          r = applyAction(s, { player: req.player, requestId: req.id, response: defaultResponse(s, req) });
        }
        if (r.error) throw new Error(`默认应答被拒绝:${r.error}`);
        s = r.state;
      }
      expect(s.winner!.length).toBeGreaterThan(0);
    }
  });
});
