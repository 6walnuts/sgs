// 军争篇牌:属性伤害、连环传导、酒、火攻、兵粮寸断与军争装备

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, equip, give, newGame, rigDrawTop, rigPlay,
} from './testUtils';

describe('属性杀与藤甲', () => {
  it('藤甲:普通杀无效,火杀命中且伤害 +1', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p1', 'tengjia');
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    // 普通杀被藤甲无效,直接回到出牌
    expect(P(s, 'p1').hp).toBe(hp1);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
    // 火杀:命中且藤甲火伤 +1
    equip(s, 'p0', 'zhugeliannu');
    const huosha = give(s, 'p0', 'huosha');
    s = act(s, { kind: 'play-card', cardId: huosha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 2);
  });

  it('藤甲:雷杀正常结算(只挡普通杀);南蛮入侵无效', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p1', 'tengjia');
    const leisha = give(s, 'p0', 'leisha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: leisha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 雷伤不加成
    // 南蛮:p1 藤甲免疫,p2/p3 正常
    const nm = give(s, 'p0', 'nanman');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: nm, targets: [] });
    s = act(s, { kind: 'decline' }); // p2
    s = act(s, { kind: 'decline' }); // p3
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 未再受伤
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
  });

  it('酒:下一张杀伤害 +1,每回合限一次;濒死可自救', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const jiu = give(s, 'p0', 'jiu');
    const jiu2 = give(s, 'p0', 'jiu');
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: jiu, targets: [] });
    expect(actErr(s, { kind: 'play-card', cardId: jiu2, targets: [] })).toContain('限');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 2);
    // 濒死自救:p1 打 p0 至濒死,p0 用酒回 1
    rigPlay(s, 'p1');
    const sha2 = give(s, 'p1', 'sha');
    const jiu3 = give(s, 'p0', 'jiu');
    P(s, 'p0').hp = 1;
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p0'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', pattern: 'tao' });
    s = act(s, { kind: 'card', cardId: jiu3 });
    expect(P(s, 'p0').alive).toBe(true);
    expect(P(s, 'p0').hp).toBe(1);
  });
});

describe('铁索连环', () => {
  it('横置两名角色,属性伤害解除连环并传导', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const ts = give(s, 'p0', 'tiesuo');
    s = act(s, { kind: 'play-card', cardId: ts, targets: ['p1', 'p2'] });
    expect(P(s, 'p1').chained).toBe(true);
    expect(P(s, 'p2').chained).toBe(true);
    // 火杀 p1:p1 受伤解除连环,伤害传导给 p2
    const huosha = give(s, 'p0', 'huosha');
    const hp1 = P(s, 'p1').hp;
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: huosha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(P(s, 'p1').chained).toBe(false);
    expect(P(s, 'p2').hp).toBe(hp2 - 1); // 传导
    expect(P(s, 'p2').chained).toBe(false);
  });

  it('普通伤害不解除连环也不传导;重铸弃牌摸一', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const ts = give(s, 'p0', 'tiesuo');
    s = act(s, { kind: 'play-card', cardId: ts, targets: ['p1', 'p2'] });
    const sha = give(s, 'p0', 'sha');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').chained).toBe(true); // 普通伤害不解除
    expect(P(s, 'p2').hp).toBe(hp2);       // 不传导
    // 重铸
    const ts2 = give(s, 'p0', 'tiesuo');
    const handBefore = P(s, 'p0').hand.length;
    s = act(s, { kind: 'play-card', cardId: ts2, targets: [] });
    expect(P(s, 'p0').hand.length).toBe(handBefore); // 弃一摸一
    expect(s.discardPile).toContain(ts2);
  });

  it('闪电雷击传导给连环角色', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const ts = give(s, 'p0', 'tiesuo');
    s = act(s, { kind: 'play-card', cardId: ts, targets: ['p1', 'p2'] });
    // 闪电放进 p1 判定区,雷击 3 点 → 传导给 p2
    const sd = give(s, 'p1', 'shandian');
    P(s, 'p1').hand = P(s, 'p1').hand.filter((id) => id !== sd);
    P(s, 'p1').judgeZone.push(sd);
    P(s, 'p1').flags = {};
    P(s, 'p1').hp = 4;
    P(s, 'p2').hp = 4;
    const ok = s.drawPile.find((cid) => {
      const c = s.cards[cid];
      return c.suit === 'spade' && c.rank >= 2 && c.rank <= 9;
    })!;
    s.drawPile.splice(s.drawPile.indexOf(ok), 1);
    s.drawPile.unshift(ok);
    s = act(s, { kind: 'end-phase' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(1);
    expect(P(s, 'p2').hp).toBe(1); // 3 点雷伤传导
    expect(P(s, 'p2').chained).toBe(false);
  });
});

describe('火攻与兵粮寸断', () => {
  it('火攻:弃同花色手牌造成 1 点火焰伤害;无同花色则放弃', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const hg = give(s, 'p0', 'huogong');
    const mine = give(s, 'p0', 'sha', { suit: 'spade' });
    const shown = give(s, 'p1', 'shan', { suit: 'diamond' });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: hg, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-cards', reason: { kind: 'huogong-show' } });
    s = act(s, { kind: 'cards', cardIds: [shown] });
    const req = s.pendingRequest!;
    expect(req).toMatchObject({ player: 'p0', reason: { kind: 'huogong-match', suit: 'diamond' } });
    // 黑桃不匹配方块
    expect(actErr(s, { kind: 'cards', cardIds: [mine] })).toContain('花色');
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1);
    // 有同花色:造成火伤
    const hg2 = give(s, 'p0', 'huogong');
    const match = give(s, 'p0', 'shan', { suit: 'diamond' });
    s = act(s, { kind: 'play-card', cardId: hg2, targets: ['p1'] });
    s = act(s, { kind: 'cards', cardIds: [shown] });
    s = act(s, { kind: 'cards', cardIds: [match] });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
    expect(s.discardPile).toContain(match);
  });

  it('兵粮寸断:距离 1 放置,判非梅花跳过摸牌阶段', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const bl = give(s, 'p0', 'bingliang');
    const bl2 = give(s, 'p0', 'bingliang');
    expect(actErr(s, { kind: 'play-card', cardId: bl, targets: ['p2'] })).toContain('距离');
    s = act(s, { kind: 'play-card', cardId: bl, targets: ['p1'] });
    expect(P(s, 'p1').judgeZone).toContain(bl);
    expect(actErr(s, { kind: 'play-card', cardId: bl2, targets: ['p1'] })).toContain('已有');
    // p1 回合:判黑桃 → 跳过摸牌
    P(s, 'p1').flags = {};
    rigDrawTop(s, { suit: 'spade' });
    s = act(s, { kind: 'end-phase' });
    while (s.pendingRequest?.type === 'respond-card') s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    expect(P(s, 'p1').hand).toHaveLength(0); // 没摸牌
    expect(s.discardPile).toContain(bl);
  });
});

describe('军争装备', () => {
  it('白银狮子:超过 1 点的伤害改为 1;失去装备回复 1 点', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p1', 'baiyin');
    const jiu = give(s, 'p0', 'jiu');
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: jiu, targets: [] });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1); // 酒+杀 2 点被白银压回 1
    // 拆掉白银狮子 → 回复 1
    const gh = give(s, 'p0', 'guohe');
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    const lion = P(s, 'p1').equips.armor!;
    s = act(s, { kind: 'pick', zone: 'equip', cardId: lion });
    expect(P(s, 'p1').hp).toBe(hp1);
  });

  it('朱雀羽扇:普通杀可当火杀(可破藤甲)', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'zhuque');
    equip(s, 'p1', 'tengjia');
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'zhuque' });
    s = act(s, { kind: 'option', index: 0 }); // 转为火杀
    s = act(s, { kind: 'decline' }); // p1 不闪
    expect(P(s, 'p1').hp).toBe(hp1 - 2); // 火杀 1 + 藤甲火伤 1
  });

  it('古锭刀:目标无手牌时伤害 +1', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    equip(s, 'p0', 'gudingdao');
    const sha = give(s, 'p0', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 2);
  });

  it('火杀可以响应南蛮入侵的出杀要求', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const nm = give(s, 'p0', 'nanman');
    const huosha = give(s, 'p1', 'huosha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: nm, targets: [] });
    s = act(s, { kind: 'card', cardId: huosha });
    expect(P(s, 'p1').hp).toBe(hp1);
    expect(s.discardPile).toContain(huosha);
  });
});
