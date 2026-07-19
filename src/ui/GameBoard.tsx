// 对局棋盘:本地与联机共用。只依赖 GameState + 应答回调,不关心状态来自哪里。

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameState, PlayerId, ResponseData, SkillName } from '../engine/types';
import { GENERALS } from '../engine/generals';
import { CardChip } from './CardChip';
import { Seat } from './Seat';
import { PromptDialog } from './PromptDialog';
import { Log } from './Log';
import { ROLE_NAMES, SKILL_HINTS, SKILL_NAMES } from './text';

type ActiveSkill =
  | 'rende' | 'wusheng' | 'zhiheng' | 'qixi' | 'lijian' | 'qingnang'
  | 'longdan' | 'kurou' | 'jieyin' | 'fanjian' | 'guose' | 'zhangba';

// 目标数区间 [min, max]
function targetsNeeded(
  state: GameState, humanId: string, skill: ActiveSkill | null, cardIds: number[],
): [number, number] {
  if (skill) {
    switch (skill) {
      case 'lijian': return [2, 2];
      case 'zhiheng': return [0, 0];
      case 'kurou': return [0, 0];
      default: return [1, 1];
    }
  }
  if (cardIds.length !== 1) return [0, 0];
  const p = state.players.find((x) => x.id === humanId)!;
  const name = state.cards[cardIds[0]].name;
  if (name === 'sha') {
    const w = p.equips.weapon;
    const fangtian = w !== undefined && state.cards[w].name === 'fangtian';
    const lastHand = p.hand.length === 1 && p.hand[0] === cardIds[0];
    return fangtian && lastHand ? [1, 3] : [1, 1];
  }
  if (name === 'jiedao') return [2, 2];
  return ['guohe', 'shunshou', 'juedou', 'lebusishu'].includes(name) ? [1, 1] : [0, 0];
}

// 技能需要选择的牌数:[最少, 最多]
function cardsNeeded(skill: ActiveSkill): [number, number] {
  switch (skill) {
    case 'rende': return [1, 99];
    case 'zhiheng': return [1, 99];
    case 'jieyin': return [2, 2];
    case 'zhangba': return [2, 2];
    case 'kurou': return [0, 0];
    case 'fanjian': return [0, 0];
    default: return [1, 1];
  }
}

function multiSelect(skill: ActiveSkill | null): boolean {
  return skill === 'rende' || skill === 'zhiheng' || skill === 'jieyin' || skill === 'zhangba';
}

export function GameBoard({
  state, humanId, submit, submitDefault, toast, overContent,
}: {
  state: GameState;
  humanId: PlayerId;
  submit: (resp: ResponseData) => void;
  submitDefault: () => void;
  toast: string | null;
  overContent: ReactNode;
}) {
  const [selCards, setSelCards] = useState<number[]>([]);
  const [selSkill, setSelSkill] = useState<ActiveSkill | null>(null);
  const [selTargets, setSelTargets] = useState<PlayerId[]>([]);

  const req = state.pendingRequest;
  const isMyPlay = req?.type === 'play' && req.player === humanId && !state.winner;
  const needDialog = req && req.player === humanId && req.type !== 'play' && !state.winner;

  const resetSelection = useCallback(() => {
    setSelCards([]);
    setSelSkill(null);
    setSelTargets([]);
  }, []);

  useEffect(() => {
    resetSelection();
  }, [req?.id, resetSelection]);

  const human = state.players.find((p) => p.id === humanId)!;
  const [needMin, needMax] = targetsNeeded(state, humanId, selSkill, selCards);

  const toggleCard = (id: number) => {
    if (!isMyPlay) return;
    setSelTargets([]);
    setSelCards((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return multiSelect(selSkill) ? [...cur, id] : [id];
    });
  };

  const toggleTarget = (pid: PlayerId) => {
    if (!isMyPlay || needMax === 0) return;
    setSelTargets((cur) => {
      if (cur.includes(pid)) return cur.filter((x) => x !== pid);
      if (cur.length >= needMax) return needMax === 1 ? [pid] : cur;
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
    && (selSkill
      ? selCards.length >= cardsNeeded(selSkill)[0] && selCards.length <= cardsNeeded(selSkill)[1]
      : selCards.length === 1)
    && selTargets.length >= needMin && selTargets.length <= needMax;

  const weaponId = human.equips.weapon;
  const hasZhangba = weaponId !== undefined && state.cards[weaponId].name === 'zhangba';
  const activeSkills: ActiveSkill[] = [
    ...(GENERALS[human.general].activeSkills as ActiveSkill[]),
    ...(hasZhangba ? (['zhangba'] as ActiveSkill[]) : []),
  ];
  const skillDisabled = (sk: ActiveSkill): boolean => {
    switch (sk) {
      case 'zhiheng': return !!human.flags.zhiheng;
      case 'qingnang': return !!human.flags.qingnang;
      case 'lijian': return !!human.flags.lijian;
      case 'jieyin': return !!human.flags.jieyin;
      case 'fanjian': return !!human.flags.fanjian;
      default: return false;
    }
  };

  const otherSeats = state.players
    .filter((p) => p.id !== humanId)
    .sort((a, b) => {
      const da = (a.seat - human.seat + state.players.length) % state.players.length;
      const db = (b.seat - human.seat + state.players.length) % state.players.length;
      return da - db;
    })
    .map((p) => p.id);

  return (
    <div className="app">
      <div className="board">
        <div className="seats-top">
          {otherSeats.map((pid) => (
            <Seat
              key={pid}
              state={state}
              pid={pid}
              humanId={humanId}
              targetable={isMyPlay && needMax > 0 && state.players.find((p) => p.id === pid)!.alive}
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
            pid={humanId}
            humanId={humanId}
            targetable={false}
            targeted={selTargets.includes(humanId)}
            selectedCards={selCards}
            onEquipClick={
              isMyPlay && (selSkill === 'zhiheng' || selSkill === 'lijian' || selSkill === 'guose')
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
            {isMyPlay && needMin > selTargets.length && (
              <div className="hint">
                请点击选择 {needMin === needMax ? needMin : `${needMin}~${needMax}`} 个目标
              </div>
            )}
          </div>
        </div>
      </div>

      <Log state={state} humanId={humanId} />

      {needDialog && req && (
        <PromptDialog
          state={state}
          req={req}
          onSubmit={submit}
          onTimeout={submitDefault}
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
              {overContent}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
