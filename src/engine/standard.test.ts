// 标准包补全武将与新机制(延时锦囊/观星/无双等)的测试

import { describe, expect, it } from 'vitest';
import type { GameState } from './types';
import {
  P, act, actErr, clearHands, equip, give, newGame, playerBefore, rigDrawTop,
  rigPlay, setGeneral,
} from './testUtils';

// 让上一位玩家结束回合,驱动 pid 的回合开始
function enterTurnOf(s: GameState, pid: string): GameState {
  const prev = playerBefore(s, pid);
  rigPlay(s, prev);
  // 手牌退回牌堆避免触发弃牌请求;目标玩家清掉建局时可能残留的阶段标记
  s.drawPile.push(...P(s, prev).hand.splice(0));
  P(s, pid).flags = {};
  return act(s, { kind: 'end-phase' });
}

describe('蜀将', () => {
  it('咆哮:出杀无次数限制', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'zhangfei');
    rigPlay(s, 'p0');
    const sha1 = give(s, 'p0', 'sha');
    const sha2 = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha1, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
  });

  it('龙胆:闪当杀使用,杀当闪响应', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'zhaoyun');
    rigPlay(s, 'p0');
    const shan = give(s, 'p0', 'shan');
    s = act(s, { kind: 'use-skill', skill: 'longdan', cardIds: [shan], targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
    s = act(s, { kind: 'decline' });
    // 反向:p1 出杀,赵云用杀当闪
    rigPlay(s, 'p1');
    const sha1 = give(s, 'p1', 'sha');
    const sha0 = give(s, 'p0', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: sha1, targets: ['p0'] });
    s = act(s, { kind: 'card', cardId: sha0, skill: 'longdan' });
    expect(P(s, 'p0').hp).toBe(hp0);
    expect(s.discardPile).toContain(sha0);
  });

  it('马术:-1 距离,隔位也能杀到', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'machao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p2'] });
    // 马超铁骑:先询问是否发动
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'tieji' });
  });

  it('铁骑:判定为红色则目标不能闪(八卦阵也无效)', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'machao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p1', 'shan');
    equip(s, 'p1', 'baguazhen');
    rigDrawTop(s, { red: true });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'option', index: 0 }); // 发动铁骑
    // 判红 → 不询问八卦、不询问闪,直接命中
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('空城:没有手牌时不能成为杀的目标', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhugeliang');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    expect(actErr(s, { kind: 'play-card', cardId: sha, targets: ['p1'] })).toContain('空城');
  });

  it('观星:调整牌堆顶顺序并把牌置底', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'zhugeliang');
    s = enterTurnOf(s, 'p2');
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'guanxing' });
    s = act(s, { kind: 'option', index: 0 });
    const req = s.pendingRequest!;
    expect(req.type).toBe('arrange-cards');
    const ids = (req as Extract<typeof req, { type: 'arrange-cards' }>).cardIds;
    expect(ids.length).toBe(4); // 4 名存活角色
    // 逆序放回牌堆顶,最后一张置底
    const top = [ids[2], ids[1], ids[0]];
    const bottom = [ids[3]];
    s = act(s, { kind: 'arrange', top, bottom });
    // 摸牌阶段随即摸走排好的前两张
    expect(P(s, 'p2').hand).toEqual([ids[2], ids[1]]);
    expect(s.drawPile[0]).toBe(ids[0]);
    expect(s.drawPile[s.drawPile.length - 1]).toBe(bottom[0]);
  });

  it('集智:使用锦囊摸一张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'huangyueying');
    rigPlay(s, 'p0');
    const wz = give(s, 'p0', 'wuzhong');
    s = act(s, { kind: 'play-card', cardId: wz, targets: [] });
    // 集智摸到的牌可能是无懈可击,会被询问是否无懈自己的锦囊
    if (s.pendingRequest?.type === 'respond-card') {
      s = act(s, { kind: 'decline' });
    }
    // 集智 +1,无中生有 +2
    expect(P(s, 'p0').hand).toHaveLength(3);
  });

  it('奇才:顺手牵羊无距离限制', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'huangyueying');
    rigPlay(s, 'p0');
    const ss = give(s, 'p0', 'shunshou');
    give(s, 'p2', 'sha');
    s = act(s, { kind: 'play-card', cardId: ss, targets: ['p2'] });
    // 集智可能摸到无懈可击并被询问
    while (s.pendingRequest?.type === 'respond-card') {
      s = act(s, { kind: 'decline' });
    }
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'pick-card', target: 'p2' });
  });
});

describe('魏将', () => {
  it('刚烈:判定不为红桃时来源二选一(弃两张或受伤)', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'xiahoudun');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const a = give(s, 'p0', 'tao');
    const b = give(s, 'p0', 'shan');
    rigDrawTop(s, { suit: 'spade' });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' }); // 不出闪,受伤
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'ganglie' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-option', reason: 'ganglie-choice' });
    s = act(s, { kind: 'option', index: 0 }); // 选择弃两张手牌
    s = act(s, { kind: 'cards', cardIds: [a, b] });
    expect(s.discardPile).toContain(a);
    expect(s.discardPile).toContain(b);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('突袭:放弃摸牌,获得两名角色各一张手牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'zhangliao');
    // 注意:enterTurnOf 会清空上一位玩家(p1)的手牌,所以给 p0/p3
    const c0 = give(s, 'p0', 'sha');
    const c3 = give(s, 'p3', 'shan');
    s = enterTurnOf(s, 'p2');
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'tuxi' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'players', players: ['p0', 'p3'] });
    expect(P(s, 'p2').hand).toEqual(expect.arrayContaining([c0, c3]));
    expect(P(s, 'p0').hand).toHaveLength(0);
    expect(P(s, 'p3').hand).toHaveLength(0);
  });

  it('裸衣:少摸一张,杀的伤害 +1', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'xuchu');
    s = enterTurnOf(s, 'p2');
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'luoyi' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p2').hand).toHaveLength(1); // 少摸一张
    const sha = give(s, 'p2', 'sha');
    const hp3 = P(s, 'p3').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p3'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p3').hp).toBe(hp3 - 2);
  });

  it('遗计:受伤后摸两张并可分给其他角色', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'guojia');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'yiji' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toHaveLength(2);
    const [c1, c2] = P(s, 'p1').hand;
    s = act(s, { kind: 'cards', cardIds: [c1] });
    s = act(s, { kind: 'players', players: ['p3'] });
    expect(P(s, 'p3').hand).toContain(c1);
    // 剩余的牌可以不再分
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hand).toEqual([c2]);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('天妒:判定牌生效后归郭嘉', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'guojia');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    equip(s, 'p1', 'baguazhen');
    const judgeCard = rigDrawTop(s, { red: true });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'option', index: 0 }); // 发动八卦
    expect(P(s, 'p1').hand).toContain(judgeCard);
  });

  it('洛神:判定黑色则获得并可继续', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'zhenji');
    const black = rigDrawTop(s, { red: false });
    s = enterTurnOf(s, 'p2');
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'luoshen' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p2').hand).toContain(black);
    // 黑色成功后可继续
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'choose-option', reason: 'luoshen' });
    s = act(s, { kind: 'decline' });
    // 进入摸牌后的出牌阶段
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'play' });
  });

  it('倾国:黑色手牌当闪', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'zhenji');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const black = give(s, 'p1', 'sha', { red: false });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: black, skill: 'qingguo' });
    expect(P(s, 'p1').hp).toBe(hp1);
  });
});

describe('吴将', () => {
  it('英姿:摸牌阶段多摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p2', 'zhouyu');
    s = enterTurnOf(s, 'p2');
    expect(P(s, 'p2').hand).toHaveLength(3);
  });

  it('反间:猜错花色受到伤害并获得牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'zhouyu');
    rigPlay(s, 'p0');
    const spadeCard = give(s, 'p0', 'sha', { suit: 'spade' });
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'use-skill', skill: 'fanjian', targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'fanjian-suit' });
    s = act(s, { kind: 'option', index: 1 }); // 猜红桃,实为黑桃
    expect(P(s, 'p1').hand).toContain(spadeCard);
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('苦肉:失去 1 点体力摸两张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'huanggai');
    rigPlay(s, 'p0');
    const hp = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'kurou' });
    expect(P(s, 'p0').hp).toBe(hp - 1);
    expect(P(s, 'p0').hand).toHaveLength(2);
  });

  it('克己:未出杀则跳过弃牌阶段', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'lvmeng');
    rigPlay(s, 'p0');
    for (let i = 0; i < 6; i++) give(s, 'p0', 'sha');
    P(s, 'p0').hp = 2;
    s = act(s, { kind: 'end-phase' });
    // 不需要弃牌,直接进入下家回合
    expect(P(s, 'p0').hand).toHaveLength(6);
    expect(s.turn.activePlayer).toBe('p1');
  });

  it('国色:方块牌当乐不思蜀;判定非红桃跳过出牌阶段', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'daqiao');
    rigPlay(s, 'p0');
    const diamond = give(s, 'p0', 'sha', { suit: 'diamond' });
    s = act(s, { kind: 'use-skill', skill: 'guose', cardIds: [diamond], targets: ['p1'] });
    expect(P(s, 'p1').judgeZone).toContain(diamond);
    s = act(s, { kind: 'end-phase' });
    // p1 回合:判定阶段结算乐(判黑桃 → 跳过出牌)
    rigDrawTop(s, { suit: 'spade' });
    // 现在应轮到 p1 判定;继续推进到 p1 的弃牌/下家
    // p1 出牌阶段被跳过:pendingRequest 不应是 p1 的 play
    if (s.pendingRequest?.type === 'play') {
      expect(s.pendingRequest.player).not.toBe('p1');
    }
    expect(P(s, 'p1').judgeZone).toHaveLength(0);
  });

  it('流离:弃一张牌把杀转移给攻击范围内的角色', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'daqiao');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const fodder = give(s, 'p1', 'tao');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'liuli' });
    s = act(s, { kind: 'option', index: 0 });
    s = act(s, { kind: 'cards', cardIds: [fodder] });
    s = act(s, { kind: 'players', players: ['p2'] });
    // 杀转移给 p2
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'respond-card', pattern: 'shan' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(s.discardPile).toContain(fodder);
  });

  it('谦逊:不能成为顺手牵羊/乐不思蜀的目标', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'luxun');
    rigPlay(s, 'p0');
    const ss = give(s, 'p0', 'shunshou');
    const le = give(s, 'p0', 'lebusishu');
    give(s, 'p1', 'sha');
    expect(actErr(s, { kind: 'play-card', cardId: ss, targets: ['p1'] })).toContain('谦逊');
    expect(actErr(s, { kind: 'play-card', cardId: le, targets: ['p1'] })).toContain('谦逊');
  });

  it('连营:失去最后手牌摸一张', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'luxun');
    rigPlay(s, 'p0');
    const gh = give(s, 'p0', 'guohe');
    give(s, 'p1', 'sha');
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    s = act(s, { kind: 'pick', zone: 'hand' });
    // 唯一手牌被拆 → 连营摸一张
    expect(P(s, 'p1').hand).toHaveLength(1);
  });

  it('结姻:弃两张手牌与受伤男性角色各回复 1 点', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'sunshangxiang');
    rigPlay(s, 'p0');
    const a = give(s, 'p0', 'sha');
    const b = give(s, 'p0', 'sha');
    P(s, 'p0').hp = 2;
    P(s, 'p1').hp = 2;
    s = act(s, { kind: 'use-skill', skill: 'jieyin', cardIds: [a, b], targets: ['p1'] });
    expect(P(s, 'p0').hp).toBe(3);
    expect(P(s, 'p1').hp).toBe(3);
  });

  it('枭姬:装备被拆走时摸两张牌', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p1', 'sunshangxiang');
    equip(s, 'p1', 'jiama');
    rigPlay(s, 'p0');
    const gh = give(s, 'p0', 'guohe');
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    const horse = P(s, 'p1').equips.horsePlus!;
    s = act(s, { kind: 'pick', zone: 'equip', cardId: horse });
    expect(P(s, 'p1').hand).toHaveLength(2);
  });
});

describe('群将与新机制', () => {
  it('无双:响应吕布的杀需要两张闪', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'lvbu');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan1 = give(s, 'p1', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: shan1 });
    // 需要第二张闪
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('无双:与吕布决斗需每轮打出两张杀', () => {
    let s = newGame();
    clearHands(s);
    setGeneral(s, 'p0', 'lvbu');
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'juedou');
    const sha1 = give(s, 'p1', 'sha');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: sha1 });
    // 还需第二张杀
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'sha' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('乐不思蜀:可被过河拆桥拆掉', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const le = give(s, 'p0', 'lebusishu');
    s = act(s, { kind: 'play-card', cardId: le, targets: ['p1'] });
    expect(P(s, 'p1').judgeZone).toContain(le);
    const gh = give(s, 'p0', 'guohe');
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    s = act(s, { kind: 'pick', zone: 'judge', cardId: le });
    expect(P(s, 'p1').judgeZone).toHaveLength(0);
    expect(s.discardPile).toContain(le);
  });

  it('乐不思蜀:判定红桃则不生效', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const le = give(s, 'p0', 'lebusishu');
    s = act(s, { kind: 'play-card', cardId: le, targets: ['p1'] });
    rigDrawTop(s, { suit: 'heart' });
    s = act(s, { kind: 'end-phase' });
    // p1 判红桃 → 正常出牌阶段
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    expect(s.discardPile).toContain(le);
  });

  it('乐不思蜀:同一角色判定区不能有两张乐', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const le1 = give(s, 'p0', 'lebusishu');
    const le2 = give(s, 'p0', 'lebusishu');
    s = act(s, { kind: 'play-card', cardId: le1, targets: ['p1'] });
    expect(actErr(s, { kind: 'play-card', cardId: le2, targets: ['p1'] })).toContain('已有');
  });
});
