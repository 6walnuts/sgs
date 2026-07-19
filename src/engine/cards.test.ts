// 标准版补全牌:AOE 锦囊、借刀杀人、闪电、武器与仁王盾

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, equip, give, newGame, rigDrawTop, rigPlay,
} from './testUtils';

describe('群体锦囊', () => {
  it('南蛮入侵:各目标出杀或受 1 点伤害,伤害来源为使用者', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const nm = give(s, 'p0', 'nanman');
    const sha = give(s, 'p1', 'sha');
    const hp2 = P(s, 'p2').hp;
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'play-card', cardId: nm, targets: [] });
    // p1 出杀
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'sha' });
    s = act(s, { kind: 'card', cardId: sha });
    // p2/p3 不出 → 各受 1 点
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(P(s, 'p3').hp).toBe(hp3 - 1);
    expect(s.discardPile).toContain(nm);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('万箭齐发:目标出闪避免伤害;单个目标可被无懈', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const wj = give(s, 'p0', 'wanjian');
    const shan = give(s, 'p1', 'shan');
    const wx = give(s, 'p2', 'wuxie');
    const hp2 = P(s, 'p2').hp;
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'play-card', cardId: wj, targets: [] });
    // p1 目标:先问无懈(p2 有),p2 放弃
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'card', cardId: shan }); // p1 出闪
    // p2 目标:p2 用无懈保自己
    s = act(s, { kind: 'card', cardId: wx });
    // p3 目标:无人有无懈,不出闪受伤
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(P(s, 'p1').maxHp);
    expect(P(s, 'p2').hp).toBe(hp2);
    expect(P(s, 'p3').hp).toBe(hp3 - 1);
  });

  it('桃园结义:受伤角色各回复 1 点,满血跳过', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const ty = give(s, 'p0', 'taoyuan');
    P(s, 'p0').hp -= 1;
    P(s, 'p2').hp -= 2;
    const full1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: ty, targets: [] });
    expect(P(s, 'p0').hp).toBe(P(s, 'p0').maxHp);
    expect(P(s, 'p1').hp).toBe(full1);
    expect(P(s, 'p2').hp).toBe(P(s, 'p2').maxHp - 1);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('五谷丰登:每人按顺序选一张亮出的牌', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const wg = give(s, 'p0', 'wugu');
    s = act(s, { kind: 'play-card', cardId: wg, targets: [] });
    const req = s.pendingRequest!;
    expect(req).toMatchObject({ player: 'p0', type: 'choose-cards', from: 'shown' });
    const shown = (req as Extract<typeof req, { type: 'choose-cards' }>).shownIds!;
    expect(shown).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      // 若前面有人拿到了无懈可击,会先被询问是否响应五谷:一律放弃
      while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
      s = act(s, { kind: 'cards', cardIds: [shown[i]] });
    }
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').hand).toContain(shown[0]);
    expect(P(s, 'p1').hand).toContain(shown[1]);
    expect(P(s, 'p2').hand).toContain(shown[2]);
    expect(P(s, 'p3').hand).toContain(shown[3]);
    expect(s.discardPile).toContain(wg);
  });
});

describe('借刀杀人与闪电', () => {
  it('借刀杀人:出杀则对目标结算', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'jiedao');
    equip(s, 'p1', 'qinglongdao');
    const sha = give(s, 'p1', 'sha');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1', 'p2'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'sha', reason: { kind: 'jiedao' } });
    s = act(s, { kind: 'card', cardId: sha });
    // p2 被杀,不出闪
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(P(s, 'p1').equips.weapon).toBeDefined(); // 武器保住了
  });

  it('借刀杀人:不出杀则武器归借刀者', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'jiedao');
    const dao = equip(s, 'p1', 'qinglongdao');
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1', 'p2'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').hand).toContain(dao);
    expect(P(s, 'p1').equips.weapon).toBeUndefined();
  });

  it('借刀杀人:目标必须在持武器者攻击范围内', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'jiedao');
    equip(s, 'p1', 'zhugeliannu'); // 范围 1
    expect(actErr(s, { kind: 'play-card', cardId: jd, targets: ['p1', 'p3'] }))
      .toContain('攻击范围');
  });

  it('闪电:判定不中则转移给下家,判黑桃 2-9 受 3 点雷击', () => {
    let s = newGame();
    clearHands(s);
    // 直接把闪电放进 p1 判定区
    const sd = give(s, 'p1', 'shandian');
    P(s, 'p1').hand = [];
    P(s, 'p1').judgeZone.push(sd);
    P(s, 'p1').flags = {};
    P(s, 'p2').flags = {};
    // 情形 1:判红桃 → 不中,转移给 p2
    rigDrawTop(s, { suit: 'heart' });
    rigPlay(s, 'p0');
    s = act(s, { kind: 'end-phase' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').judgeZone).toHaveLength(0);
    expect(P(s, 'p2').judgeZone).toContain(sd);
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    // 情形 2:p2 回合判定黑桃 2-9 → 受 3 点雷击
    P(s, 'p2').hp = 4;
    const ok = s.drawPile.find((cid) => {
      const c = s.cards[cid];
      return c.suit === 'spade' && c.rank >= 2 && c.rank <= 9;
    })!;
    s.drawPile.splice(s.drawPile.indexOf(ok), 1);
    s.drawPile.unshift(ok);
    s = act(s, { kind: 'end-phase' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(1);
    expect(P(s, 'p2').judgeZone).toHaveLength(0);
    expect(s.discardPile).toContain(sd);
  });
});

describe('武器与仁王盾', () => {
  it('仁王盾:黑色杀无效,红色杀照常', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p1', 'renwang');
    const black = give(s, 'p0', 'sha', { red: false });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: black, targets: ['p1'] });
    // 黑杀直接无效,回到出牌
    expect(P(s, 'p1').hp).toBe(hp1);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
    // 红杀需要闪
    equip(s, 'p0', 'zhugeliannu');
    const red = give(s, 'p0', 'sha', { red: true });
    s = act(s, { kind: 'play-card', cardId: red, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
  });

  it('雌雄双股剑:对异性使用杀,其弃一张手牌或令你摸一张', () => {
    let s = newGame();
    clearHands(s);
    P(s, 'p1').general = 'diaochan'; // 女性
    rigPlay(s, 'p0');
    equip(s, 'p0', 'cixiong');
    const sha = give(s, 'p0', 'sha');
    const fodder = give(s, 'p1', 'tao');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'cixiong-choice' });
    s = act(s, { kind: 'option', index: 0 }); // 弃一张手牌
    s = act(s, { kind: 'cards', cardIds: [fodder] });
    expect(s.discardPile).toContain(fodder);
    // 继续正常求闪
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
  });

  it('贯石斧:杀被闪后弃两张牌强制命中', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'guanshi');
    const sha = give(s, 'p0', 'sha');
    const a = give(s, 'p0', 'tao');
    const b = give(s, 'p0', 'shan');
    const shan = give(s, 'p1', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: shan }); // p1 闪掉
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'guanshi' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'cards', cardIds: [a, b] });
    // 强制命中
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('麒麟弓:命中后弃置目标的马', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'qilin');
    const horse = equip(s, 'p2', 'jiama');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p2'] }); // 麒麟弓范围 5
    s = act(s, { kind: 'decline' }); // p2 不出闪
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'qilin' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.discardPile).toContain(horse);
    expect(P(s, 'p2').equips.horsePlus).toBeUndefined();
    expect(P(s, 'p2').hp).toBe(P(s, 'p2').maxHp - 1); // 伤害照常
  });

  it('寒冰剑:防止伤害,改为弃置目标两张牌', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'hanbing');
    const sha = give(s, 'p0', 'sha');
    const c1 = give(s, 'p1', 'tao');
    equip(s, 'p1', 'jiama');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // 不出闪
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'hanbing' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'pick', zone: 'hand' }); // 第一张:手牌
    const horse = P(s, 'p1').equips.horsePlus!;
    s = act(s, { kind: 'pick', zone: 'equip', cardId: horse }); // 第二张:马
    expect(P(s, 'p1').hp).toBe(hp1); // 伤害被防止
    expect(s.discardPile).toContain(c1);
    expect(s.discardPile).toContain(horse);
  });

  it('丈八蛇矛:两张手牌当杀(无花色,仁王盾不挡)', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'zhangba');
    equip(s, 'p1', 'renwang');
    const a = give(s, 'p0', 'sha', { red: false }); // 黑色牌:验证无花色杀不受仁王盾影响
    const b = give(s, 'p0', 'tao');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'zhangba', cardIds: [a, b], targets: ['p1'] });
    // 无花色杀,仁王盾不生效 → 求闪
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(s.discardPile).toContain(a);
    expect(s.discardPile).toContain(b);
  });

  it('方天画戟:最后一张手牌的杀可指定至多三个目标', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'fangtian');
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    const hp2 = P(s, 'p2').hp;
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1', 'p2', 'p3'] });
    s = act(s, { kind: 'decline' }); // p1
    s = act(s, { kind: 'decline' }); // p2
    s = act(s, { kind: 'decline' }); // p3
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(P(s, 'p3').hp).toBe(hp3 - 1);
    expect(s.discardPile).toContain(sha);
    // 非最后手牌时多目标非法
    const sha2 = give(s, 'p0', 'sha');
    give(s, 'p0', 'tao');
    expect(actErr(s, { kind: 'play-card', cardId: sha2, targets: ['p1', 'p2'] }))
      .toContain('方天画戟');
  });
});
