import type { GameState } from '../engine/types';
import { isRed } from '../engine/deck';
import { CARD_NAMES, SUIT_SYMBOLS, rankLabel } from './text';

export function CardChip({
  state, cardId, selected, onClick, disabled, dimmed, small,
}: {
  state: GameState;
  cardId: number;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dimmed?: boolean; // 当前不可用(如杀次数已满):明显置灰
  small?: boolean;
}) {
  const c = state.cards[cardId];
  const red = isRed(c.suit);
  return (
    <button
      className={[
        'card-chip',
        small ? 'card-small' : '',
        selected ? 'card-selected' : '',
        dimmed ? 'card-dimmed' : '',
        onClick && !disabled ? 'card-clickable' : '',
      ].join(' ')}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      <span className={red ? 'suit-red' : 'suit-black'}>
        {SUIT_SYMBOLS[c.suit]}{rankLabel(c.rank)}
      </span>
      <span className="card-name">{CARD_NAMES[c.name]}</span>
    </button>
  );
}
