// 火包八将:强袭/驱虎/节命/连环/涅槃/八阵/看破/火计/天义/猛进/双雄/乱击/血裔

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, equip, give, newGame, rigDrawTop, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('典韦·强袭', () => {
  it('失去 1 点体力或弃武器牌造成 1 点伤害;每阶段限一次', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'dianwei');
    rigPlay(s, 'p0');
    const hp0 = P(s, 'p0').hp;
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'qiangxi', targets: ['p1'] });
    expect(P(s, 'p0').hp).toBe(hp0 - 1); // 失去体力
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(actErr(s, { kind: 'use-skill', skill: 'qiangxi', targets: ['p1'] })).toContain('限一次');
    // 下一阶段:弃武器牌代替失去体力
    rigPlay(s, 'p0');
    const w = give(s, 'p0', 'zhugeliannu');
    s = act(s, { kind: 'use-skill', skill: 'qiangxi', cardIds: [w], targets: ['p1'] });
    expect(P(s, 'p0').hp).toBe(hp0 - 1); // 未再失去体力
    expect(P(s, 'p1').hp).toBe(hp1 - 2);
    expect(s.discardPile).toContain(w);
  });

  it('超出攻击范围不能强袭', () => {
    const s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'dianwei');
    rigPlay(s, 'p0');
    expect(actErr(s, { kind: 'use-skill', skill: 'qiangxi', targets: ['p2'] })).toContain('范围');
  });
});

describe('荀彧·驱虎/节命', () => {
  it('驱虎拼点赢:目标对其攻击范围内你指定的角色造成伤害', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'xunyu');
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 3;
    P(s, 'p1').hp = 4; // 驱虎要求目标体力更高
    const mine = give(s, 'p0', 'sha', { suit: 'spade' });
    const theirs = give(s, 'p1', 'shan');
    // 保证点数大小:找一张点数更大的给自己
    const big = s.cards[mine].rank >= s.cards[theirs].rank ? mine : theirs;
    if (big !== mine) {
      // 交换,让 p0 持有大牌
      P(s, 'p0').hand = [theirs];
      P(s, 'p1').hand = [mine];
    }
    const myCard = P(s, 'p0').hand[0];
    const theirCard = P(s, 'p1').hand[0];
    if (s.cards[myCard].rank === s.cards[theirCard].rank) {
      s.cards[myCard].rank = 13;
      s.cards[theirCard].rank = 2;
    }
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'use-skill', skill: 'quhu', targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', reason: { kind: 'pindian' } });
    s = act(s, { kind: 'cards', cardIds: [myCard] });
    s = act(s, { kind: 'cards', cardIds: [theirCard] });
    // 赢:选择 p1 攻击范围内的角色(p2 距 p1 为 1)
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-player', reason: { kind: 'quhu' } });
    s = act(s, { kind: 'players', players: ['p2'] });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(s.discardPile).toContain(myCard);
    expect(s.discardPile).toContain(theirCard);
  });

  it('驱虎拼点输:目标对你造成 1 点伤害;节命可令角色补牌至体力上限', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'xunyu');
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 3;
    P(s, 'p1').hp = 4;
    P(s, 'p1').maxHp = 4;
    const mine = give(s, 'p0', 'shan');
    const theirs = give(s, 'p1', 'sha');
    s.cards[mine].rank = 2;
    s.cards[theirs].rank = 13;
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'quhu', targets: ['p1'] });
    s = act(s, { kind: 'cards', cardIds: [mine] });
    s = act(s, { kind: 'cards', cardIds: [theirs] });
    // 输:p1 对 p0 造成 1 点伤害 → 触发节命
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-player', reason: { kind: 'jieming' } });
    s = act(s, { kind: 'players', players: ['p0'] });
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    expect(P(s, 'p0').hand).toHaveLength(P(s, 'p0').maxHp); // 手牌补至体力上限
  });
});

describe('庞统·连环/涅槃', () => {
  it('连环:梅花手牌当铁索连环横置两人,也可重铸', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'pangtong');
    rigPlay(s, 'p0');
    const club = give(s, 'p0', 'sha', { suit: 'club' });
    s = act(s, { kind: 'use-skill', skill: 'lianhuan', cardIds: [club], targets: ['p1', 'p2'] });
    expect(P(s, 'p1').chained).toBe(true);
    expect(P(s, 'p2').chained).toBe(true);
    // 重铸
    const club2 = give(s, 'p0', 'sha', { suit: 'club' });
    const before = P(s, 'p0').hand.length;
    s = act(s, { kind: 'use-skill', skill: 'lianhuan', cardIds: [club2], targets: [] });
    expect(P(s, 'p0').hand.length).toBe(before); // 弃一摸一
    // 红桃不行
    const heart = give(s, 'p0', 'tao', { suit: 'heart' });
    expect(actErr(s, { kind: 'use-skill', skill: 'lianhuan', cardIds: [heart], targets: [] })).toContain('梅花');
  });

  it('涅槃:限定技,濒死时弃全部牌复原并回到 3 点体力', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p1', 'pangtong');
    rigPlay(s, 'p0');
    P(s, 'p1').hp = 1;
    P(s, 'p1').chained = true;
    give(s, 'p1', 'tao'); // 手里有牌,验证会被弃掉
    equip(s, 'p1', 'renwang');
    const sha = give(s, 'p0', 'sha', { suit: 'heart' }); // 红杀不吃仁王盾
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'niepan' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p1').hp).toBe(3);
    expect(P(s, 'p1').hand).toHaveLength(3); // 弃光后摸三张
    expect(P(s, 'p1').equips.armor).toBeUndefined();
    expect(P(s, 'p1').chained).toBe(false);
    expect(P(s, 'p1').usedLimit).toContain('niepan');
    // 再次濒死:限定技不再询问,无人救则死亡
    rigPlay(s, 'p0');
    P(s, 'p1').hp = 1;
    P(s, 'p1').hand = [];
    const sha2 = give(s, 'p0', 'sha', { suit: 'diamond' });
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(false);
  });
});

describe('诸葛亮·卧龙', () => {
  it('八阵:没有防具时视为装备八卦阵', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'wolong');
    rigPlay(s, 'p0');
    rigDrawTop(s, { red: true });
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'bagua' });
    s = act(s, { kind: 'option', index: 0 }); // 判定红色 → 视为闪
    expect(P(s, 'p1').hp).toBe(hp1);
  });

  it('看破:黑色手牌当无懈可击;火计:红色手牌当火攻', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'wolong');
    rigPlay(s, 'p0');
    // p0 对 p1 用过拆,p2(卧龙)用黑牌看破抵消
    const gh = give(s, 'p0', 'guohe');
    give(s, 'p1', 'tao');
    const black = give(s, 'p2', 'sha', { suit: 'spade' });
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'respond-card', pattern: 'wuxie' });
    s = act(s, { kind: 'card', cardId: black, skill: 'kanpo' });
    expect(P(s, 'p1').hand).toHaveLength(1); // 过拆被无懈
    // 火计:p2 的回合用红牌当火攻
    rigPlay(s, 'p2');
    const red = give(s, 'p2', 'shan', { suit: 'heart' });
    const shown = give(s, 'p0', 'sha', { suit: 'spade' });
    const match = give(s, 'p2', 'sha', { suit: 'spade' });
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'huoji', cardIds: [red], targets: ['p0'] });
    s = act(s, { kind: 'decline' });                  // p2 有黑牌,自己也会被问无懈(看破)
    s = act(s, { kind: 'cards', cardIds: [shown] });  // p0 展示
    s = act(s, { kind: 'cards', cardIds: [match] });  // p2 弃同花色
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
  });
});

describe('太史慈·天义', () => {
  it('拼点赢:本回合杀无距离限制且可多使用一张;输:不能使用杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'taishici');
    rigPlay(s, 'p0');
    const mine = give(s, 'p0', 'shan');
    const theirs = give(s, 'p3', 'shan');
    s.cards[mine].rank = 13;
    s.cards[theirs].rank = 2;
    const sha1 = give(s, 'p0', 'sha');
    const sha2 = give(s, 'p0', 'sha');
    s = act(s, { kind: 'use-skill', skill: 'tianyi', targets: ['p3'] });
    s = act(s, { kind: 'cards', cardIds: [mine] });
    s = act(s, { kind: 'cards', cardIds: [theirs] });
    // 赢了:杀 p2(距离 2,平时够不到)
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: sha1, targets: ['p2'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    // 第二张杀也可以用
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBeLessThan(P(s, 'p1').maxHp);
    // 输的情形
    let s2 = newGame(7);
    clearHands(s2);
    setGeneral(s2, 'p0', 'taishici');
    rigPlay(s2, 'p0');
    const m2 = give(s2, 'p0', 'shan');
    const t2 = give(s2, 'p1', 'shan');
    s2.cards[m2].rank = 2;
    s2.cards[t2].rank = 13;
    const sha3 = give(s2, 'p0', 'sha');
    s2 = act(s2, { kind: 'use-skill', skill: 'tianyi', targets: ['p1'] });
    s2 = act(s2, { kind: 'cards', cardIds: [m2] });
    s2 = act(s2, { kind: 'cards', cardIds: [t2] });
    expect(actErr(s2, { kind: 'play-card', cardId: sha3, targets: ['p1'] })).toContain('不能使用杀');
  });
});

describe('庞德·猛进', () => {
  it('杀被闪抵消后可弃置目标一张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'pangde');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan = give(s, 'p1', 'shan');
    const tao = give(s, 'p1', 'tao');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: shan });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'mengjin' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'pick-card', reason: 'mengjin' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(s.discardPile).toContain(tao); // p1 仅剩的手牌被弃
    expect(P(s, 'p1').hand).toHaveLength(0);
  });
});

describe('颜良文丑·双雄', () => {
  it('摸牌阶段改为判定并获得判定牌,本回合异色手牌可当决斗', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'yanliangwenchou');
    rigPlay(s, 'p0');
    const top = rigDrawTop(s, { suit: 'heart' }); // 判定牌:红色
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'shuangxiong' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toContain(top); // 获得判定牌
    // 用黑色手牌当决斗
    const black = give(s, 'p1', 'sha', { suit: 'spade' });
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'shuangxiong', cardIds: [black], targets: ['p0'] });
    s = act(s, { kind: 'decline' }); // p0 不出杀
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    // 红色(与判定牌同色)不行
    const red = give(s, 'p1', 'shan', { suit: 'diamond' });
    expect(actErr(s, { kind: 'use-skill', skill: 'shuangxiong', cardIds: [red], targets: ['p0'] })).toContain('颜色');
  });
});

describe('袁绍·乱击/血裔', () => {
  it('乱击:两张同花色手牌当万箭齐发', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'yuanshao');
    rigPlay(s, 'p0');
    const a = give(s, 'p0', 'sha', { suit: 'spade' });
    const b = give(s, 'p0', 'guohe', { suit: 'spade' });
    const c = give(s, 'p0', 'tao', { suit: 'heart' });
    expect(actErr(s, { kind: 'use-skill', skill: 'luanji', cardIds: [a, c] })).toContain('相同花色');
    const hps = ['p1', 'p2', 'p3'].map((pid) => P(s, pid).hp);
    s = act(s, { kind: 'use-skill', skill: 'luanji', cardIds: [a, b] });
    s = act(s, { kind: 'decline' }); // p1 不闪
    s = act(s, { kind: 'decline' }); // p2
    s = act(s, { kind: 'decline' }); // p3
    ['p1', 'p2', 'p3'].forEach((pid, i) => expect(P(s, pid).hp).toBe(hps[i] - 1));
    expect(s.discardPile).toContain(a);
    expect(s.discardPile).toContain(b);
  });

  it('血裔:主公袁绍手牌上限按其他群势力角色数增加', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p0', 'yuanshao');
    setGeneral(s, 'p1', 'zhangjiao'); // 群
    setGeneral(s, 'p2', 'yuji');      // 群 → 上限 = 体力 + 4
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 2;
    for (let i = 0; i < 6; i++) give(s, 'p0', 'shan');
    s = act(s, { kind: 'end-phase' });
    // 上限 2+4=6,恰好不用弃牌,直接轮到下一位
    expect(P(s, 'p0').hand).toHaveLength(6);
    expect(s.turn.activePlayer).not.toBe('p0');
  });
});
