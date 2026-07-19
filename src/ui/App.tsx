import { useEffect, useMemo, useReducer, useState } from 'react';
import type { GameState, ResponseData } from '../engine/types';
import { HUMAN_ID, LocalGame } from '../game/localGame';
import { NetGame, defaultWsUrl } from '../game/netGame';
import type { NetIntent } from '../game/netGame';
import { GameBoard } from './GameBoard';

type PlayerCount = 4 | 5 | 8;

type Screen =
  | { kind: 'menu' }
  | { kind: 'local'; playerCount: PlayerCount; pickGenerals: boolean }
  | { kind: 'online'; intent: NetIntent };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });
  const toMenu = () => setScreen({ kind: 'menu' });
  switch (screen.kind) {
    case 'menu':
      return (
        <Menu
          onLocal={(playerCount, pickGenerals) => setScreen({ kind: 'local', playerCount, pickGenerals })}
          onOnline={(intent) => setScreen({ kind: 'online', intent })}
        />
      );
    case 'local':
      return (
        <LocalPlay
          playerCount={screen.playerCount}
          pickGenerals={screen.pickGenerals}
          onExit={toMenu}
        />
      );
    case 'online':
      return <OnlinePlay intent={screen.intent} onExit={toMenu} />;
  }
}

// ---------- 主菜单 ----------

function Menu({ onLocal, onOnline }: {
  onLocal: (playerCount: PlayerCount, pickGenerals: boolean) => void;
  onOnline: (intent: NetIntent) => void;
}) {
  const [name, setName] = useState('玩家');
  const [roomId, setRoomId] = useState('');
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [pickGenerals, setPickGenerals] = useState(true);
  return (
    <div className="menu">
      <h1 className="menu-title">三国杀</h1>
      <div className="menu-card">
        <div className="menu-row">
          <label>人数</label>
          {([4, 5, 8] as PlayerCount[]).map((n) => (
            <button
              key={n}
              className={playerCount === n ? 'btn btn-skill btn-skill-on' : 'btn'}
              onClick={() => setPlayerCount(n)}
            >
              {n} 人局
            </button>
          ))}
        </div>
        <div className="menu-row">
          <label>选将</label>
          <button
            className={pickGenerals ? 'btn btn-skill btn-skill-on' : 'btn'}
            onClick={() => setPickGenerals(true)}
          >
            自选武将
          </button>
          <button
            className={!pickGenerals ? 'btn btn-skill btn-skill-on' : 'btn'}
            onClick={() => setPickGenerals(false)}
          >
            随机分配
          </button>
        </div>
        <button className="btn btn-primary menu-btn" onClick={() => onLocal(playerCount, pickGenerals)}>
          单机游戏(1 人 + {playerCount - 1} AI)
        </button>
        <div className="menu-row">
          <label>昵称</label>
          <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          className="btn btn-primary menu-btn"
          onClick={() => onOnline({ kind: 'create', name, playerCount, pickGenerals })}
        >
          创建联机房间
        </button>
        <div className="menu-row">
          <label>房间号</label>
          <input
            value={roomId}
            maxLength={4}
            placeholder="如 AB3D"
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          />
          <button
            className="btn"
            disabled={roomId.trim().length !== 4}
            onClick={() => onOnline({ kind: 'join', roomId: roomId.trim(), name })}
          >
            加入房间
          </button>
        </div>
        <div className="dialog-hint">联机需先运行 npm run server(空位由 AI 补足)</div>
      </div>
    </div>
  );
}

// ---------- 单机 ----------

function LocalPlay({ playerCount, pickGenerals, onExit }: {
  playerCount: PlayerCount;
  pickGenerals: boolean;
  onExit: () => void;
}) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  return (
    <LocalSession
      key={seed}
      seed={seed}
      playerCount={playerCount}
      pickGenerals={pickGenerals}
      onRestart={() => setSeed(Math.floor(Math.random() * 1e9))}
      onExit={onExit}
    />
  );
}

function useToast(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}

function LocalSession({ seed, playerCount, pickGenerals, onRestart, onExit }: {
  seed: number;
  playerCount: PlayerCount;
  pickGenerals: boolean;
  onRestart: () => void;
  onExit: () => void;
}) {
  const game = useMemo(
    () => new LocalGame(seed, playerCount, pickGenerals),
    [seed, playerCount, pickGenerals],
  );
  const [state, setState] = useState<GameState>(game.state);
  const [toast, setToast] = useToast();

  useEffect(() => {
    const off = game.onChange(setState);
    setState(game.state);
    game.start();
    return () => {
      off();
      game.stop();
    };
  }, [game]);

  const submit = (resp: ResponseData) => {
    const err = game.submitHuman(resp);
    if (err) setToast(err);
  };

  return (
    <GameBoard
      state={state}
      humanId={HUMAN_ID}
      submit={submit}
      submitDefault={() => game.submitHumanDefault()}
      toast={toast}
      overContent={(
        <>
          <button className="btn btn-primary" onClick={onRestart}>再来一局</button>
          <button className="btn" onClick={onExit}>返回菜单</button>
        </>
      )}
    />
  );
}

// ---------- 联机 ----------

function OnlinePlay({ intent, onExit }: { intent: NetIntent; onExit: () => void }) {
  const net = useMemo(() => new NetGame(defaultWsUrl(), intent), [intent]);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [toast, setToast] = useToast();

  useEffect(() => {
    net.onUpdate = force;
    net.onError = setToast;
    net.start();
    return () => {
      net.onUpdate = null;
      net.stop();
    };
  }, [net, setToast]);

  const inGame = net.room?.phase === 'playing' && net.state && net.you;
  if (!inGame) {
    return <Lobby net={net} toast={toast} onExit={onExit} />;
  }

  return (
    <GameBoard
      state={net.state!}
      humanId={net.you!}
      submit={(resp) => {
        const err = net.submitHuman(resp);
        if (err) setToast(err);
      }}
      submitDefault={() => net.submitHumanDefault()}
      toast={toast}
      overContent={(
        <>
          {net.isHost
            ? <button className="btn btn-primary" onClick={() => net.startGame()}>再来一局</button>
            : <span className="dialog-hint">等待房主开始新对局…</span>}
          <button className="btn" onClick={onExit}>离开房间</button>
        </>
      )}
    />
  );
}

function Lobby({ net, toast, onExit }: {
  net: NetGame;
  toast: string | null;
  onExit: () => void;
}) {
  const room = net.room;
  const statusText = {
    connecting: '连接服务器中…',
    open: room ? '' : '等待服务器响应…',
    closed: '连接已断开,正在重连…',
    failed: '无法连接服务器,请确认已运行 npm run server',
  }[net.status];

  return (
    <div className="menu">
      <h1 className="menu-title">联机大厅</h1>
      <div className="menu-card">
        {room && (
          <>
            <div className="lobby-roomid">
              房间号:<strong>{room.roomId}</strong>({room.playerCount} 人局)
              <span className="dialog-hint">(告诉朋友这个代码加入)</span>
            </div>
            <div className="lobby-members">
              {room.members.map((m) => (
                <div key={m.seat} className="lobby-member">
                  <span>{m.seat === room.you ? `${m.name}(你)` : m.name}</span>
                  {m.isHost && <span className="role role-lord">房主</span>}
                  {!m.connected && <span className="dead-tag">掉线</span>}
                </div>
              ))}
              {Array.from({ length: room.playerCount - room.members.length }, (_, i) => (
                <div key={`ai-${i}`} className="lobby-member lobby-ai">
                  <span>AI 玩家</span>
                </div>
              ))}
            </div>
            {net.isHost
              ? (
                <button className="btn btn-primary menu-btn" onClick={() => net.startGame()}>
                  开始游戏
                </button>
              )
              : <div className="dialog-hint">等待房主开始游戏…</div>}
          </>
        )}
        {statusText && <div className="dialog-hint">{statusText}</div>}
        <button className="btn" onClick={onExit}>返回菜单</button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
