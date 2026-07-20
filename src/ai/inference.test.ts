// AI 身份推理:不偷看未亮身份,只用主公/阵亡锚点 + 行为证据

import { describe, expect, it } from 'vitest';
import { decide, enemyIdsFor, gameDiff, lacksShan } from './simpleAi';
import { P, give, newGame, setRoles } from '../engine/testUtils';
import type { PendingRequest } from '../engine/types';

// 4 人局:p0 主公(身份公开)、p1 忠、p2 反、p3 内
function base() {
  const s = newGame();
  setRoles(s, { p0: 'lord', p1: 'loyalist', p2: 'rebel', p3: 'spy' });
  for (const p of s.players) p.roleRevealed = p.role === 'lord';
  return s;
}

describe('AI 身份推理', () => {
  it('开局无证据:主公方不树敌,反贼只认主公', () => {
    const s = base();
    expect(enemyIdsFor(s, 'p0')).toEqual([]); // 主公看不出谁是反贼
    expect(enemyIdsFor(s, 'p1')).toEqual([]);
    expect(enemyIdsFor(s, 'p2')).toEqual(['p0']); // 反贼:主公身份公开
    expect(enemyIdsFor(s, 'p3')).toEqual([]); // 内奸暂时看不出反贼
  });

  it('打过主公的人被主公方与内奸视为反贼;反贼视其为同伙', () => {
    const s = base();
    s.eventLog.push({ type: 'damage', source: 'p2', target: 'p0', amount: 2 });
    expect(enemyIdsFor(s, 'p0')).toEqual(['p2']);
    expect(enemyIdsFor(s, 'p1')).toEqual(['p2']);
    expect(enemyIdsFor(s, 'p3')).toEqual(['p2']); // 内奸先帮着清反贼
    expect(enemyIdsFor(s, 'p2')).toEqual(['p0']); // 反贼不打自己(证据是自己打的)
  });

  it('攻击已认定反贼的人被反贼视为主公方', () => {
    const s = base();
    s.eventLog.push({ type: 'damage', source: 'p2', target: 'p0', amount: 2 }); // p2 亮成反贼
    s.eventLog.push({ type: 'damage', source: 'p1', target: 'p2', amount: 2 }); // p1 打反贼
    expect(enemyIdsFor(s, 'p2')).toContain('p1'); // 反贼把 p1 认成主公方
    expect(enemyIdsFor(s, 'p0')).toEqual(['p2']); // 主公不会因此把 p1 当敌人
  });

  it('阵亡锚点可回溯:生前打过(后来亮出的)反贼,主公不视其为敌', () => {
    const s = base();
    // p3 生前对 p2 出杀并造成伤害;p2 后来阵亡亮出反贼身份
    s.eventLog.push({
      type: 'cardPlayed', player: 'p3', cardId: s.drawPile[0], targets: ['p2'], as: 'sha',
    });
    s.eventLog.push({ type: 'damage', source: 'p3', target: 'p2', amount: 1 });
    P(s, 'p2').alive = false;
    P(s, 'p2').roleRevealed = true;
    // 主公:p3 帮过场(打反贼 +11 分),即使反贼全灭也暂不树敌
    expect(enemyIdsFor(s, 'p0')).toEqual([]);
    // 隐藏忠臣 p1:排除自己后,未亮身份的只剩内奸 → p3 是敌人
    expect(enemyIdsFor(s, 'p1')).toEqual(['p3']);
  });

  it('反贼全灭后:内奸决战;主公无证据不乱打,挨打后认清内奸', () => {
    const s = base();
    P(s, 'p2').alive = false;
    P(s, 'p2').roleRevealed = true;
    // 内奸:对所有存活他人开战
    expect(enemyIdsFor(s, 'p3').sort()).toEqual(['p0', 'p1']);
    // 隐藏忠臣 p1 用排除法认出内奸;主公分不清 p1/p3,先不动手
    expect(enemyIdsFor(s, 'p1')).toEqual(['p3']);
    expect(enemyIdsFor(s, 'p0')).toEqual([]);
    // 内奸动手后,主公认清敌人
    s.eventLog.push({ type: 'damage', source: 'p3', target: 'p0', amount: 2 });
    expect(enemyIdsFor(s, 'p0')).toEqual(['p3']);
  });

  it('未出手的角色不会被误伤', () => {
    const s = base();
    s.eventLog.push({ type: 'damage', source: 'p2', target: 'p0', amount: 3 });
    // p3 从未出手:任何视角都不是敌人(反贼死光前)
    expect(enemyIdsFor(s, 'p0')).not.toContain('p3');
    expect(enemyIdsFor(s, 'p1')).not.toContain('p3');
    expect(enemyIdsFor(s, 'p2')).not.toContain('p3');
  });
});

describe('局势天平与内奸转向(借鉴 QSGS gameProcess)', () => {
  it('主公方优势过大时内奸压制忠臣但不打主公;反贼占优时帮主公方', () => {
    const s = base();
    // 忠臣 p1 亮出且满状态,反贼 p2 亮出且残血空牌 → 主公方大优
    P(s, 'p1').roleRevealed = true;
    P(s, 'p2').roleRevealed = true;
    P(s, 'p2').hp = 1;
    P(s, 'p2').hand = [];
    expect(gameDiff(s)).toBeGreaterThanOrEqual(6);
    // 内奸转头压制忠臣,但不打主公也不再帮着打反贼
    const es = enemyIdsFor(s, 'p3');
    expect(es).toContain('p1');
    expect(es).not.toContain('p0');
    expect(es).not.toContain('p2');
    // 反贼占优(忠臣阵亡、反贼满状态)→ 内奸回头清反贼
    P(s, 'p1').alive = false;
    P(s, 'p2').hp = 4;
    P(s, 'p2').hand = [1, 2, 3, 4, 5, 6];
    // 推理缓存按 (状态引用, 事件数) 命中;实际对局每步都是新状态对象,
    // 测试原地改字段需追加一条事件让缓存失效
    s.eventLog.push({ type: 'chained', player: 'p2', chained: false });
    expect(gameDiff(s)).toBeLessThan(6);
    expect(enemyIdsFor(s, 'p3')).toEqual(['p2']);
  });
});

describe('缺闪记牌', () => {
  it('面对杀吃了伤害的人被记为缺闪,摸牌后清除', () => {
    const s = base();
    const sha = give(s, 'p0', 'sha');
    s.eventLog.push({ type: 'cardPlayed', player: 'p0', cardId: sha, targets: ['p2'] });
    s.eventLog.push({ type: 'damage', source: 'p0', target: 'p2', amount: 1 });
    expect(lacksShan(s, 'p2')).toBe(true);
    expect(lacksShan(s, 'p1')).toBe(false);
    // 之后有牌进手,标记清除
    s.eventLog.push({
      type: 'cardsMoved', cardIds: [s.drawPile[1]],
      from: { zone: 'draw' }, to: { zone: 'hand', player: 'p2' },
    });
    expect(lacksShan(s, 'p2')).toBe(false);
  });

  it('出过闪的人不会被记缺闪', () => {
    const s = base();
    const sha = give(s, 'p0', 'sha');
    const shan = s.drawPile[1];
    s.eventLog.push({ type: 'cardPlayed', player: 'p0', cardId: sha, targets: ['p2'] });
    s.eventLog.push({ type: 'cardResponded', player: 'p2', cardId: shan, as: 'shan' });
    expect(lacksShan(s, 'p2')).toBe(false);
  });
});

describe('出桃收紧(借鉴 QSGS willUsePeachTo)', () => {
  const dyingReq = (asker: string, who: string): PendingRequest => ({
    id: 999, player: asker as never, type: 'respond-card', pattern: 'tao',
    canDecline: true, reason: { kind: 'dying', who: who as never },
  });

  it('救不活就不浪费:需要两桃、只有一桃且无人能补时不救非主公', () => {
    const s = base();
    for (const p of s.players) p.hand = [];
    P(s, 'p1').hp = -1; // 需要 2 桃
    give(s, 'p0', 'tao');
    s.pendingRequest = dyingReq('p0', 'p1');
    expect(decide(s, 'p0', s.pendingRequest!)).toEqual({ kind: 'decline' });
    // 主公濒死则倾囊相救
    P(s, 'p1').hp = 4;
    P(s, 'p0').hp = -1;
    s.pendingRequest = dyingReq('p1', 'p0');
    give(s, 'p1', 'tao');
    expect(decide(s, 'p1', s.pendingRequest!).kind).toBe('card');
  });

  it('内奸在主公方不落下风时不救忠臣;自己濒死先酒后桃', () => {
    const s = base();
    for (const p of s.players) p.hand = [];
    // p1 忠臣濒死,内奸 p3 有桃:局势 diff > 0(主公方人数占优)→ 不救
    P(s, 'p1').hp = 0;
    give(s, 'p3', 'tao');
    s.pendingRequest = dyingReq('p3', 'p1');
    expect(decide(s, 'p3', s.pendingRequest!)).toEqual({ kind: 'decline' });
    // 自己濒死:手里有酒有桃,先喝酒
    P(s, 'p3').hp = 0;
    const jiu = give(s, 'p3', 'jiu');
    s.pendingRequest = dyingReq('p3', 'p3');
    expect(decide(s, 'p3', s.pendingRequest!)).toEqual({ kind: 'card', cardId: jiu });
  });
});
