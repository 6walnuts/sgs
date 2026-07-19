import type { GameState, PlayerState, Role } from './types';
import { buildDeck } from './deck';
import { ALL_GENERAL_IDS, GENERALS } from './generals';
import { shuffled } from './rng';

export type PlayerCount = 4 | 5 | 8;

export interface GameConfig {
  seed: number;
  playerCount?: PlayerCount;
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
  const generals = shuffled(state, ALL_GENERAL_IDS).slice(0, count);

  const players: PlayerState[] = [];
  for (let seat = 0; seat < count; seat++) {
    const general = generals[seat];
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
  for (const p of players) {
    p.hand = state.drawPile.splice(0, 4);
  }

  const lord = players.find((p) => p.role === 'lord')!;
  state.turn = { activePlayer: lord.id, phase: 'start', turnNumber: 1 };
  return state;
}
