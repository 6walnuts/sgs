// 神武将(神关羽/神吕蒙/神曹操):武神/武魂/涉猎/攻心/归心/飞影 + 神势力登场选择

import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { GENERALS } from './generals';
import {
  P, act, actErr, clearHands, give, newGame, rigDrawTop, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('神将入池规则', () => {
  it('默认不入池;开启后主公也不会分到神将', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createGame({ seed }).state;
      for (const p of s.players) {
        expect(GENERALS[p.general].faction).not.toBe('god');
      }
    }
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame({ seed, godGenerals: true, playerCount: 8 }).state;
      const lord = s.players.find((p) => p.role === 'lord')!;
      expect(GENERALS[lord.general].faction).not.toBe('god');
    }
  });

  it('随机分配到神将时,开局先选择势力', () => {
    // 扫种子找一局有神将的
    for (let seed = 1; seed < 200; seed++) {
      const s = createGame({ seed, godGenerals: true, playerCount: 8 }).state;
      const god = s.players.find((p) => GENERALS[p.general].faction === 'god');
      if (!god) continue;
      expect(s.pendingRequest).toMatchObject({ player: god.id, type: 'choose-option', reason: 'god-faction' });
      const s2 = act(s, { kind: 'option', index: 2 }); // 吴
      expect(P(s2, god.id).faction).toBe('wu');
      return;
    }
    throw new Error('200 个种子内未出现神将');
  });
});

describe('神关羽·武神/武魂', () => {
  it('武神:红桃手牌出牌与响应均视为杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'shenguanyu');
    rigPlay(s, 'p0');
    const heartTao = give(s, 'p0', 'tao', { suit: 'heart' });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: heartTao, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 红桃桃当杀打出去了
  });

  it('武魂:死亡时伤害最多者判定,非桃则死', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'rebel', p1: 'lord', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p0', 'shenguanyu');
    rigPlay(s, 'p1');
    P(s, 'p0').hp = 1;
    P(s, 'p2').hp = 4;
    const sha = give(s, 'p1', 'sha');
    rigDrawTop(s, { suit: 'spade' }); // 武魂判定非桃
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p0'] });
    s = act(s, { kind: 'decline' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').alive).toBe(false);
    // p1(唯一伤害来源)被武魂索命
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(false);
  });
});

describe('神吕蒙·涉猎/攻心', () => {
  it('涉猎:亮五张,每种花色获得一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'shenlvmeng');
    rigPlay(s, 'p0');
    const top5 = s.drawPile.slice(0, 5);
    const suits = new Set(top5.map((id) => s.cards[id].suit));
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'shelie' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toHaveLength(suits.size);
  });

  it('攻心:查看手牌,展示红桃并置于牌堆顶', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'shenlvmeng');
    rigPlay(s, 'p0');
    const heart = give(s, 'p1', 'tao', { suit: 'heart' });
    give(s, 'p1', 'sha', { suit: 'spade' });
    s = act(s, { kind: 'use-skill', skill: 'gongxin', targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', reason: { kind: 'gongxin' } });
    s = act(s, { kind: 'cards', cardIds: [heart] });
    s = act(s, { kind: 'option', index: 1 }); // 置于牌堆顶
    expect(s.drawPile[0]).toBe(heart);
    expect(P(s, 'p1').hand).toHaveLength(1);
  });
});

describe('神曹操·归心/飞影', () => {
  it('归心:受伤后从每名其他角色处拿一张随机手牌并翻面;飞影:距离 +1', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'shencaocao');
    rigPlay(s, 'p0');
    give(s, 'p1', 'tao');
    give(s, 'p3', 'shan');
    // 飞影验证:p1 对 p2 本距离 1,飞影后 2,兵粮寸断(限距离1)放不了
    rigPlay(s, 'p1');
    const bl = give(s, 'p1', 'bingliang');
    expect(actErr(s, { kind: 'play-card', cardId: bl, targets: ['p2'] })).toContain('距离');
    // 归心:p1 杀 p2(距离因飞影是 2,给 p1 配连弩+红杀?改用决斗避免距离)
    const jd = give(s, 'p1', 'juedou');
    const hand1 = P(s, 'p1').hand.length;
    const hand3 = P(s, 'p3').hand.length;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p2'] });
    s = act(s, { kind: 'decline' }); // p2 不出杀 → 受伤
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'guixin' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p2').flipped).toBe(true);
    // 从 p0(无手牌跳过)、p1、p3 各拿一张
    expect(P(s, 'p1').hand.length).toBe(hand1 - 2); // 打出决斗 1 张 + 被归心拿走 1 张
    expect(P(s, 'p3').hand.length).toBe(hand3 - 1);
    expect(P(s, 'p2').hand.length).toBe(2);
  });
});
