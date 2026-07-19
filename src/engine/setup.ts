import type { GameState, PlayerState, Role } from './types';
import { buildDeck } from './deck';
import { ALL_GENERAL_IDS, GENERALS } from './generals';
import { shuffled } from './rng';

export interface GameConfig {
  seed: number;
}

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

  const roles = shuffled<Role>(state, ['lord', 'loyalist', 'rebel', 'spy']);
  const generals = shuffled(state, ALL_GENERAL_IDS).slice(0, 4);

  const players: PlayerState[] = [];
  for (let seat = 0; seat < 4; seat++) {
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
