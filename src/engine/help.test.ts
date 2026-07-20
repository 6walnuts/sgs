// 护驾(曹操)/激将(刘备)主公技:同势力角色代打

import { describe, expect, it } from 'vitest';
import {
  P, act, actErr, clearHands, give, newGame, rigPlay, setGeneral, setRoles,
} from './testUtils';

function lordSetup() {
  const s = newGame();
  clearHands(s);
  setRoles(s, { p0: 'rebel', p1: 'lord', p2: 'loyalist', p3: 'spy' });
  return s;
}

describe('护驾(曹操主公技)', () => {
  it('主公需要闪时,魏势力角色可代打', () => {
    let s = lordSetup();
    setGeneral(s, 'p1', 'caocao');
    setGeneral(s, 'p2', 'xiahoudun'); // 魏
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan = give(s, 'p2', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
    s = act(s, { kind: 'help' }); // 发动护驾
    expect(s.pendingRequest).toMatchObject({
      player: 'p2', type: 'respond-card', pattern: 'shan', reason: { kind: 'hujia', who: 'p1' },
    });
    s = act(s, { kind: 'card', cardId: shan });
    expect(P(s, 'p1').hp).toBe(hp1); // 闪被代打,主公没掉血
    expect(P(s, 'p2').hand).toHaveLength(0);
    expect(s.discardPile).toContain(shan);
  });

  it('帮手全部放弃后回到主公,且不能再次发动', () => {
    let s = lordSetup();
    setGeneral(s, 'p1', 'caocao');
    setGeneral(s, 'p2', 'xiahoudun');
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    give(s, 'p2', 'shan');
    const hp1 = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'help' });
    s = act(s, { kind: 'decline' }); // p2 拒绝代打
    // 回到主公的原始请求
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
    expect(actErr(s, { kind: 'help' })).toContain('已发动过');
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hp1 - 1);
  });

  it('场上没有其他魏势力角色时不能发动', () => {
    let s = lordSetup();
    setGeneral(s, 'p1', 'caocao'); // 其余都是甘宁(吴)
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(actErr(s, { kind: 'help' })).toContain('同势力');
  });
});

describe('激将(刘备主公技)', () => {
  it('响应:主公被决斗需要杀时,蜀势力角色可代打', () => {
    let s = lordSetup();
    setGeneral(s, 'p1', 'liubei');
    setGeneral(s, 'p3', 'zhaoyun'); // 蜀
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'juedou');
    const sha = give(s, 'p3', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'sha' });
    s = act(s, { kind: 'help' });
    expect(s.pendingRequest).toMatchObject({
      player: 'p3', type: 'respond-card', reason: { kind: 'jijiang', who: 'p1' },
    });
    s = act(s, { kind: 'card', cardId: sha });
    // 决斗轮到 p0 出杀
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'respond-card', pattern: 'sha' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
  });

  it('主动:出牌阶段发动激将视为使用杀,计入次数', () => {
    let s = lordSetup();
    setGeneral(s, 'p1', 'liubei');
    setGeneral(s, 'p2', 'zhaoyun');
    rigPlay(s, 'p1');
    const sha = give(s, 'p2', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'jijiang', targets: ['p0'] });
    expect(s.pendingRequest).toMatchObject({
      player: 'p2', type: 'respond-card', reason: { kind: 'jijiang', who: 'p1', target: 'p0' },
    });
    s = act(s, { kind: 'card', cardId: sha });
    s = act(s, { kind: 'decline' }); // p0 不闪
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    // 本回合杀的次数已用完
    expect(actErr(s, { kind: 'use-skill', skill: 'jijiang', targets: ['p0'] })).toContain('次数');
  });

  it('主动:无人代打则杀未发出,不计次数', () => {
    let s = lordSetup();
    setGeneral(s, 'p1', 'liubei');
    setGeneral(s, 'p2', 'zhaoyun');
    rigPlay(s, 'p1');
    give(s, 'p2', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'use-skill', skill: 'jijiang', targets: ['p0'] });
    s = act(s, { kind: 'decline' }); // p2 拒绝
    expect(P(s, 'p0').hp).toBe(hp0);
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    // 次数未消耗,可再次尝试
    s = act(s, { kind: 'use-skill', skill: 'jijiang', targets: ['p0'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p2', type: 'respond-card' });
  });
});
