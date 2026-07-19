// 林包七将:行殇/放逐/颂威/断粮/祸首/再起/巨象/烈刃/好施/缔盟/酒池/肉林/崩坏/完杀/乱武/帷幕

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, give, newGame, rigDrawTop, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('曹丕·行殇/放逐/颂威', () => {
  it('行殇:其他角色死亡时获得其手牌与装备;放逐:受伤后令他人翻面摸牌', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p2', 'caopi');
    rigPlay(s, 'p0');
    // 杀死 p1(1 血,手里有牌)→ 曹丕行殇拿走
    P(s, 'p1').hp = 1;
    const loot = give(s, 'p1', 'tao');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(false);
    expect(P(s, 'p2').hand).toContain(loot);
    // 放逐:p0 杀曹丕(受伤)→ 放逐 p3 翻面并摸 1(已损失1点)
    rigPlay(s, 'p0');
    const sha2 = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p2'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'fangzhu' });
    s = act(s, { kind: 'option', index: 0 });
    const hand3 = P(s, 'p3').hand.length;
    s = act(s, { kind: 'players', players: ['p3'] });
    expect(P(s, 'p3').flipped).toBe(true);
    expect(P(s, 'p3').hand.length).toBe(hand3 + 1);
  });

  it('颂威:其他魏势力角色的黑色判定牌生效后,主公曹丕摸一张', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p0', 'caopi');
    setGeneral(s, 'p1', 'zhangliao'); // 魏
    rigPlay(s, 'p0');
    const le = give(s, 'p1', 'lebusishu');
    P(s, 'p1').hand = P(s, 'p1').hand.filter((id) => id !== le);
    P(s, 'p1').judgeZone.push(le);
    rigDrawTop(s, { suit: 'spade' }); // 黑色判定
    const hand0 = P(s, 'p0').hand.length;
    s = act(s, { kind: 'end-phase' });
    expect(P(s, 'p0').hand.length).toBe(hand0 + 1); // 颂威摸一张
  });
});

describe('徐晃·断粮', () => {
  it('黑色基本牌当兵粮寸断,可指定距离 2 的角色', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'xuhuang');
    rigPlay(s, 'p0');
    const black = give(s, 'p0', 'sha', { suit: 'spade' });
    s = act(s, { kind: 'use-skill', skill: 'duanliang', cardIds: [black], targets: ['p2'] });
    expect(P(s, 'p2').judgeZone).toContain(black); // 距离 2 也能放
    // 红色牌不行
    const red = give(s, 'p0', 'sha', { suit: 'heart' });
    expect(actErr(s, { kind: 'use-skill', skill: 'duanliang', cardIds: [red], targets: ['p1'] })).toContain('黑色');
  });
});

describe('孟获·祸首/再起', () => {
  it('祸首:南蛮对孟获无效,且孟获代替使用者成为伤害来源', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'menghuo');
    rigPlay(s, 'p0');
    const nm = give(s, 'p0', 'nanman');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: nm, targets: [] });
    s = act(s, { kind: 'decline' }); // p1 不出杀
    s = act(s, { kind: 'decline' }); // p3(p2 被跳过)
    expect(P(s, 'p2').hp).toBe(hp2); // 免疫
    // 伤害来源是孟获
    const dmg = s.eventLog.filter((e) => e.type === 'damage').slice(-2);
    for (const d of dmg) {
      if (d.type === 'damage') expect(d.source).toBe('p2');
    }
  });

  it('再起:摸牌阶段亮出已损失体力数的牌,红桃回血其余入手', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'menghuo');
    rigPlay(s, 'p0');
    P(s, 'p1').maxHp = 4;
    P(s, 'p1').hp = 2; // 损失 2
    // 牌堆顶:一张红桃 + 一张黑桃
    const spade = s.drawPile.find((id) => s.cards[id].suit === 'spade')!;
    s.drawPile.splice(s.drawPile.indexOf(spade), 1);
    s.drawPile.unshift(spade);
    const heart = s.drawPile.find((id) => s.cards[id].suit === 'heart')!;
    s.drawPile.splice(s.drawPile.indexOf(heart), 1);
    s.drawPile.unshift(heart); // 顶:heart, spade
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'zaiqi' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hp).toBe(3);            // 红桃回 1
    expect(P(s, 'p1').hand).toContain(spade); // 黑桃入手
    expect(s.discardPile).toContain(heart);
  });
});

describe('祝融·巨象/烈刃', () => {
  it('巨象:南蛮对祝融无效且结算后归祝融;烈刃:杀命中后拼点赢获得目标一张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'zhurong');
    rigPlay(s, 'p0');
    const nm = give(s, 'p0', 'nanman');
    s = act(s, { kind: 'play-card', cardId: nm, targets: [] });
    s = act(s, { kind: 'decline' }); // p1
    s = act(s, { kind: 'decline' }); // p3
    expect(P(s, 'p2').hand).toContain(nm); // 巨象收走南蛮
    // 烈刃
    rigPlay(s, 'p2');
    const sha = give(s, 'p2', 'sha');
    const mine = give(s, 'p2', 'shan');
    const theirs = give(s, 'p3', 'shan');
    s.cards[mine].rank = 13;
    s.cards[theirs].rank = 2;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p3'] });
    s = act(s, { kind: 'decline' }); // p3 不闪(手里的闪拿来拼点)
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'lieren' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'cards', cardIds: [mine] });   // 祝融拼点牌
    s = act(s, { kind: 'cards', cardIds: [theirs] }); // p3 拼点牌
    // 赢:选择获得 p3 的牌(此时 p3 无手牌无装备?nanman 时 p3 手里无牌;拼点后也无 → 检查有无 pick)
    if (s.pendingRequest?.type === 'pick-card') {
      s = act(s, { kind: 'pick', zone: 'hand' });
    }
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'play' });
  });
});

describe('鲁肃·好施/缔盟', () => {
  it('好施:多摸两张,超过 5 张送一半给手牌最少者;缔盟:弃差额交换手牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'lusu');
    rigPlay(s, 'p0');
    for (let i = 0; i < 4; i++) give(s, 'p1', 'shan'); // 起手 4,摸 4 后 8 张
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'haoshi' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toHaveLength(8);
    // 送出 4 张(8 的一半)
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'haoshi' } });
    const giveOut = P(s, 'p1').hand.slice(0, 4);
    s = act(s, { kind: 'cards', cardIds: giveOut });
    // 所有其他角色手牌均为 0,可能需要选人;送完后进入出牌
    if (s.pendingRequest?.type === 'choose-player') {
      s = act(s, { kind: 'players', players: [s.pendingRequest.candidates[0]] });
    }
    expect(P(s, 'p1').hand).toHaveLength(4);
    // 缔盟:p2 有 2 张,p3 有 0 张 → 弃 2 张让两人交换
    give(s, 'p2', 'tao');
    give(s, 'p2', 'tao');
    const p2Hand = [...P(s, 'p2').hand];
    const d1 = P(s, 'p1').hand[0];
    const d2 = P(s, 'p1').hand[1];
    s = act(s, { kind: 'use-skill', skill: 'dimeng', cardIds: [d1, d2], targets: ['p2', 'p3'] });
    expect(P(s, 'p3').hand).toEqual(expect.arrayContaining(p2Hand));
    expect(P(s, 'p2').hand.every((id) => !p2Hand.includes(id))).toBe(true);
  });
});

describe('董卓·酒池/肉林/崩坏', () => {
  it('酒池:黑桃手牌当酒;肉林:对女性使用杀需两张闪', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'dongzhuo');
    setGeneral(s, 'p1', 'diaochan'); // 女性
    rigPlay(s, 'p0');
    const spade = give(s, 'p0', 'guohe', { suit: 'spade' });
    const sha = give(s, 'p0', 'sha');
    const shan1 = give(s, 'p1', 'shan');
    give(s, 'p1', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'jiuchi', cardIds: [spade] }); // 黑桃当酒
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    // 肉林:需要两张闪;只出一张 → 继续要闪,拒绝则中(酒 +1 伤)
    s = act(s, { kind: 'card', cardId: shan1 });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 2); // 酒杀 2 点
  });

  it('崩坏:结束阶段非最低体力时,选择失去体力或减体力上限', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'dongzhuo');
    P(s, 'p0').maxHp = 8;
    P(s, 'p0').hp = 8;
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'benghuai' });
    s = act(s, { kind: 'option', index: 1 }); // 减上限
    expect(P(s, 'p0').maxHp).toBe(7);
    expect(P(s, 'p0').hp).toBe(7);
  });
});

describe('贾诩·完杀/乱武/帷幕', () => {
  it('完杀:贾诩回合内其他角色不能救濒死者(贾诩与濒死者本人仍可)', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p0', 'jiaxu');
    rigPlay(s, 'p0');
    P(s, 'p1').hp = 1;
    give(s, 'p2', 'tao'); // 其他人的桃救不了
    const myTao = give(s, 'p0', 'tao'); // 贾诩自己的桃可以
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    // 濒死:只询问贾诩(p0)和 p1;p2 被完杀跳过
    expect(s.pendingRequest).toMatchObject({ player: 'p0', pattern: 'tao' });
    s = act(s, { kind: 'card', cardId: myTao });
    expect(P(s, 'p1').alive).toBe(true);
  });

  it('乱武:其他角色对最近者出杀或失去体力;帷幕:黑色锦囊不能指定贾诩', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiaxu');
    rigPlay(s, 'p0');
    const sha1 = give(s, 'p1', 'sha'); // p1 有杀:对最近者(p0 或 p2)使用
    // p2/p3 没杀:失去 1 点体力
    const hp2 = P(s, 'p2').hp;
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'use-skill', skill: 'luanwu' });
    // p1 出杀,最近的有 p0/p2 两个 → 选目标
    s = act(s, { kind: 'card', cardId: sha1 });
    s = act(s, { kind: 'players', players: ['p2'] });
    s = act(s, { kind: 'decline' }); // p2 不闪
    // p2 响应乱武:没杀 → 弃权失去体力;p3 同
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 2); // 杀 1 + 乱武失去 1
    expect(P(s, 'p3').hp).toBe(hp3 - 1);
    expect((P(s, 'p0').usedLimit ?? [])).toContain('luanwu');
    expect(actErr(s, { kind: 'use-skill', skill: 'luanwu' })).toContain('限定技');
    // 帷幕
    rigPlay(s, 'p1');
    const gh = give(s, 'p1', 'guohe', { suit: 'spade' });
    give(s, 'p0', 'tao');
    expect(actErr(s, { kind: 'play-card', cardId: gh, targets: ['p0'] })).toContain('帷幕');
  });
});
