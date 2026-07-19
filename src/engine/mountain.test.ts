// 山包:邓艾/张郃/姜维/刘禅/孙策/张昭张纮/左慈/蔡文姬

import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { GENERALS } from './generals';
import {
  P, act, actErr, clearHands, equip, give, newGame, rigDrawTop, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('邓艾·屯田/凿险/急袭', () => {
  it('屯田:回合外失去牌后判定,非红桃置为田', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'dengai');
    rigPlay(s, 'p0');
    const gh = give(s, 'p0', 'guohe');
    give(s, 'p1', 'sha');
    const judgeCard = rigDrawTop(s, { suit: 'spade' });
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'tuntian' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').tian).toEqual([judgeCard]);
  });

  it('凿险:准备阶段田≥3时觉醒,减体力上限获得急袭;急袭把田当顺手牵羊', () => {
    let s = newGame();
    setGeneral(s, 'p1', 'dengai');
    P(s, 'p0').hp = 4;
    P(s, 'p0').maxHp = 4;
    P(s, 'p1').hp = 4;
    P(s, 'p1').maxHp = 4;
    P(s, 'p1').tian = s.drawPile.splice(0, 3);
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    // p1 回合开始:凿险自动觉醒
    expect(P(s, 'p1').maxHp).toBe(3);
    expect(P(s, 'p1').usedLimit).toContain('zaoxian');
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    const tianCard = P(s, 'p1').tian![0];
    const hand0 = P(s, 'p0').hand.length;
    const hand1 = P(s, 'p1').hand.length;
    s = act(s, { kind: 'use-skill', skill: 'jixi', cardIds: [tianCard], targets: ['p0'] });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p0').hand).toHaveLength(hand0 - 1);
    expect(P(s, 'p1').hand).toHaveLength(hand1 + 1);
    expect(P(s, 'p1').tian).toHaveLength(2);
  });
});

describe('张郃·巧变', () => {
  it('摸牌阶段:弃一张手牌,改为获得至多两名角色各一张手牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhanghe');
    give(s, 'p1', 'sha');
    give(s, 'p1', 'shan');
    const c3 = give(s, 'p1', 'tao');
    give(s, 'p0', 'sha');
    give(s, 'p2', 'guohe');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    // 判定阶段的巧变询问:放弃
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'qiaobian' } });
    s = act(s, { kind: 'decline' });
    // 摸牌阶段的巧变:发动
    s = act(s, { kind: 'cards', cardIds: [c3] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-player' });
    s = act(s, { kind: 'players', players: ['p0', 'p2'] });
    expect(P(s, 'p1').hand).toHaveLength(4); // 3 - 弃1 + 偷2
    expect(P(s, 'p0').hand).toHaveLength(0);
    expect(P(s, 'p2').hand).toHaveLength(0);
    // 出牌阶段还会再询问一次巧变:放弃后进入正常出牌
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
  });

  it('出牌阶段:弃一张手牌,改为移动场上一张装备牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhanghe');
    P(s, 'p1').hp = 4;
    P(s, 'p1').maxHp = 4;
    give(s, 'p1', 'sha');
    give(s, 'p1', 'shan');
    const bagua = equip(s, 'p0', 'baguazhen');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    s = act(s, { kind: 'decline' }); // 判定阶段不发动
    s = act(s, { kind: 'decline' }); // 摸牌阶段不发动(正常摸2)
    // 出牌阶段:发动
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'qiaobian' } });
    s = act(s, { kind: 'cards', cardIds: [P(s, 'p1').hand[0]] });
    s = act(s, { kind: 'players', players: ['p0'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'pick-card', target: 'p0' });
    s = act(s, { kind: 'pick', zone: 'equip', cardId: bagua });
    s = act(s, { kind: 'players', players: ['p2'] });
    expect(P(s, 'p2').equips.armor).toBe(bagua);
    expect(P(s, 'p0').equips.armor).toBeUndefined();
  });
});

describe('姜维·挑衅/志继', () => {
  it('挑衅:目标不出杀则被弃置一张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiangwei');
    rigPlay(s, 'p0');
    give(s, 'p1', 'sha');
    s = act(s, { kind: 'use-skill', skill: 'tiaoxin', targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'sha' });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'pick-card', target: 'p1' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p1').hand).toHaveLength(0);
    // 每回合一次
    expect(actErr(s, { kind: 'use-skill', skill: 'tiaoxin', targets: ['p1'] })).toContain('一次');
  });

  it('挑衅:目标对姜维使用杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiangwei');
    rigPlay(s, 'p0');
    const sha = give(s, 'p1', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'tiaoxin', targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: sha });
    s = act(s, { kind: 'decline' }); // 姜维不出闪
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
  });

  it('志继:准备阶段无手牌时觉醒,回复或摸牌并获得观星', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiangwei');
    P(s, 'p1').hp = 2;
    P(s, 'p1').maxHp = 4;
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'zhiji' });
    s = act(s, { kind: 'option', index: 0 }); // 回复1点
    expect(P(s, 'p1').maxHp).toBe(3);
    expect(P(s, 'p1').hp).toBe(3);
    expect(P(s, 'p1').usedLimit).toContain('zhiji');
    // 觉醒后获得观星:下一轮 p1 回合开始会询问观星(此回合已过准备阶段)
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
  });
});

describe('刘禅·享乐/放权', () => {
  it('享乐:使用者弃基本牌则杀继续,否则杀无效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p3', 'liushan');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const tao = give(s, 'p0', 'tao');
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p3'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', reason: { kind: 'xiangle' } });
    s = act(s, { kind: 'cards', cardIds: [tao] });
    s = act(s, { kind: 'decline' }); // 刘禅不出闪
    expect(P(s, 'p3').hp).toBe(hp3 - 1);
    // 第二张杀:不弃基本牌 → 无效
    rigPlay(s, 'p0');
    const sha2 = give(s, 'p0', 'sha');
    give(s, 'p0', 'shan');
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p3'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p3').hp).toBe(hp3 - 1); // 没有再掉血
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('放权:跳过出牌阶段,结束阶段弃一张手牌令他人获得额外回合', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'liushan');
    P(s, 'p0').hp = 4;
    P(s, 'p0').maxHp = 4;
    rigPlay(s, 'p3');
    s = act(s, { kind: 'end-phase' });
    // p0 回合:出牌阶段前询问放权
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'fangquan' });
    s = act(s, { kind: 'option', index: 0 });
    // 结束阶段:弃一张手牌并指定 p2
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', reason: { kind: 'fangquan' } });
    s = act(s, { kind: 'cards', cardIds: [P(s, 'p0').hand[0]] });
    s = act(s, { kind: 'players', players: ['p2'] });
    // p2 获得额外回合
    expect(s.turn.activePlayer).toBe('p2');
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'play' });
    s = act(s, { kind: 'end-phase' });
    // 额外回合结束后从刘禅的下家继续
    expect(s.turn.activePlayer).toBe('p1');
  });
});

describe('孙策·激昂/魂姿', () => {
  it('激昂:使用红杀摸一张;成为红杀目标也摸一张;决斗双方摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'sunce');
    setGeneral(s, 'p1', 'sunce');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha', { suit: 'heart' });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(P(s, 'p0').hand).toHaveLength(1); // 打出1张,激昂摸1
    expect(P(s, 'p1').hand).toHaveLength(1); // 被指定,激昂摸1
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    // 决斗:双方各摸一张
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'juedou');
    const h0 = P(s, 'p0').hand.length;
    const h1 = P(s, 'p1').hand.length;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1'] });
    expect(P(s, 'p0').hand).toHaveLength(h0); // 打出1张 + 激昂摸1
    expect(P(s, 'p1').hand).toHaveLength(h1 + 1);
  });

  it('魂姿:准备阶段体力为1时觉醒,获得英姿与英魂', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'sunce');
    P(s, 'p1').hp = 1;
    P(s, 'p1').maxHp = 4;
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(P(s, 'p1').maxHp).toBe(3);
    expect(P(s, 'p1').usedLimit).toContain('hunzi');
    // 英魂(受伤状态)会在准备阶段询问:放弃
    if (s.pendingRequest?.type === 'choose-player') s = act(s, { kind: 'decline' });
    // 英姿:摸牌阶段摸3张
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    expect(P(s, 'p1').hand).toHaveLength(3);
  });
});

describe('张昭张纮·直谏/固政', () => {
  it('直谏:将手牌中的装备置入他人装备区并摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'zhangzhaozhanghong');
    rigPlay(s, 'p0');
    const bagua = give(s, 'p0', 'baguazhen');
    s = act(s, { kind: 'use-skill', skill: 'zhijian', cardIds: [bagua], targets: ['p1'] });
    expect(P(s, 'p1').equips.armor).toBe(bagua);
    expect(P(s, 'p0').hand).toHaveLength(1); // 摸了一张
  });

  it('固政:他人弃牌阶段结束,返还一张并获得其余', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhangzhaozhanghong');
    P(s, 'p0').hp = 2;
    const a = give(s, 'p0', 'sha');
    const b = give(s, 'p0', 'shan');
    give(s, 'p0', 'tao');
    give(s, 'p0', 'guohe');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    // 弃牌阶段:弃 a、b
    s = act(s, { kind: 'cards', cardIds: [a, b] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'guzheng' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'cards', cardIds: [a] }); // 返还 a
    expect(P(s, 'p0').hand).toContain(a);
    expect(P(s, 'p0').hand).toHaveLength(3);
    // 固政结算后流程走进 p1 自己的回合(摸了2张),b 已入手
    expect(P(s, 'p1').hand).toContain(b);
  });
});

describe('左慈·化身/新生', () => {
  it('开局获得两张化身牌', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = createGame({ seed }).state;
      const zuoci = s.players.find((p) => p.general === 'zuoci');
      if (!zuoci) continue;
      expect(zuoci.huashen).toHaveLength(2);
      for (const g of zuoci.huashen!) {
        expect(GENERALS[g].faction).not.toBe('god');
        expect(s.players.some((p) => p.general === g)).toBe(false);
      }
      return;
    }
    throw new Error('300 个种子内未出现左慈');
  });

  it('化身:准备阶段声明化身牌上的技能并获得之', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zuoci');
    P(s, 'p1').huashen = ['daqiao'];
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'huashen' });
    const req = s.pendingRequest as Extract<typeof s.pendingRequest, { type: 'choose-option' }>;
    expect(req!.options).toEqual(['guose', 'liuli']);
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').huashenSkill).toBe('guose');
  });

  it('新生:受到伤害后获得一张化身牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zuoci');
    P(s, 'p1').huashen = ['daqiao'];
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').huashen).toHaveLength(2);
  });
});

describe('蔡文姬·悲歌/断肠', () => {
  it('悲歌:判定梅花则伤害来源弃两张牌;方块则受害者摸两张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'caiwenji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p0', 'shan');
    give(s, 'p0', 'tao');
    const bg = give(s, 'p2', 'guohe');
    rigDrawTop(s, { suit: 'club' });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // p1 不出闪
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-cards', reason: { kind: 'beige' } });
    s = act(s, { kind: 'cards', cardIds: [bg] });
    expect(P(s, 'p0').hand).toHaveLength(0); // 梅花:来源弃两张
    expect(P(s, 'p2').hand).toHaveLength(0);
  });

  it('悲歌:判定方块则受害者摸两张;黑桃则来源翻面', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'caiwenji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const bg = give(s, 'p2', 'guohe');
    rigDrawTop(s, { suit: 'diamond' });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'cards', cardIds: [bg] });
    expect(P(s, 'p1').hand).toHaveLength(2); // 方块:受害者摸两张
  });

  it('断肠:杀死蔡文姬的角色失去所有武将技能', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'spy', p2: 'loyalist', p3: 'rebel' });
    setGeneral(s, 'p1', 'caiwenji');
    P(s, 'p1').hp = 1;
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(false);
    expect(P(s, 'p0').skillsLost).toBe(true);
    // p0(甘宁)不能再发动奇袭
    const black = give(s, 'p0', 'guohe', { red: false });
    expect(actErr(s, { kind: 'use-skill', skill: 'qixi', cardIds: [black], targets: ['p1'] }))
      .toContain('奇袭');
  });
});
