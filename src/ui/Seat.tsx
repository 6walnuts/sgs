import { useEffect, useState } from 'react';
import type { GameState, PlayerId } from '../engine/types';
import { GENERAL_NAMES, ROLE_NAMES, SKILL_DESCS, SKILL_NAMES } from './text';
import { GENERALS } from '../engine/generals';
import { CardChip } from './CardChip';
import { GeneralPortrait } from './portraits';
import { FX_FRAMES } from './fxManifest';

// 特效爆点:逐帧播放 /fx/<name>/<i>.png(QSGS 官方复刻帧序列),放完自毁
function FxBurst({ name, onDone }: { name: string; onDone: () => void }) {
  const [frame, setFrame] = useState(0);
  const total = FX_FRAMES[name] ?? 0;
  useEffect(() => {
    const t = setInterval(() => setFrame((x) => x + 1), 80);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (frame >= total) onDone();
  }, [frame, total, onDone]);
  if (frame >= total) return null;
  return <img className="fx-img" src={`/fx/${name}/${frame}.png`} alt="" />;
}

export function Seat({
  state, pid, humanId, targetable, targeted, onTarget, onEquipClick, selectedCards,
  fx, onFxDone,
}: {
  state: GameState;
  pid: PlayerId;
  humanId: PlayerId;
  targetable: boolean;
  targeted: boolean;
  onTarget?: () => void;
  onEquipClick?: (cardId: number) => void;
  selectedCards?: number[];
  fx?: { key: number; name: string }[];
  onFxDone?: (key: number) => void;
}) {
  const p = state.players.find((x) => x.id === pid)!;
  const isActive = state.turn.activePlayer === pid && !state.winner;
  const roleVisible = pid === humanId || p.roleRevealed || state.winner !== null;
  const waiting = state.pendingRequest?.player === pid;
  const equips = Object.values(p.equips).filter((x): x is number => x !== undefined);
  // 武魂"梦魇"标记:对场上存活的神关羽造成过的伤害合计(其死亡时最多者判定)
  const mengyan = state.players
    .filter((x) => x.alive && x.id !== pid && GENERALS[x.general].skills.includes('wuhun'))
    .reduce((n, x) => n + (x.damageTaken?.[pid] ?? 0), 0);

  return (
    <div
      data-pid={pid}
      className={[
        'seat',
        p.alive ? '' : 'seat-dead',
        isActive ? 'seat-active' : '',
        targetable ? 'seat-targetable' : '',
        targeted ? 'seat-targeted' : '',
      ].join(' ')}
      onClick={targetable ? onTarget : undefined}
    >
      {fx && fx.length > 0 && onFxDone && (
        <div className="seat-fx">
          {fx.map((f) => (
            <FxBurst key={f.key} name={f.name} onDone={() => onFxDone(f.key)} />
          ))}
        </div>
      )}
      <div className="seat-header">
        <span className="seat-no">{p.seat + 1}号</span>
        <span className="seat-general">{p.unpicked ? '选将中…' : GENERAL_NAMES[p.general]}</span>
        {pid === humanId && <span className="seat-you">你</span>}
        <span className={roleVisible ? `role role-${p.role}` : 'role role-hidden'}>
          {roleVisible ? ROLE_NAMES[p.role] : '?'}
        </span>
      </div>
      <div className="seat-body">
        {p.unpicked
          ? <div className="portrait portrait-unknown">?</div>
          : <GeneralPortrait general={p.general} />}
        <div className="seat-col">
          <div className="seat-skills">
            {!p.unpicked && (() => {
              const seen = new Set<string>();
              return GENERALS[p.general].skills
                .filter((sk) => {
                  const name = SKILL_NAMES[sk];
                  if (seen.has(name)) return false;
                  seen.add(name);
                  return true;
                })
                .map((sk) => (
                  <span key={sk} className="skill-tag" data-tip={SKILL_DESCS[sk]}>
                    {SKILL_NAMES[sk]}
                  </span>
                ));
            })()}
            {p.huashenSkill && (
              <span className="skill-tag" data-tip={SKILL_DESCS[p.huashenSkill]}>
                化:{SKILL_NAMES[p.huashenSkill]}
              </span>
            )}
          </div>
          <div className="seat-hp">
            {Array.from({ length: p.maxHp }, (_, i) => (
              <span key={i} className={i < p.hp ? 'hp-full' : 'hp-empty'}>❤</span>
            ))}
          </div>
          <div className="seat-info">
            <span>手牌 {p.hand.length}</span>
            {p.chained && <span className="chain-tag">连环</span>}
            {p.flipped && <span className="chain-tag">翻面</span>}
            {mengyan > 0 && (
              <span
                className="chain-tag mengyan-tag"
                title="梦魇:对神关羽造成过的伤害。其死亡时,梦魇最多的角色须判定,非桃/桃园结义则死亡"
              >
                梦魇×{mengyan}
              </span>
            )}
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
      {(p.buqu?.length ?? 0) > 0 && (
        <div className="seat-equips seat-judges">
          <span className="skill-tag">不屈</span>
          {p.buqu!.map((id) => (
            <CardChip key={id} state={state} cardId={id} small />
          ))}
        </div>
      )}
      {(p.tian?.length ?? 0) > 0 && (
        <div className="seat-equips seat-judges">
          <span className="skill-tag">田</span>
          {p.tian!.map((id) => (
            <CardChip key={id} state={state} cardId={id} small />
          ))}
        </div>
      )}
    </div>
  );
}
