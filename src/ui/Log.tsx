import { useEffect, useRef } from 'react';
import type { GameState } from '../engine/types';
import { describeEvent } from './text';

export function Log({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = state.eventLog
    .map((ev, i) => ({ i, text: describeEvent(state, ev) }))
    .filter((x): x is { i: number; text: string } => x.text !== null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="log" ref={ref}>
      <div className="log-title">对局记录</div>
      {lines.map((l) => (
        <div key={l.i} className={l.text.startsWith('——') ? 'log-line log-turn' : 'log-line'}>
          {l.text}
        </div>
      ))}
    </div>
  );
}
