import type { GameState, PlayerId } from '../engine/types';
import { GENERAL_NAMES, ROLE_NAMES, SKILL_NAMES } from './text';
import { GENERALS } from '../engine/generals';
import { CardChip } from './CardChip';
import { GeneralPortrait } from './portraits';

export function Seat({
  state, pid, humanId, targetable, targeted, onTarget, onEquipClick, selectedCards,
}: {
  state: GameState;
  pid: PlayerId;
  humanId: PlayerId;
  targetable: boolean;
  targeted: boolean;
  onTarget?: () => void;
  onEquipClick?: (cardId: number) => void;
  selectedCards?: number[];
}) {
  const p = state.players.find((x) => x.id === pid)!;
  const isActive = state.turn.activePlayer === pid && !state.winner;
  const roleVisible = pid === humanId || p.roleRevealed || state.winner !== null;
  const waiting = state.pendingRequest?.player === pid;
  const equips = Object.values(p.equips).filter((x): x is number => x !== undefined);

  return (
    <div
      className={[
        'seat',
        p.alive ? '' : 'seat-dead',
        isActive ? 'seat-active' : '',
        targetable ? 'seat-targetable' : '',
        targeted ? 'seat-targeted' : '',
      ].join(' ')}
      onClick={targetable ? onTarget : undefined}
    >
      <div className="seat-header">
        <span className="seat-no">{p.seat + 1}号</span>
        <span className="seat-general">{GENERAL_NAMES[p.general]}</span>
        {pid === humanId && <span className="seat-you">你</span>}
        <span className={roleVisible ? `role role-${p.role}` : 'role role-hidden'}>
          {roleVisible ? ROLE_NAMES[p.role] : '?'}
        </span>
      </div>
      <div className="seat-body">
        <GeneralPortrait general={p.general} />
        <div className="seat-col">
          <div className="seat-skills">
            {GENERALS[p.general].skills.map((sk) => (
              <span key={sk} className="skill-tag">{SKILL_NAMES[sk]}</span>
            ))}
          </div>
          <div className="seat-hp">
            {Array.from({ length: p.maxHp }, (_, i) => (
              <span key={i} className={i < p.hp ? 'hp-full' : 'hp-empty'}>❤</span>
            ))}
          </div>
          <div className="seat-info">
            <span>手牌 {p.hand.length}</span>
            {p.chained && <span className="chain-tag">连环</span>}
        {!p.alive && <span className="dead-tag">阵亡</span>}
            {waiting && p.alive && <span className="waiting-tag">思考中…</span>}
          </div>
        </div>
      </div>
      {equips.length > 0 && (
        <div className="seat-equips">
          {equips.map((id) => (
            <CardChip
              key={id}
              state={state}
              cardId={id}
              small
              selected={selectedCards?.includes(id)}
              onClick={onEquipClick ? () => onEquipClick(id) : undefined}
            />
          ))}
        </div>
      )}
      {p.judgeZone.length > 0 && (
        <div className="seat-equips seat-judges">
          {p.judgeZone.map((id) => (
            <CardChip key={id} state={state} cardId={id} small />
          ))}
        </div>
      )}
    </div>
  );
}
