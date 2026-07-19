// 风包八将:神速/据守/烈弓/狂骨/天香/红颜/不屈/雷击/鬼道/蛊惑

import { describe, expect, it } from 'vitest';
import {
  P, act, clearHands, equip, give, newGame, rigDrawTop, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('夏侯渊·神速', () => {
  it('神速①:跳过判定和摸牌阶段,视为使用一张杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'xiahouyuan');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    // p1 回合判定阶段前询问神速①
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'shensu1' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-player' });
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'players', players: ['p0'] });
    s = act(s, { kind: 'decline' }); // p0 不出闪
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    // 摸牌被跳过:进入出牌阶段时手牌仍为 0
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    expect(P(s, 'p1').hand).toHaveLength(0);
  });

  it('神速②:弃一张装备跳过出牌阶段,视为使用一张杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'xiahouyuan');
    equip(s, 'p1', 'jiama');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    s = act(s, { kind: 'decline' }); // 不发动神速①,正常判定+摸牌
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'shensu2' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'shensu-equip' } });
    const horse = P(s, 'p1').equips.horsePlus!;
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'cards', cardIds: [horse] });
    s = act(s, { kind: 'players', players: ['p0'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    expect(P(s, 'p1').equips.horsePlus).toBeUndefined();
    // 出牌阶段被跳过,直接轮到 p2
    expect(P(s, 'p1').hand).toHaveLength(2); // 摸牌阶段照常
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'play' });
  });
});

describe('曹仁·据守', () => {
  it('结束阶段摸三张并翻面,下回合翻回并被跳过', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'caoren');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' }); // p1 回合
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'jushou' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toHaveLength(5); // 摸牌 2 + 据守 3
    expect(P(s, 'p1').flipped).toBe(true);
    // p2 → p3 → p0 依次过完回合后,p1 翻回但回合被跳过,轮到 p2
    s = act(s, { kind: 'end-phase' }); // p2
    s = act(s, { kind: 'end-phase' }); // p3
    s = act(s, { kind: 'end-phase' }); // p0
    expect(P(s, 'p1').flipped).toBe(false);
    expect(s.turn.activePlayer).toBe('p2');
  });
});

describe('黄忠·烈弓', () => {
  it('目标手牌数不小于自己体力时,可令其不能使用闪', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'huangzhong');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p1', 'shan');
    give(s, 'p1', 'shan');
    give(s, 'p1', 'sha');
    give(s, 'p1', 'tao'); // 4 张 ≥ p0 体力
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'liegong' });
    s = act(s, { kind: 'option', index: 0 });
    // p1 有闪也不能出,直接受到伤害
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });
});

describe('魏延·狂骨', () => {
  it('对距离 1 以内的角色造成伤害后可回复 1 点体力', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'weiyan');
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 2;
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'kuanggu' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p0').hp).toBe(3);
  });
});

describe('小乔·天香/红颜', () => {
  it('天香:弃红桃手牌转移伤害,承受者按已损失体力摸牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'xiaoqiao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const heart = give(s, 'p1', 'shan', { suit: 'heart' });
    const hp1 = P(s, 'p1').hp;
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // 不出闪
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'tianxiang' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'cards', cardIds: [heart] });
    s = act(s, { kind: 'players', players: ['p2'] });
    expect(P(s, 'p1').hp).toBe(hp1);       // 自己不受伤害
    expect(P(s, 'p2').hp).toBe(hp2 - 1);   // 伤害转移
    expect(P(s, 'p2').hand).toHaveLength(1); // 按已损失体力摸 1 张
    expect(s.discardPile).toContain(heart);
  });

  it('红颜:黑桃判定视为红桃(闪电不会命中)', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'xiaoqiao');
    rigPlay(s, 'p0');
    const sd = give(s, 'p1', 'shandian');
    P(s, 'p1').hand = P(s, 'p1').hand.filter((id) => id !== sd);
    P(s, 'p1').judgeZone.push(sd);
    // 牌堆顶放一张本应命中的黑桃 2~9
    const spade = s.drawPile.find((cid) => {
      const c = s.cards[cid];
      return c.suit === 'spade' && c.rank >= 2 && c.rank <= 9;
    })!;
    s.drawPile.splice(s.drawPile.indexOf(spade), 1);
    s.drawPile.unshift(spade);
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'end-phase' });
    expect(P(s, 'p1').hp).toBe(hp1);          // 红颜:黑桃视为红桃,不中
    expect(P(s, 'p2').judgeZone).toContain(sd); // 闪电移到下家判定区
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
  });
});

describe('周泰·不屈', () => {
  it('濒死时翻创牌,点数不重复则存活;重复才死亡', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p1', 'zhoutai');
    rigPlay(s, 'p0');
    P(s, 'p1').hp = 1;
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // 不出闪
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' }); // 无人给桃
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p1').hp).toBeLessThanOrEqual(0);
    expect(P(s, 'p1').buqu).toHaveLength(1);
    // 第二次濒死:牌堆顶放同点数的牌 → 创重复,死亡
    const rank = s.cards[P(s, 'p1').buqu![0]].rank;
    const dup = s.drawPile.find((cid) => s.cards[cid].rank === rank)!;
    s.drawPile.splice(s.drawPile.indexOf(dup), 1);
    s.drawPile.unshift(dup);
    rigPlay(s, 'p0');
    const sha2 = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(false);
  });
});

describe('张角·雷击/鬼道', () => {
  it('雷击:打出闪后可令一名角色判定,黑桃则受 2 点雷电伤害', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhangjiao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan = give(s, 'p1', 'shan');
    rigDrawTop(s, { suit: 'spade' });
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: shan });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'leiji' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'players', players: ['p0'] });
    expect(P(s, 'p0').hp).toBe(hp0 - 2);
  });

  it('鬼道:用黑色牌替换判定牌(可改中乐不思蜀)', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p3', 'zhangjiao');
    rigPlay(s, 'p0');
    const le = give(s, 'p1', 'lebusishu');
    P(s, 'p1').hand = P(s, 'p1').hand.filter((id) => id !== le);
    P(s, 'p1').judgeZone.push(le);
    rigDrawTop(s, { suit: 'heart' }); // 本应不中
    const black = give(s, 'p3', 'sha', { suit: 'spade' });
    s = act(s, { kind: 'end-phase' });
    // p1 判定翻出红桃后,p3 可发动鬼道改判
    expect(s.pendingRequest).toMatchObject({ player: 'p3', type: 'choose-cards', reason: { kind: 'guicai' } });
    s = act(s, { kind: 'cards', cardIds: [black] });
    // 改为黑桃 → 乐不思蜀生效,p1 跳过出牌阶段,轮到 p2
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'play' });
    expect(s.discardPile).toContain(le);
  });
});

describe('于吉·蛊惑', () => {
  it('真牌被质疑:质疑者失去 1 点体力,牌照常生效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'yuji');
    rigPlay(s, 'p0');
    const wz = give(s, 'p0', 'wuzhong');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'guhuo', cardIds: [wz], declare: 'wuzhong', targets: [] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'guhuo-challenge' });
    s = act(s, { kind: 'option', index: 0 }); // p1 质疑
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(P(s, 'p0').hand).toHaveLength(2); // 无中生有生效
    expect(s.discardPile).toContain(wz);
  });

  it('假牌被质疑:弃置且无效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'yuji');
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 2;
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'guhuo', cardIds: [sha], declare: 'tao', targets: [] });
    s = act(s, { kind: 'option', index: 0 }); // p1 质疑
    expect(P(s, 'p0').hp).toBe(2);           // 桃未生效
    expect(P(s, 'p1').hp).toBe(hp1);         // 质疑假牌无代价
    expect(s.discardPile).toContain(sha);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('无人质疑:假牌也按声明结算(杀当桃、桃当杀)', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'yuji');
    rigPlay(s, 'p0');
    P(s, 'p0').hp = 2;
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'use-skill', skill: 'guhuo', cardIds: [sha], declare: 'tao', targets: [] });
    s = act(s, { kind: 'decline' }); // p1
    s = act(s, { kind: 'decline' }); // p2
    s = act(s, { kind: 'decline' }); // p3
    expect(P(s, 'p0').hp).toBe(3); // 杀当桃生效
    // 桃当杀:目标须响应闪
    rigPlay(s, 'p0');
    const tao = give(s, 'p0', 'tao');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'guhuo', cardIds: [tao], declare: 'sha', targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // p1 不质疑
    s = act(s, { kind: 'decline' }); // p2
    s = act(s, { kind: 'decline' }); // p3
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });
});
