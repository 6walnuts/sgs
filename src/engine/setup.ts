import type { GameState, GeneralId, PlayerId, PlayerState, Role } from './types';
import { buildDeck } from './deck';
import { ALL_GENERAL_IDS, GENERALS } from './generals';
import { shuffled } from './rng';

export type PlayerCount = 4 | 5 | 8;

export interface GameConfig {
  seed: number;
  playerCount?: PlayerCount;
  pickGenerals?: boolean;     // 开局选将(默认随机分配)
  generalCandidates?: number; // 每人候选数(主公额外 +2),默认 3;受武将池上限约束
}

// 每人候选数:限制在 [3,6],且保证 count*n + 2(主公加成)不超过武将池
export function candidateCount(playerCount: number, requested?: number): number {
  const poolCap = Math.floor((ALL_GENERAL_IDS.length - 2) / playerCount);
  return Math.max(3, Math.min(requested ?? 3, 6, poolCap));
}

// 标准身份场配置
const ROLE_SETS: Record<PlayerCount, Role[]> = {
  4: ['lord', 'loyalist', 'rebel', 'spy'],
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'spy'],
  8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'spy'],
};

export function buildInitialState(config: GameConfig): GameState {
  const cards = buildDeck();
  const state: GameState = {
    rngState: config.seed >>> 0,
    players: [],
    cards,
    drawPile: [],
    discardPile: [],
    processingZone: [],
    turn: { activePlayer: 'p0', phase: 'start', turnNumber: 1 },
    stack: [],
    pendingRequest: null,
    nextRequestId: 1,
    winner: null,
    eventLog: [],
  };

  const count = config.playerCount ?? 4;
  const roles = shuffled<Role>(state, [...ROLE_SETS[count]]);
  const pool = shuffled(state, ALL_GENERAL_IDS);

  const players: PlayerState[] = [];
  for (let seat = 0; seat < count; seat++) {
    const general = pool[seat];
    const role = roles[seat];
    const maxHp = GENERALS[general].hp + (role === 'lord' ? 1 : 0);
    players.push({
      id: `p${seat}`,
      seat,
      general,
      role,
      roleRevealed: role === 'lord',
      maxHp,
      hp: maxHp,
      alive: true,
      hand: [],
      equips: {},
      judgeZone: [],
      flags: {},
    });
  }
  state.players = players;
  state.drawPile = shuffled(state, Object.keys(cards).map(Number));

  const lord = players.find((p) => p.role === 'lord')!;
  state.turn = { activePlayer: lord.id, phase: 'start', turnNumber: 1 };

  if (config.pickGenerals) {
    // 选将模式:主公先从 5 名候选里选,其余按座次各从 3 名里选;
    // 起始手牌与回合开始由 choose-generals 帧在全部选定后处理
    const queue: PlayerId[] = [
      lord.id,
      ...players.filter((p) => p.id !== lord.id).map((p) => p.id),
    ];
    const perPlayer = candidateCount(count, config.generalCandidates);
    const candidates: Record<PlayerId, GeneralId[]> = {};
    let cursor = 0;
    for (const pid of queue) {
      const n = pid === lord.id ? perPlayer + 2 : perPlayer;
      candidates[pid] = pool.slice(cursor, cursor + n);
      cursor += n;
    }
    for (const p of players) {
      p.unpicked = true;
      p.general = candidates[p.id][0]; // 占位,选定后覆盖(视角过滤会隐藏)
      p.maxHp = GENERALS[p.general].hp + (p.role === 'lord' ? 1 : 0);
      p.hp = p.maxHp;
    }
    state.stack.push({ type: 'choose-generals', step: 'next', queue, idx: 0, candidates });
    return state;
  }

  for (const p of players) {
    p.hand = state.drawPile.splice(0, 4);
  }
  return state;
}
