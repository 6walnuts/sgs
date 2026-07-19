// 可序列化随机数:状态就是 GameState.rngState 一个整数(mulberry32)。
// 同一 seed + 同一 Action 序列 => 完全相同的对局,联机对账/重放依赖此性质。

import type { GameState } from './types';

export function nextRand(s: GameState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: GameState, n: number): number {
  return Math.floor(nextRand(s) * n);
}

export function shuffled<T>(s: GameState, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
