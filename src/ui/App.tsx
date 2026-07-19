import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameState, PlayerId, ResponseData, SkillName } from '../engine/types';
import { GENERALS } from '../engine/generals';
import { HUMAN_ID, LocalGame } from '../game/localGame';
import { CardChip } from './CardChip';
import { Seat } from './Seat';
import { PromptDialog } from './PromptDialog';
import { Log } from './Log';
import { ROLE_NAMES, SKILL_HINTS, SKILL_NAMES } from './text';

type ActiveSkill = 'rende' | 'wusheng' | 'zhiheng' | 'qixi' | 'lijian' | 'qingnang';

function targetsNeeded(state: GameState, skill: ActiveSkill | null, cardIds: number[]): number {
  if (skill) {
    switch (skill) {
      case 'lijian': return 2;
      case 'zhiheng': return 0;
      default: return 1;
    }
  }
  if (cardIds.length !== 1) return 0;
  const name = state.cards[cardIds[0]].name;
  return ['sha', 'guohe', 'shunshou', 'juedou'].includes(name) ? 1 : 0;
}

function multiSelect(skill: ActiveSkill | null): boolean {
  return skill === 'rende' || skill === 'zhiheng';
}

export function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  return <Game key={seed} seed={seed} onRestart={() => setSeed(Math.floor(Math.random() * 1e9))} />;
}

function Game({ seed, onRestart }: { seed: number; onRestart: () => void }) {
  const game = useMemo(() => new LocalGame(seed), [seed]);
  const [state, setState] = useState<GameState>(game.state);
  const [error, setError] = useState<string | null>(null);
  const [selCards, setSelCards] = useState<number[]>([]);
  const [selSkill, setSelSkill] = useState<ActiveSkill | null>(null);
  const [selTargets, setSelTargets] = useState<PlayerId[]>([]);

  useEffect(() => {
    const off = game.onChange(setState);
    setState(game.state);
    game.start();
    return () => {
      off();
      game.stop();
    };
  }, [game]);

  const req = state.pendingRequest;
  const isMyPlay = req?.type === 'play' && req.player === HUMAN_ID && !state.winner;
  const needDialog = req && req.player === HUMAN_ID && req.type !== 'play' && !state.winner;

  const resetSelection = useCallback(() => {
    setSelCards([]);
    setSelSkill(null);
    setSelTargets([]);
  }, []);

  useEffect(() => {
    resetSelection();
  }, [req?.id, resetSelection]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const submit = useCallback((resp: ResponseData) => {
    const err = game.submitHuman(resp);
    if (err) setError(err);
    else resetSelection();
  }, [game, resetSelection]);

  const human = state.players.find((p) => p.id === HUMAN_ID)!;
  const needed = targetsNeeded(state, selSkill, selCards);

  const toggleCard = (id: number) => {
    if (!isMyPlay) return;
    setSelTargets([]);
    setSelCards((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return multiSelect(selSkill) ? [...cur, id] : [id];
    });
  };

  const toggleTarget = (pid: PlayerId) => {
    if (!isMyPlay || needed === 0) return;
    setSelTargets((cur) => {
      if (cur.includes(pid)) return cur.filter((x) => x !== pid);
      if (cur.length >= needed) return needed === 1 ? [pid] : cur;
      return [...cur, pid];
    });
  };

  const confirm = () => {
    if (selSkill) {
      submit({ kind: 'use-skill', skill: selSkill as SkillName, cardIds: selCards, targets: selTargets });
    } else if (selCards.length === 1) {
      submit({ kind: 'play-card', cardId: selCards[0], targets: selTargets });
    }
  };

  const canConfirm = isMyPlay
    && (selSkill ? selCards.length > 0 : selCards.length === 1)
    && selTargets.length === needed;

  const activeSkills = (GENERALS[human.general].activeSkills as ActiveSkill[]);
  const skillDisabled = (sk: ActiveSkill): boolean => {
    switch (sk) {
      case 'zhiheng': return !!human.flags.zhiheng;
      case 'qingnang': return !!human.flags.qingnang;
      case 'lijian': return !!human.flags.lijian;
      default: return false;
    }
  };

  const aiSeats: PlayerId[] = ['p1', 'p2', 'p3'];

  return (
    <div className="app">
      <div className="board">
        <div className="seats-top">
          {aiSeats.map((pid) => (
            <Seat
              key={pid}
              state={state}
              pid={pid}
              targetable={isMyPlay && needed > 0 && state.players.find((p) => p.id === pid)!.alive}
              targeted={selTargets.includes(pid)}
              onTarget={() => toggleTarget(pid)}
            />
          ))}
        </div>

        <div className="table-center">
          <span>牌堆 {state.drawPile.length}</span>
          <span>弃牌堆 {state.discardPile.length}</span>
          {state.discardPile.slice(-4).map((id) => (
            <CardChip key={id} state={state} cardId={id} small />
          ))}
        </div>

        <div className="human-area">
          <Seat
            state={state}
            pid={HUMAN_ID}
            targetable={false}
            targeted={selTargets.includes(HUMAN_ID)}
            selectedCards={selCards}
            onEquipClick={
              isMyPlay && (selSkill === 'zhiheng' || selSkill === 'lijian')
                ? toggleCard
                : undefined
            }
          />
          <div className="human-main">
            <div className="hand">
              {human.hand.map((id) => (
                <CardChip
                  key={id}
                  state={state}
                  cardId={id}
                  selected={selCards.includes(id)}
                  onClick={isMyPlay ? () => toggleCard(id) : undefined}
                  disabled={!isMyPlay}
                />
              ))}
              {human.hand.length === 0 && <span className="dialog-hint">没有手牌</span>}
            </div>
            <div className="actions">
              {activeSkills.map((sk) => (
                <button
                  key={sk}
                  className={selSkill === sk ? 'btn btn-skill btn-skill-on' : 'btn btn-skill'}
                  disabled={!isMyPlay || skillDisabled(sk)}
                  title={SKILL_HINTS[sk]}
                  onClick={() => {
                    setSelSkill((cur) => (cur === sk ? null : sk));
                    setSelCards([]);
                    setSelTargets([]);
                  }}
                >
                  {SKILL_NAMES[sk as SkillName]}
                </button>
              ))}
              <button className="btn btn-primary" disabled={!canConfirm} onClick={confirm}>
                出牌
              </button>
              <button
                className="btn"
                disabled={!isMyPlay}
                onClick={() => submit({ kind: 'end-phase' })}
              >
                结束出牌
              </button>
            </div>
            {isMyPlay && needed > selTargets.length && (
              <div className="hint">请点击选择 {needed} 个目标</div>
            )}
          </div>
        </div>
      </div>

      <Log state={state} />

      {needDialog && req && (
        <PromptDialog
          state={state}
          req={req}
          onSubmit={submit}
          onTimeout={() => game.submitHumanDefault()}
        />
      )}

      {state.winner && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <div className="dialog-title">
              游戏结束:{state.winner.map((r) => ROLE_NAMES[r]).join('、')} 阵营获胜!
            </div>
            <div className="dialog-body">
              <div className="dialog-hint">
                你的身份:{ROLE_NAMES[human.role]}
                {state.winner.includes(human.role) ? ' —— 胜利!' : ' —— 落败'}
              </div>
              <button className="btn btn-primary" onClick={onRestart}>再来一局</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
