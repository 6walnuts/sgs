// 简化项完善:装备牌转化、八卦响应万箭、酒池自救、主公候选保底

import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { equipSlotOf, isRed } from './deck';
import type { CardId } from './types';
import {
  P, act, clearHands, equip, give, newGame, removeEverywhere, rigDrawTop, rigPlay,
  setGeneral, setRoles,
} from './testUtils';

// 找一张未被占用的指定颜色装备牌并装到某人装备区
function equipColored(s: ReturnType<typeof newGame>, pid: string, red: boolean): CardId {
  const c = Object.values(s.cards).find((x) =>
    equipSlotOf(x.name) !== null && isRed(x.suit) === red
    && !s.players.some((p) => p.hand.includes(x.id) || Object.values(p.equips).includes(x.id)));
  if (!c) throw new Error('找不到装备牌');
  removeEverywhere(s, c.id);
  P(s, pid).equips[equipSlotOf(c.name)!] = c.id;
  return c.id;
}

describe('转化技支持装备牌', () => {
  it('武圣:可将装备区的红色牌当杀打出', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'guanyu');
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'juedou');
    const redEquip = equipColored(s, 'p1', true);
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: redEquip, skill: 'wusheng' });
    s = act(s, { kind: 'decline' }); // p0 不出杀
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    expect(s.discardPile).toContain(redEquip);
  });

  it('倾国:可将装备区的黑色牌当闪打出', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhenji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const blackEquip = equipColored(s, 'p1', false);
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    // 若黑色装备恰好是八卦阵会先询问八卦:放弃判定,直接用装备当闪
    if (s.pendingRequest?.type === 'choose-option') s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'card', cardId: blackEquip, skill: 'qingguo' });
    expect(P(s, 'p1').hp).toBe(hp1);
    expect(s.discardPile).toContain(blackEquip);
  });
});

describe('八卦阵响应万箭齐发', () => {
  it('判定为红则视为打出闪', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const wj = give(s, 'p0', 'wanjian');
    equip(s, 'p1', 'baguazhen');
    rigDrawTop(s, { red: true });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: wj, targets: [] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'bagua' });
    s = act(s, { kind: 'option', index: 0 });
    // 判红视为闪:p1 不掉血,直接轮到 p2 应对
    expect(P(s, 'p1').hp).toBe(hp1);
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'respond-card' });
  });
});

describe('酒池濒死自救', () => {
  it('董卓濒死时可将黑桃手牌当酒回复', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'spy', p2: 'loyalist', p3: 'rebel' });
    setGeneral(s, 'p1', 'dongzhuo');
    P(s, 'p1').hp = 1;
    P(s, 'p1').maxHp = 8;
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const spade = give(s, 'p1', 'guohe', { suit: 'spade' });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // 不出闪 → 濒死
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'tao' });
    s = act(s, { kind: 'card', cardId: spade, skill: 'jiuchi' });
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p1').hp).toBe(1);
  });
});

describe('选将主公候选保底', () => {
  it('主公候选必含经典主公将(曹/刘/孙,含界版)', () => {
    const CLASSIC = ['caocao', 'liubei', 'sunquan', 'jiecaocao', 'jieliubei', 'jiesunquan'];
    for (let seed = 1; seed <= 30; seed++) {
      const s = createGame({ seed, pickGenerals: true }).state;
      expect(s.pendingRequest).toMatchObject({ type: 'choose-general' });
      const req = s.pendingRequest as Extract<typeof s.pendingRequest, { type: 'choose-general' }>;
      expect(req!.candidates.some((g) => CLASSIC.includes(g))).toBe(true);
    }
  });
});
