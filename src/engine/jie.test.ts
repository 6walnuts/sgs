// 界限突破(标准 25 将 + 风 8 将,独立武将):抽样验证与原版的差异点

import { describe, expect, it } from 'vitest';
import { hasSkill } from './kernel';
import { handLimit } from './rules';
import {
  P, act, actErr, clearHands, equip, findCard, give, newGame, removeEverywhere,
  rigDrawTop, rigPlay, setGeneral, setRoles,
} from './testUtils';

describe('界魏', () => {
  it('界奸雄:受到伤害后摸一张并获得造成伤害的牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiecaocao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'jianxiong' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toHaveLength(2); // 摸1 + 得杀
    expect(P(s, 'p1').hand).toContain(sha);
  });

  it('界反馈:每受到 1 点伤害均可拿一张牌(酒杀 2 伤 = 2 张)', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiesimayi');
    P(s, 'p1').hp = 4;
    P(s, 'p1').maxHp = 4;
    rigPlay(s, 'p0');
    const jiu = give(s, 'p0', 'jiu');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p0', 'tao');
    give(s, 'p0', 'shan');
    s = act(s, { kind: 'play-card', cardId: jiu, targets: [] });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'pick', zone: 'hand' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p1').hand).toHaveLength(2);
    expect(P(s, 'p0').hand).toHaveLength(0);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('界突袭:少摸一张,改为获得一名角色的一张手牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiezhangliao');
    give(s, 'p0', 'sha');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'tuxi' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'players', players: ['p0'] });
    expect(P(s, 'p1').hand).toHaveLength(2); // 偷1 + 补摸1
    expect(P(s, 'p0').hand).toHaveLength(0);
  });

  it('界裸衣:放弃摸牌,亮三张获得基本牌/武器/决斗', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiexuchu');
    // 牌堆顶依次:杀(基本,获得)、八卦阵(防具,弃)、无中生有(锦囊,弃)
    const a = findCard(s, 'sha');
    const b = findCard(s, 'baguazhen');
    const c = findCard(s, 'wuzhong');
    for (const id of [c, b, a]) {
      removeEverywhere(s, id);
      s.drawPile.unshift(id);
    }
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'luoyi' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toEqual([a]);
    expect(P(s, 'p1').flags.luoyi).toBe(true);
    expect(s.discardPile).toContain(b);
    expect(s.discardPile).toContain(c);
  });

  it('界洛神:获得的判定牌本回合手牌上限 +1', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiezhenji');
    rigDrawTop(s, { suit: 'spade' });
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'luoshen' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'decline' }); // 不继续判定
    expect(P(s, 'p1').hand).toHaveLength(3); // 判定牌 + 摸2
    expect(P(s, 'p1').flags.luoshenBonus).toBe(1);
    expect(handLimit(s, P(s, 'p1'))).toBe(Math.max(0, P(s, 'p1').hp) + 1);
  });
});

describe('界蜀', () => {
  it('界仁德:给出第二张仁德牌可视为使用基本牌;同一角色本阶段只能给一次', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jieliubei');
    P(s, 'p0').hp = 3;
    P(s, 'p0').maxHp = 4;
    rigPlay(s, 'p0');
    const a = give(s, 'p0', 'sha');
    const b = give(s, 'p0', 'shan');
    const c = give(s, 'p0', 'tao');
    s = act(s, { kind: 'use-skill', skill: 'jrende', cardIds: [a, b], targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'jrende' });
    s = act(s, { kind: 'option', index: 1 }); // 视为使用桃
    expect(P(s, 'p0').hp).toBe(4);
    // 本阶段不能再给 p1
    expect(actErr(s, { kind: 'use-skill', skill: 'jrende', cardIds: [c], targets: ['p1'] }))
      .toContain('仁德');
  });

  it('义绝:目标展示黑色手牌则本回合技能失效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jieguanyu');
    rigPlay(s, 'p0');
    const junk = give(s, 'p0', 'guohe');
    const black = give(s, 'p1', 'sha', { suit: 'spade' });
    s = act(s, { kind: 'use-skill', skill: 'yijue', cardIds: [junk], targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'yijue' } });
    s = act(s, { kind: 'cards', cardIds: [black] });
    expect(P(s, 'p1').flags.yijueOff).toBe(true);
    expect(hasSkill(s, P(s, 'p1'), 'qixi')).toBe(false); // 甘宁的奇袭被压制
  });

  it('义绝:目标展示红色手牌则你获得之,并可令其回复体力', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jieguanyu');
    rigPlay(s, 'p0');
    const junk = give(s, 'p0', 'guohe');
    const red = give(s, 'p1', 'tao', { suit: 'heart' });
    P(s, 'p1').hp = 2;
    P(s, 'p1').maxHp = 4;
    s = act(s, { kind: 'use-skill', skill: 'yijue', cardIds: [junk], targets: ['p1'] });
    s = act(s, { kind: 'cards', cardIds: [red] });
    expect(P(s, 'p0').hand).toContain(red);
    s = act(s, { kind: 'option', index: 0 }); // 令其回复
    expect(P(s, 'p1').hp).toBe(3);
  });

  it('界咆哮:本回合使用过杀后,再使用杀无距离限制', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiezhangfei');
    rigPlay(s, 'p0');
    const s1 = give(s, 'p0', 'sha');
    const s2 = give(s, 'p0', 'sha');
    const hp2 = P(s, 'p2').hp;
    // 第一张必须打距离内(p1)
    expect(actErr(s, { kind: 'play-card', cardId: s1, targets: ['p2'] })).toContain('范围');
    s = act(s, { kind: 'play-card', cardId: s1, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    // 第二张即可打距离 2 的 p2
    s = act(s, { kind: 'play-card', cardId: s2, targets: ['p2'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
  });

  it('界观星:观看牌堆顶五张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiezhugeliang');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'arrange-cards' });
    const req = s.pendingRequest as Extract<typeof s.pendingRequest, { type: 'arrange-cards' }>;
    expect(req!.cardIds).toHaveLength(5);
    s = act(s, { kind: 'arrange', top: [...req!.cardIds], bottom: [] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
  });

  it('涯角:回合外打出手牌,亮出牌堆顶同类别则获得', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiezhaoyun');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan = give(s, 'p1', 'shan');
    const top = rigDrawTop(s, {});
    // 保证顶牌是基本牌(与闪同类别)
    const topCard = s.cards[top];
    if (!['sha', 'huosha', 'leisha', 'shan', 'tao', 'jiu'].includes(topCard.name)) {
      const basic = findCard(s, 'tao');
      removeEverywhere(s, basic);
      s.drawPile.unshift(basic);
    }
    const expectGain = s.drawPile[0];
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: shan });
    expect(P(s, 'p1').hand).toEqual([expectGain]);
  });

  it('界铁骑:目标弃同花色牌才能使用闪,否则不能闪', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiemachao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p1', 'shan', { suit: 'heart' });
    const judge = rigDrawTop(s, { suit: 'spade' });
    const spare = give(s, 'p1', 'sha', { suit: 'spade' }); // 与判定同花色
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'option', index: 0 }); // 发动界铁骑
    expect(s.pendingRequest).toMatchObject({
      player: 'p1', type: 'choose-cards', reason: { kind: 'jtieji', suit: s.cards[judge].suit },
    });
    s = act(s, { kind: 'cards', cardIds: [spare] });
    // 弃了同花色,可以正常闪
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
  });
});

describe('界吴', () => {
  it('界制衡:弃光所有手牌则多摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiesunquan');
    rigPlay(s, 'p0');
    const a = give(s, 'p0', 'sha');
    const b = give(s, 'p0', 'shan');
    s = act(s, { kind: 'use-skill', skill: 'jzhiheng', cardIds: [a, b] });
    expect(P(s, 'p0').hand).toHaveLength(3); // 弃2摸3
  });

  it('奋威:限定技,令群体锦囊对指定目标无效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jieganning');
    rigPlay(s, 'p0');
    const nm = give(s, 'p0', 'nanman');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: nm, targets: [] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'fenwei' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'players', players: ['p1'] });
    // p1 被豁免,其余角色依次结算
    while (s.pendingRequest && s.pendingRequest.player !== 'p0') {
      s = act(s, { kind: 'decline' });
    }
    expect(P(s, 'p1').hp).toBe(hp1);
    expect(P(s, 'p2').hp).toBeLessThan(4 + 1); // p2/p3 正常受伤
    expect(P(s, 'p1').usedLimit).toContain('fenwei');
  });

  it('勤学:手牌比体力多 3 时觉醒,获得攻心', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jielvmeng');
    P(s, 'p1').hp = 4;
    P(s, 'p1').maxHp = 4;
    for (const name of ['sha', 'sha', 'shan', 'shan', 'tao', 'guohe', 'wuzhong'] as const) {
      give(s, 'p1', name);
    }
    give(s, 'p0', 'sha');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(P(s, 'p1').usedLimit).toContain('qinxue');
    expect(P(s, 'p1').maxHp).toBe(3);
    expect(hasSkill(s, P(s, 'p1'), 'gongxin')).toBe(true);
    // 出牌阶段可以直接发动攻心
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    s = act(s, { kind: 'use-skill', skill: 'gongxin', targets: ['p0'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'gongxin' } });
  });

  it('界苦肉+诈降:弃牌失去体力摸三张,本阶段红杀不可闪避', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiehuanggai');
    P(s, 'p0').hp = 4;
    P(s, 'p0').maxHp = 4;
    rigPlay(s, 'p0');
    const junk = give(s, 'p0', 'guohe');
    const red = give(s, 'p0', 'sha', { suit: 'heart' });
    give(s, 'p1', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'jkurou', cardIds: [junk] });
    expect(P(s, 'p0').hp).toBe(3);
    expect(P(s, 'p0').hand).toHaveLength(4); // 红杀 + 诈降摸3
    expect(P(s, 'p0').flags.zhaxiang).toBe(1);
    // 红杀不可被闪响应:直接命中
    s = act(s, { kind: 'play-card', cardId: red, targets: ['p1'] });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('界反间:交出一张手牌,目标失去体力或弃同花色', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiezhouyu');
    rigPlay(s, 'p0');
    const shown = give(s, 'p0', 'sha', { suit: 'spade' });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'jfanjian', cardIds: [shown], targets: ['p1'] });
    expect(P(s, 'p1').hand).toContain(shown);
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'jfanjian' });
    s = act(s, { kind: 'option', index: 1 }); // 失去 1 点体力
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('界国色:方块当乐不思蜀,然后摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiedaqiao');
    rigPlay(s, 'p0');
    const d = give(s, 'p0', 'sha', { suit: 'diamond' });
    s = act(s, { kind: 'use-skill', skill: 'jguose', cardIds: [d], targets: ['p1'] });
    expect(P(s, 'p1').judgeZone).toContain(d);
    expect(P(s, 'p0').hand).toHaveLength(1); // 摸了一张
  });

  it('界连营:失去最后手牌后,令角色摸牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jieluxun');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // p1 不闪
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-player', reason: { kind: 'jlianying' } });
    s = act(s, { kind: 'players', players: ['p0'] });
    expect(P(s, 'p0').hand).toHaveLength(1);
  });
});

describe('界群+风', () => {
  it('界青囊:每名角色限一次;弃黑色牌则本阶段失效', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiehuatuo');
    rigPlay(s, 'p0');
    P(s, 'p1').hp = 2;
    P(s, 'p1').maxHp = 4;
    P(s, 'p2').hp = 2;
    P(s, 'p2').maxHp = 4;
    const red = give(s, 'p0', 'sha', { suit: 'heart' });
    const black = give(s, 'p0', 'sha', { suit: 'spade' });
    const extra = give(s, 'p0', 'shan');
    s = act(s, { kind: 'use-skill', skill: 'jqingnang', cardIds: [red], targets: ['p1'] });
    expect(P(s, 'p1').hp).toBe(3);
    expect(actErr(s, { kind: 'use-skill', skill: 'jqingnang', cardIds: [extra], targets: ['p1'] }))
      .toContain('青囊');
    // 弃黑色牌:生效,但之后青囊失效
    s = act(s, { kind: 'use-skill', skill: 'jqingnang', cardIds: [black], targets: ['p2'] });
    expect(P(s, 'p2').hp).toBe(3);
    expect(actErr(s, { kind: 'use-skill', skill: 'jqingnang', cardIds: [extra], targets: ['p2'] }))
      .toContain('失效');
  });

  it('利驭:杀造成伤害后获得目标一张手牌,其摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jielvbu');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p1', 'tao');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'liyu' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p0').hand).toHaveLength(1); // 拿到桃
    expect(P(s, 'p1').hand).toHaveLength(1); // 非装备:摸一张
  });

  it('界闭月:结束阶段没有手牌则摸两张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'jiediaochan');
    rigPlay(s, 'p2');
    s = act(s, { kind: 'end-phase' });
    expect(P(s, 'p2').hand).toHaveLength(2);
  });

  it('神速③:跳过弃牌阶段并翻面,视为使用杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiexiahouyuan');
    P(s, 'p0').hp = 2;
    P(s, 'p0').maxHp = 4;
    for (const name of ['sha', 'shan', 'tao', 'guohe'] as const) give(s, 'p0', name);
    rigPlay(s, 'p3');
    s = act(s, { kind: 'end-phase' });
    // p0 回合:判定阶段先问神速①,放弃
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'shensu1' });
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'end-phase' }); // 结束出牌(手牌 6 > 2,进入弃牌阶段)
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'shensu3' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p0').flipped).toBe(true);
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'players', players: ['p1'] });
    s = act(s, { kind: 'decline' }); // p1 不闪
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(P(s, 'p0').hand).toHaveLength(6); // 弃牌阶段被跳过
  });

  it('界据守:结束阶段摸四弃一并翻面;解围:翻回时移动场上牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiecaoren');
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'jushou' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p0').hand).toHaveLength(4);
    s = act(s, { kind: 'cards', cardIds: [P(s, 'p0').hand[0]] });
    expect(P(s, 'p0').hand).toHaveLength(3);
    expect(P(s, 'p0').flipped).toBe(true);
  });

  it('解围:翻至正面后可移动场上一张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiecaoren');
    P(s, 'p0').flipped = true;
    const bagua = equip(s, 'p1', 'baguazhen');
    rigPlay(s, 'p3');
    s = act(s, { kind: 'end-phase' });
    // p0 翻回正面并跳过回合;解围询问移动
    expect(P(s, 'p0').flipped).toBe(false);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-player' });
    s = act(s, { kind: 'players', players: ['p1'] });
    s = act(s, { kind: 'pick', zone: 'equip', cardId: bagua });
    s = act(s, { kind: 'players', players: ['p2'] });
    expect(P(s, 'p2').equips.armor).toBe(bagua);
  });

  it('界烈弓:目标手牌不多于你则不可闪;体力不小于你则伤害 +1', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jiehuangzhong');
    P(s, 'p0').hp = 3;
    P(s, 'p1').hp = 4;
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p0', 'shan'); // p0 手牌 2 > p1 手牌 0
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    // 不可闪 + 伤害 +1:直接结算 2 点
    expect(P(s, 'p1').hp).toBe(2);
  });

  it('奇谋:失去 X 点体力,本回合距离 -X 且额外 X 张杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'jieweiyan');
    P(s, 'p0').hp = 4;
    P(s, 'p0').maxHp = 4;
    rigPlay(s, 'p0');
    const s1 = give(s, 'p0', 'sha');
    const s2 = give(s, 'p0', 'sha');
    s = act(s, { kind: 'use-skill', skill: 'qimou' });
    s = act(s, { kind: 'option', index: 1 }); // X = 2
    expect(P(s, 'p0').hp).toBe(2);
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: s1, targets: ['p2'] }); // 距离 2-2 → 可达
    s = act(s, { kind: 'decline' }); // p2 不闪
    s = act(s, { kind: 'decline' }); // 界狂骨询问,放弃
    s = act(s, { kind: 'play-card', cardId: s2, targets: ['p2'] }); // 第二张杀
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'decline' }); // 界狂骨
    expect(P(s, 'p2').hp).toBe(hp2 - 2);
    expect(P(s, 'p0').usedLimit).toContain('qimou');
  });

  it('界天香:可令目标失去 1 点体力并获得弃置的红桃', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiexiaoqiao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const heart = give(s, 'p1', 'shan', { suit: 'heart' });
    const hp1 = P(s, 'p1').hp;
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // p1 不出闪
    s = act(s, { kind: 'option', index: 0 }); // 发动天香
    s = act(s, { kind: 'cards', cardIds: [heart] });
    s = act(s, { kind: 'players', players: ['p2'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'jtianxiang-mode' });
    s = act(s, { kind: 'option', index: 1 }); // 失去体力模式
    expect(P(s, 'p1').hp).toBe(hp1); // 伤害被防止
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(P(s, 'p2').hand).toContain(heart);
  });

  it('奋激:一名角色结束阶段没有手牌,可失去 1 点体力令其摸两张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiezhoutai');
    P(s, 'p1').hp = 4;
    P(s, 'p1').maxHp = 4;
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'fenji' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p0').hand).toHaveLength(2);
    expect(P(s, 'p1').hp).toBe(3);
  });

  it('界雷击:判定梅花则 1 点雷伤且自己回复 1 点', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'jiezhangjiao');
    P(s, 'p1').hp = 2;
    P(s, 'p1').maxHp = 3;
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan = give(s, 'p1', 'shan');
    rigDrawTop(s, { suit: 'club' });
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: shan });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'leiji' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'players', players: ['p2'] });
    expect(P(s, 'p2').hp).toBe(hp2 - 1); // 梅花:1 点雷伤
    expect(P(s, 'p1').hp).toBe(3);       // 张角回复 1 点
  });

  it('界蛊惑:质疑真牌者获得缠怨,不再能质疑且 1 血时技能失效', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'loyalist', p3: 'spy' });
    setGeneral(s, 'p0', 'jieyuji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'use-skill', skill: 'guhuo', cardIds: [sha], targets: ['p1'], declare: 'sha' });
    // p1 质疑
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'guhuo-challenge' });
    s = act(s, { kind: 'option', index: 0 });
    // 真牌:p1 获得缠怨,杀继续结算
    expect(P(s, 'p1').usedLimit).toContain('chanyuan');
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    // 缠怨:体力为 1 时技能失效
    P(s, 'p1').hp = 1;
    expect(hasSkill(s, P(s, 'p1'), 'qixi')).toBe(false);
    P(s, 'p1').hp = 2;
    expect(hasSkill(s, P(s, 'p1'), 'qixi')).toBe(true);
  });
});
