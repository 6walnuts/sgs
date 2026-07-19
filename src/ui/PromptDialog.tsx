// 响应弹窗:出闪/求桃/无懈/选项/弃牌/选人/观星等请求,带倒计时,超时提交默认应答。

import { useEffect, useMemo, useState } from 'react';
import type { GameState, PendingRequest, PlayerId, ResponseData } from '../engine/types';
import { isBlack, isRed } from '../engine/deck';
import { GENERALS } from '../engine/generals';
import { CardChip } from './CardChip';
import { GeneralPortrait } from './portraits';
import {
  FACTION_NAMES, GENERAL_NAMES, OPTION_LABELS, SKILL_NAMES,
  describeRequest, playerLabel, seatLabel,
} from './text';

const TIMEOUT_SECONDS = 20;

interface CandidateCard {
  cardId: number;
  skill?: 'wusheng' | 'jijiu' | 'longdan' | 'qingguo';
}

function respondCandidates(
  s: GameState, req: Extract<PendingRequest, { type: 'respond-card' }>,
): CandidateCard[] {
  const p = s.players.find((x) => x.id === req.player)!;
  const skills = GENERALS[p.general].skills;
  const out: CandidateCard[] = [];
  for (const id of p.hand) {
    const name = s.cards[id].name;
    const matches = req.pattern === 'sha'
      ? (name === 'sha' || name === 'huosha' || name === 'leisha')
      : name === req.pattern;
    if (matches) out.push({ cardId: id });
  }
  // 濒死自救可用酒
  if (req.pattern === 'tao' && req.reason.kind === 'dying' && req.reason.who === p.id) {
    for (const id of p.hand) {
      if (s.cards[id].name === 'jiu') out.push({ cardId: id });
    }
  }
  if (req.pattern === 'sha') {
    if (skills.includes('wusheng')) {
      for (const id of p.hand) {
        if (isRed(s.cards[id].suit) && s.cards[id].name !== 'sha') out.push({ cardId: id, skill: 'wusheng' });
      }
    }
    if (skills.includes('longdan')) {
      for (const id of p.hand) {
        if (s.cards[id].name === 'shan') out.push({ cardId: id, skill: 'longdan' });
      }
    }
  }
  if (req.pattern === 'shan') {
    if (skills.includes('longdan')) {
      for (const id of p.hand) {
        if (s.cards[id].name === 'sha') out.push({ cardId: id, skill: 'longdan' });
      }
    }
    if (skills.includes('qingguo')) {
      for (const id of p.hand) {
        if (isBlack(s.cards[id].suit) && s.cards[id].name !== 'shan') out.push({ cardId: id, skill: 'qingguo' });
      }
    }
  }
  if (req.pattern === 'tao' && skills.includes('jijiu') && s.turn.activePlayer !== p.id) {
    for (const id of p.hand) {
      if (isRed(s.cards[id].suit) && s.cards[id].name !== 'tao') out.push({ cardId: id, skill: 'jijiu' });
    }
  }
  return out;
}

export function PromptDialog({
  state, req, onSubmit, onTimeout,
}: {
  state: GameState;
  req: PendingRequest;
  onSubmit: (resp: ResponseData) => void;
  onTimeout: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [picked, setPicked] = useState<number[]>([]);
  const [pickedPlayers, setPickedPlayers] = useState<PlayerId[]>([]);
  const [bottomIds, setBottomIds] = useState<number[]>([]);

  useEffect(() => {
    setSecondsLeft(TIMEOUT_SECONDS);
    setPicked([]);
    setPickedPlayers([]);
    setBottomIds([]);
    const t = setInterval(() => setSecondsLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [req.id]);

  useEffect(() => {
    if (secondsLeft <= 0) onTimeout();
  }, [secondsLeft, onTimeout]);

  const human = state.players.find((x) => x.id === req.player)!;
  const candidates = useMemo(
    () => (req.type === 'respond-card' ? respondCandidates(state, req) : []),
    [state, req],
  );

  const body = (() => {
    switch (req.type) {
      case 'respond-card':
        return (
          <>
            <div className="dialog-cards">
              {candidates.length === 0 && <span className="dialog-hint">没有可打出的牌</span>}
              {candidates.map((c) => (
                <div key={`${c.cardId}-${c.skill ?? ''}`} className="dialog-candidate">
                  <CardChip
                    state={state}
                    cardId={c.cardId}
                    onClick={() => onSubmit({ kind: 'card', cardId: c.cardId, skill: c.skill })}
                  />
                  {c.skill && <span className="via-skill">{SKILL_NAMES[c.skill]}</span>}
                </div>
              ))}
            </div>
            <button className="btn" onClick={() => onSubmit({ kind: 'decline' })}>不出</button>
          </>
        );
      case 'choose-option':
        return (
          <>
            {req.options.map((opt, i) => (
              <button key={opt} className="btn btn-primary" onClick={() => onSubmit({ kind: 'option', index: i })}>
                {OPTION_LABELS[opt] ?? SKILL_NAMES[opt as keyof typeof SKILL_NAMES] ?? opt}
              </button>
            ))}
            {req.canDecline && (
              <button className="btn" onClick={() => onSubmit({ kind: 'decline' })}>放弃</button>
            )}
          </>
        );
      case 'choose-cards': {
        const exclude = req.excludeIds ?? [];
        const selectable = (req.from === 'shown'
          ? (req.shownIds ?? [])
          : req.from === 'hand-equips'
            ? [...human.hand, ...Object.values(human.equips).filter((x): x is number => x !== undefined)]
            : human.hand
        ).filter((id) => !exclude.includes(id));
        const toggle = (id: number) => {
          setPicked((cur) => (cur.includes(id)
            ? cur.filter((x) => x !== id)
            : cur.length < req.max ? [...cur, id] : cur));
        };
        return (
          <>
            <div className="dialog-cards">
              {selectable.map((id) => (
                <CardChip
                  key={id}
                  state={state}
                  cardId={id}
                  selected={picked.includes(id)}
                  onClick={() => toggle(id)}
                />
              ))}
            </div>
            <button
              className="btn btn-primary"
              disabled={picked.length < req.min || picked.length > req.max}
              onClick={() => onSubmit({ kind: 'cards', cardIds: picked })}
            >
              确定({picked.length}/{req.min})
            </button>
            {req.canDecline && (
              <button className="btn" onClick={() => onSubmit({ kind: 'decline' })}>放弃</button>
            )}
          </>
        );
      }
      case 'choose-player': {
        const toggle = (pid: PlayerId) => {
          setPickedPlayers((cur) => (cur.includes(pid)
            ? cur.filter((x) => x !== pid)
            : cur.length < req.max ? [...cur, pid] : cur));
        };
        return (
          <>
            <div className="dialog-cards">
              {req.candidates.map((pid) => (
                <button
                  key={pid}
                  className={pickedPlayers.includes(pid) ? 'btn btn-skill btn-skill-on' : 'btn'}
                  onClick={() => toggle(pid)}
                >
                  {seatLabel(state, pid)}·{playerLabel(state, pid, req.player)}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary"
              disabled={pickedPlayers.length < req.min || pickedPlayers.length > req.max}
              onClick={() => onSubmit({ kind: 'players', players: pickedPlayers })}
            >
              确定({pickedPlayers.length}/{req.max})
            </button>
            {req.canDecline && (
              <button className="btn" onClick={() => onSubmit({ kind: 'decline' })}>放弃</button>
            )}
          </>
        );
      }
      case 'arrange-cards': {
        const topIds = req.cardIds.filter((id) => !bottomIds.includes(id));
        return (
          <>
            <div className="arrange-zone">
              <div className="dialog-hint">牌堆顶(先摸):点击移到牌堆底</div>
              <div className="dialog-cards">
                {topIds.map((id) => (
                  <CardChip key={id} state={state} cardId={id}
                    onClick={() => setBottomIds((cur) => [...cur, id])} />
                ))}
                {topIds.length === 0 && <span className="dialog-hint">(无)</span>}
              </div>
            </div>
            <div className="arrange-zone">
              <div className="dialog-hint">牌堆底:点击移回牌堆顶</div>
              <div className="dialog-cards">
                {bottomIds.map((id) => (
                  <CardChip key={id} state={state} cardId={id}
                    onClick={() => setBottomIds((cur) => cur.filter((x) => x !== id))} />
                ))}
                {bottomIds.length === 0 && <span className="dialog-hint">(无)</span>}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => onSubmit({ kind: 'arrange', top: topIds, bottom: bottomIds })}
            >
              确定
            </button>
          </>
        );
      }
      case 'pick-card':
        return (
          <>
            {req.handCount > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => onSubmit({ kind: 'pick', zone: 'hand' })}
              >
                手牌(随机,共 {req.handCount} 张)
              </button>
            )}
            <div className="dialog-cards">
              {req.equips.map((id) => (
                <CardChip
                  key={id}
                  state={state}
                  cardId={id}
                  onClick={() => onSubmit({ kind: 'pick', zone: 'equip', cardId: id })}
                />
              ))}
              {req.judges.map((id) => (
                <div key={id} className="dialog-candidate">
                  <CardChip
                    state={state}
                    cardId={id}
                    onClick={() => onSubmit({ kind: 'pick', zone: 'judge', cardId: id })}
                  />
                  <span className="via-skill">判定区</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'choose-general':
        return (
          <div className="dialog-cards general-picks">
            {req.candidates.map((g) => {
              const def = GENERALS[g];
              return (
                <button
                  key={g}
                  className="general-pick"
                  onClick={() => onSubmit({ kind: 'general', general: g })}
                >
                  <GeneralPortrait general={g} />
                  <div className="general-pick-name">
                    {GENERAL_NAMES[g]}
                    <span className={`faction faction-${def.faction}`}>{FACTION_NAMES[def.faction]}</span>
                  </div>
                  <div className="general-pick-hp">{'❤'.repeat(def.hp)}</div>
                  <div className="general-pick-skills">
                    {def.skills.map((sk) => (
                      <span key={sk} className="skill-tag">{SKILL_NAMES[sk]}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-title">
          {describeRequest(state, req, req.player)}
          <span className="countdown">{Math.max(0, secondsLeft)}s</span>
        </div>
        <div className="dialog-body">{body}</div>
      </div>
    </div>
  );
}
