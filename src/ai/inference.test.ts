// AI 身份推理:不偷看未亮身份,只用主公/阵亡锚点 + 行为证据

import { describe, expect, it } from 'vitest';
import { enemyIdsFor } from './simpleAi';
import { P, newGame, setRoles } from '../engine/testUtils';

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
