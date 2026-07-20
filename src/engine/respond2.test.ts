// 拼点暗选 + 蛊惑响应声明

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, give, newGame, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('拼点暗选', () => {
  it('先选的牌留在手中不进处理区,双方选定后才同时亮出', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'xunyu');
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 3;
    P(s, 'p1').hp = 4;
    const mine = give(s, 'p0', 'sha');
    give(s, 'p1', 'shan');
    s = act(s, { kind: 'use-skill', skill: 'quhu', targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', reason: { kind: 'pindian' } });
    s = act(s, { kind: 'cards', cardIds: [mine] });
    // 暗选:p0 的拼点牌仍在手中,处理区为空,对手看不到
    expect(P(s, 'p0').hand).toContain(mine);
    expect(s.processingZone).toHaveLength(0);
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards' });
    s = act(s, { kind: 'cards', cardIds: [P(s, 'p1').hand[0]] });
    // 双方亮出后两张牌都进弃牌堆
    expect(s.discardPile).toContain(mine);
    expect(P(s, 'p0').hand).toHaveLength(0);
  });
});

describe('蛊惑响应声明', () => {
  it('声明闪且无人质疑:任意手牌当闪生效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'yuji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const fake = give(s, 'p1', 'tao');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: fake, skill: 'guhuo' });
    // 依次询问其他角色是否质疑
    while (s.pendingRequest?.type === 'choose-option') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1); // 声明成立,闪掉了
    expect(s.discardPile).toContain(fake);
  });

  it('假牌被质疑:作废弃置,回到原请求且不能再声明', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'yuji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const fake = give(s, 'p1', 'tao');
    const extra = give(s, 'p1', 'guohe');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: fake, skill: 'guhuo' });
    s = act(s, { kind: 'option', index: 0 }); // 第一名角色质疑
    expect(s.discardPile).toContain(fake);
    // 回到原请求:不能再声明蛊惑
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
    expect(actErr(s, { kind: 'card', cardId: extra, skill: 'guhuo' })).toContain('识破');
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('真牌被质疑:生效且质疑者失去 1 点体力', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'yuji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const realShan = give(s, 'p1', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: realShan, skill: 'guhuo' });
    const challenger = s.pendingRequest!.player;
    const hpC = P(s, challenger).hp;
    s = act(s, { kind: 'option', index: 0 }); // 质疑
    expect(P(s, 'p1').hp).toBe(hp1); // 真闪生效
    expect(P(s, challenger).hp).toBe(hpC - 1); // 质疑真牌者失去体力
  });

  it('濒死时可蛊惑声明桃自救', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'spy', p2: 'loyalist', p3: 'rebel' });
    setGeneral(s, 'p1', 'yuji');
    P(s, 'p1').hp = 1;
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const fake = give(s, 'p1', 'guohe');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // 不出闪 → 濒死
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'tao' });
    s = act(s, { kind: 'card', cardId: fake, skill: 'guhuo' });
    while (s.pendingRequest?.type === 'choose-option') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p1').hp).toBe(1);
  });

  it('可蛊惑声明无懈可击', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'yuji');
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'juedou');
    const fake = give(s, 'p1', 'sha');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p2'] });
    // p1(于吉)被询问无懈
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'wuxie' });
    s = act(s, { kind: 'card', cardId: fake, skill: 'guhuo' });
    while (s.pendingRequest?.type === 'choose-option') s = act(s, { kind: 'decline' });
    // 决斗被无懈:p2 不掉血,回到 p0 出牌
    expect(P(s, 'p2').hp).toBe(hp2);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });
});
