import type { GameState, GeneralId, PlayerId, PlayerState, Role } from './types';
import { buildDeck } from './deck';
import { grantHuashen } from './kernel';
import { BASE_GENERAL_IDS, GENERALS, jieOf } from './generals';
import { nextRand, shuffled } from './rng';

export type PlayerCount = 4 | 5 | 8;

export interface GameConfig {
  seed: number;
  playerCount?: PlayerCount;
  pickGenerals?: boolean;     // 开局选将(默认随机分配)
  generalCandidates?: number; // 每人候选数(主公额外 +2),默认 3;受武将池上限约束
  godGenerals?: boolean;      // 神武将加入武将池(默认关;神将不进主公候选,登场自选势力)
}

// 每人候选数:限制在 [3,6],且保证 count*n + 2(主公加成)不超过武将池
// (界版与原版同名武将只占一个池位)
export function candidateCount(playerCount: number, requested?: number): number {
  const poolCap = Math.floor((BASE_GENERAL_IDS.length - 2) / playerCount);
  return Math.max(3, Math.min(requested ?? 3, 6, poolCap));
}

// 标准身份场配置(UI 的身份分布展示也用它)
export const ROLE_SETS: Record<PlayerCount, Role[]> = {
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
  // 武将池只放原版:界限突破与原版是同一名武将,不会同场出现两个"关羽"
  const available = config.godGenerals
    ? BASE_GENERAL_IDS
    : BASE_GENERAL_IDS.filter((g) => GENERALS[g].faction !== 'god');
  let pool = shuffled(state, available);
  // 神将不能当主公:把主公将拿到的神将换到池子后段
  const lordSeat = roles.indexOf('lord');
  if (GENERALS[pool[lordSeat]]?.faction === 'god') {
    const swap = pool.findIndex((g, i) => i >= count && GENERALS[g].faction !== 'god');
    if (swap >= 0) {
      pool = [...pool];
      [pool[lordSeat], pool[swap]] = [pool[swap], pool[lordSeat]];
    }
  }

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
    // 主公候选不含神将:先从非神部分取主公的候选,再顺序分配其余;
    // 并保证候选中至少有一名经典主公将(曹/刘/孙,选择时可切界版)
    const CLASSIC_LORDS: GeneralId[] = ['caocao', 'liubei', 'sunquan'];
    const nonGod = pool.filter((g) => GENERALS[g].faction !== 'god');
    let lordCands = nonGod.slice(0, perPlayer + 2);
    if (!lordCands.some((g) => CLASSIC_LORDS.includes(g))) {
      const swapIn = nonGod.find(
        (g, i) => i >= perPlayer + 2 && CLASSIC_LORDS.includes(g),
      );
      if (swapIn) lordCands = [...lordCands.slice(0, -1), swapIn];
    }
    const rest = pool.filter((g) => !lordCands.includes(g));
    let cursor = 0;
    for (const pid of queue) {
      if (pid === lord.id) {
        candidates[pid] = lordCands;
      } else {
        candidates[pid] = rest.slice(cursor, cursor + perPlayer);
        cursor += perPlayer;
      }
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
    // 随机分配模式:有界版的武将掷硬币决定用原版还是界限突破
    const j = jieOf(p.general);
    if (j && nextRand(state) < 0.5) {
      p.general = j;
      p.maxHp = GENERALS[j].hp + (p.role === 'lord' ? 1 : 0);
      p.hp = p.maxHp;
    }
    p.hand = state.drawPile.splice(0, 4);
    if (GENERALS[p.general].skills.includes('huashen')) grantHuashen(state, p.id, 2);
  }
  // 随机分配模式:有神武将登场时,开局先让其选择势力
  const gods = players.filter((p) => GENERALS[p.general].faction === 'god').map((p) => p.id);
  if (gods.length > 0) {
    state.stack.push({ type: 'god-faction', step: 'next', queue: gods, idx: 0 });
  }
  return state;
}
