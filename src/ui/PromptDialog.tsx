// 响应弹窗:出闪/求桃/无懈/选项/弃牌等请求,带倒计时,超时提交默认应答。

import { useEffect, useMemo, useState } from 'react';
import type { GameState, PendingRequest, ResponseData } from '../engine/types';
import { isRed } from '../engine/deck';
import { GENERALS } from '../engine/generals';
import { CardChip } from './CardChip';
import { OPTION_LABELS, describeRequest } from './text';

const TIMEOUT_SECONDS = 20;

interface CandidateCard {
  cardId: number;
  skill?: 'wusheng' | 'jijiu';
}

function respondCandidates(
  s: GameState, req: Extract<PendingRequest, { type: 'respond-card' }>,
): CandidateCard[] {
  const p = s.players.find((x) => x.id === req.player)!;
  const general = GENERALS[p.general];
  const out: CandidateCard[] = [];
  for (const id of p.hand) {
    const c = s.cards[id];
    if (c.name === req.pattern) out.push({ cardId: id });
  }
  if (req.pattern === 'sha' && general.skills.includes('wusheng')) {
    for (const id of p.hand) {
      if (isRed(s.cards[id].suit) && s.cards[id].name !== 'sha') out.push({ cardId: id, skill: 'wusheng' });
    }
  }
  if (req.pattern === 'tao' && general.skills.includes('jijiu') && s.turn.activePlayer !== p.id) {
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

  useEffect(() => {
    setSecondsLeft(TIMEOUT_SECONDS);
    setPicked([]);
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
                  {c.skill && <span className="via-skill">{c.skill === 'wusheng' ? '武圣' : '急救'}</span>}
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
                {OPTION_LABELS[opt] ?? opt}
              </button>
            ))}
            {req.canDecline && (
              <button className="btn" onClick={() => onSubmit({ kind: 'decline' })}>放弃</button>
            )}
          </>
        );
      case 'choose-cards': {
        const toggle = (id: number) => {
          setPicked((cur) => (cur.includes(id)
            ? cur.filter((x) => x !== id)
            : cur.length < req.max ? [...cur, id] : cur));
        };
        return (
          <>
            <div className="dialog-cards">
              {human.hand.map((id) => (
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
            </div>
          </>
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
