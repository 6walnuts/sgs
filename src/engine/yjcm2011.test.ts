// 一将成名 2011:落英/酒诗/绝情/伤逝/毅重/恩怨/眩惑/心战/挥泪/无言/举荐/旋风/破军/甘露/补益/明策/智迟/陷阵/禁酒

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, equip, give, newGame, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('曹植·落英/酒诗', () => {
  it('落英:他人弃置的梅花牌归曹植;酒诗:翻面视为使用酒', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'caozhi');
    rigPlay(s, 'p0');
    // p0 对 p1 过拆,弃掉 p1 的梅花牌 → 曹植获得
    const club = give(s, 'p1', 'sha', { suit: 'club' });
    const gh = give(s, 'p0', 'guohe');
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p2').hand).toContain(club);
    // 酒诗:曹植回合翻面出酒,杀伤 +1
    rigPlay(s, 'p2');
    const sha = give(s, 'p2', 'sha');
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'use-skill', skill: 'jiushi' });
    expect(P(s, 'p2').flipped).toBe(true);
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p3'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p3').hp).toBe(hp3 - 2);
    // 背面时受到伤害 → 结算后自动翻回(p1 与 p2 距离 1)
    rigPlay(s, 'p1');
    const sha2 = give(s, 'p1', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p2'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').flipped).toBe(false);
  });
});

describe('张春华·绝情/伤逝', () => {
  it('绝情:造成的伤害视为体力流失(不触发奸雄);伤逝:手牌少于已损失体力自动补', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'zhangchunhua');
    setGeneral(s, 'p1', 'caocao');
    rigPlay(s, 'p0');
    P(s, 'p0').maxHp = 3;
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    // 体力流失:曹操的奸雄不会被询问,直接回到 p0 出牌
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
    // 伤逝:p0 受伤后手牌 0 < 已损失体力 → 自动摸
    rigPlay(s, 'p1');
    const sha2 = give(s, 'p1', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p0'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').hand.length).toBe(P(s, 'p0').maxHp - P(s, 'p0').hp);
  });
});

describe('于禁·毅重', () => {
  it('没有防具时黑色杀无效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'yujin');
    rigPlay(s, 'p0');
    const black = give(s, 'p0', 'sha', { suit: 'spade' });
    const red = give(s, 'p0', 'sha', { suit: 'heart' });
    equip(s, 'p0', 'zhugeliannu');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: black, targets: ['p1'] });
    expect(P(s, 'p1').hp).toBe(hp1); // 黑杀无效,不询问闪
    s = act(s, { kind: 'play-card', cardId: red, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 红杀正常
  });
});

describe('法正·恩怨/眩惑', () => {
  it('恩怨:伤害来源须交红桃否则失去体力;回复来源摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'fazheng');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const heart = give(s, 'p0', 'tao', { suit: 'heart' });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', reason: { kind: 'enyuan' } });
    s = act(s, { kind: 'cards', cardIds: [heart] });
    expect(P(s, 'p1').hand).toContain(heart);
    // 拒交:失去 1 点体力
    rigPlay(s, 'p0');
    const sha2 = give(s, 'p0', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'decline' }); // 不交红桃
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
  });

  it('眩惑:交红桃给一人,拿其一张牌转交第三者', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'fazheng');
    rigPlay(s, 'p0');
    const heart = give(s, 'p0', 'sha', { suit: 'heart' });
    const theirs = give(s, 'p1', 'tao');
    s = act(s, { kind: 'use-skill', skill: 'xuanhuo', cardIds: [heart], targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'pick-card', reason: 'xuanhuo' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-player', reason: { kind: 'xuanhuo' } });
    s = act(s, { kind: 'players', players: ['p2'] });
    // p1 得到红桃,失去一张;p2 得到转交的牌
    expect(P(s, 'p1').hand).toEqual([heart]);
    expect(P(s, 'p2').hand.length + P(s, 'p0').hand.length).toBe(1); // theirs 去了 p2
    expect(P(s, 'p2').hand).toContain(theirs);
  });
});

describe('马谡·心战/挥泪', () => {
  it('心战:观看牌堆顶三张获得红桃;挥泪:凶手弃置所有牌', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'rebel', p1: 'lord', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p0', 'masu');
    rigPlay(s, 'p0');
    P(s, 'p0').maxHp = 3;
    for (let i = 0; i < 4; i++) give(s, 'p0', 'shan'); // 手牌 4 > 上限 3
    const top3 = s.drawPile.slice(0, 3);
    const hearts = top3.filter((id) => s.cards[id].suit === 'heart');
    s = act(s, { kind: 'use-skill', skill: 'xinzhan' });
    for (const id of hearts) expect(P(s, 'p0').hand).toContain(id);
    expect(actErr(s, { kind: 'use-skill', skill: 'xinzhan' })).toContain('限一次');
    // 挥泪:p1 杀死马谡(降为 1 血)后弃置所有牌
    rigPlay(s, 'p1');
    P(s, 'p0').hp = 1;
    P(s, 'p0').hand = [];
    const sha = give(s, 'p1', 'sha');
    give(s, 'p1', 'tao');
    equip(s, 'p1', 'zhugeliannu');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p0'] });
    s = act(s, { kind: 'decline' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').alive).toBe(false);
    // 挥泪先弃光,随后杀反贼的奖励摸 3 张
    expect(P(s, 'p1').hand).toHaveLength(3);
    expect(P(s, 'p1').equips.weapon).toBeUndefined();
  });
});

describe('徐庶·无言/举荐', () => {
  it('无言:不能使用锦囊也不能被锦囊指定;举荐:弃三张同类回复体力', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'xushu');
    rigPlay(s, 'p0');
    const gh = give(s, 'p0', 'guohe');
    give(s, 'p1', 'tao');
    expect(actErr(s, { kind: 'play-card', cardId: gh, targets: ['p1'] })).toContain('无言');
    // 徐庶自己也不能用锦囊
    rigPlay(s, 'p1');
    const wz = give(s, 'p1', 'wuzhong');
    expect(actErr(s, { kind: 'play-card', cardId: wz, targets: [] })).toContain('无言');
    // 举荐:弃三张基本牌回复 1
    P(s, 'p1').hp = 2;
    const a = give(s, 'p1', 'sha');
    const b = give(s, 'p1', 'sha');
    const c = give(s, 'p1', 'shan');
    const before2 = P(s, 'p2').hand.length;
    s = act(s, { kind: 'use-skill', skill: 'jujian', cardIds: [a, b, c], targets: ['p2'] });
    expect(P(s, 'p2').hand.length).toBe(before2 + 3);
    expect(P(s, 'p1').hp).toBe(3);
  });
});

describe('凌统·旋风', () => {
  it('失去装备后可视为出杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'lingtong');
    rigPlay(s, 'p0');
    equip(s, 'p1', 'jiama');
    const gh = give(s, 'p0', 'guohe');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    const horse = P(s, 'p1').equips.horsePlus!;
    s = act(s, { kind: 'pick', zone: 'equip', cardId: horse });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'xuanfeng' });
    s = act(s, { kind: 'option', index: 0 }); // 视为出杀
    s = act(s, { kind: 'players', players: ['p0'] });
    s = act(s, { kind: 'decline' }); // p0 不闪
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
  });
});

describe('徐盛·破军 与 吴国太·甘露/补益', () => {
  it('破军:杀命中后令目标摸体力值张牌并翻面', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'xusheng');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'pojun' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand.length).toBe(Math.min(P(s, 'p1').hp, 5));
    expect(P(s, 'p1').flipped).toBe(true);
  });

  it('甘露:交换两人装备;补益:濒死展示非基本牌回复', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'wuguotai');
    rigPlay(s, 'p0');
    equip(s, 'p1', 'zhugeliannu');
    equip(s, 'p2', 'baguazhen');
    const w = P(s, 'p1').equips.weapon!;
    const a = P(s, 'p2').equips.armor!;
    s = act(s, { kind: 'use-skill', skill: 'ganlu', targets: ['p1', 'p2'] });
    expect(P(s, 'p2').equips.weapon).toBe(w);
    expect(P(s, 'p1').equips.armor).toBe(a);
    // 补益:p1 濒死,手里只有锦囊 → 展示后弃置回复 1
    rigPlay(s, 'p2');
    // 卸掉刚换来的八卦阵,避免闪避判定干扰
    s.discardPile.push(P(s, 'p1').equips.armor!);
    delete P(s, 'p1').equips.armor;
    P(s, 'p1').hp = 1;
    P(s, 'p1').hand = [];
    const trick = give(s, 'p1', 'wuzhong');
    const sha = give(s, 'p2', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    // p1 手里的无中生有不是闪,直接不闪
    while (s.pendingRequest?.type === 'respond-card' && s.pendingRequest.player === 'p1'
           && s.pendingRequest.pattern === 'shan') {
      s = act(s, { kind: 'decline' });
    }
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'buyi' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hp).toBe(1); // 掉到 0 后补益回 1
    expect(P(s, 'p1').alive).toBe(true);
    expect(s.discardPile).toContain(trick);
  });
});

describe('陈宫·明策/智迟 与 高顺·陷阵/禁酒', () => {
  it('明策:受赠者视为对指定角色出杀或摸牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'chengong');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'use-skill', skill: 'mingce', cardIds: [sha], targets: ['p1', 'p2'] });
    expect(P(s, 'p1').hand).toContain(sha);
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'mingce' });
    s = act(s, { kind: 'option', index: 0 }); // 视为出杀
    s = act(s, { kind: 'decline' }); // p2 不闪
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
  });

  it('智迟:回合外受伤后,本回合杀与锦囊对陈宫无效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'chengong');
    rigPlay(s, 'p0');
    equip(s, 'p0', 'zhugeliannu');
    const sha1 = give(s, 'p0', 'sha');
    const sha2 = give(s, 'p0', 'sha');
    const gh = give(s, 'p0', 'guohe');
    give(s, 'p1', 'tao');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha1, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 第一刀命中并激活智迟
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 第二刀无效
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    expect(P(s, 'p1').hand).toHaveLength(1); // 过拆也无效
  });

  it('陷阵:拼点赢则无视防具不限次数;禁酒:酒当杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'gaoshun');
    rigPlay(s, 'p0');
    equip(s, 'p1', 'renwang'); // 仁王盾挡黑杀,陷阵无视
    const mine = give(s, 'p0', 'shan');
    const theirs = give(s, 'p1', 'shan');
    s.cards[mine].rank = 13;
    s.cards[theirs].rank = 2;
    const black1 = give(s, 'p0', 'sha', { suit: 'spade' });
    const black2 = give(s, 'p0', 'sha', { suit: 'club' });
    const jiu = give(s, 'p0', 'jiu', { suit: 'spade' });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'xianzhen', targets: ['p1'] });
    s = act(s, { kind: 'cards', cardIds: [mine] });
    s = act(s, { kind: 'cards', cardIds: [theirs] });
    s = act(s, { kind: 'play-card', cardId: black1, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 仁王盾被无视
    s = act(s, { kind: 'play-card', cardId: black2, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 2); // 不限次数
    // 禁酒:酒也是杀
    s = act(s, { kind: 'play-card', cardId: jiu, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 3);
  });
});
