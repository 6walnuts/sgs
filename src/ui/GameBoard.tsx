// 对局棋盘:本地与联机共用。只依赖 GameState + 应答回调,不关心状态来自哪里。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CardName, GameState, PlayerId, PlayerState, ResponseData, SkillName } from '../engine/types';
import { GENERALS } from '../engine/generals';
import { ROLE_SETS } from '../engine/setup';
import { shaLimit, shaUsed } from '../engine/rules';
import { isShaCard } from '../engine/deck';
import { CardChip } from './CardChip';
import { Seat } from './Seat';
import { PromptDialog } from './PromptDialog';
import { Log } from './Log';
import { CARD_NAMES, ROLE_NAMES, SKILL_HINTS, SKILL_NAMES, describeEvent, playerLabel } from './text';
import { isBgmOn, startBgm, stopBgm } from './bgm';
import { playCardVoice, playDeathVoice, playSkillVoice, playSystemSound } from './voice';
import { FX_FRAMES } from './fxManifest';
import { loadSettings, saveSettings } from './settings';
import type { Role } from '../engine/types';

// 局内音乐开关:同步写回设置,下次进对局沿用
function BgmToggle() {
  const [on, setOn] = useState(isBgmOn());
  // 会话的 startBgm 在父组件 effect 中晚于本组件挂载执行,轮询对齐真实播放状态
  useEffect(() => {
    const t = setInterval(() => setOn(isBgmOn()), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <button
      className="btn btn-mini"
      title={on ? '关闭背景音乐' : '开启背景音乐'}
      onClick={() => {
        if (on) {
          stopBgm();
          saveSettings({ bgm: false });
        } else {
          saveSettings({ bgm: true });
          startBgm();
        }
        setOn(!on);
      }}
    >
      {on ? '🎵' : '🔇'}
    </button>
  );
}

// 身份分布:本局身份构成一览,阵亡的身份置灰(身份分布由人数决定,是公开信息)
function RoleDist({ state }: { state: GameState }) {
  const dist = ROLE_SETS[state.players.length as 4 | 5 | 8];
  if (!dist) return null;
  const total: Record<Role, number> = { lord: 0, loyalist: 0, rebel: 0, spy: 0 };
  for (const r of dist) total[r] += 1;
  const dead: Record<Role, number> = { lord: 0, loyalist: 0, rebel: 0, spy: 0 };
  for (const p of state.players) if (!p.alive) dead[p.role] += 1;
  const order: Role[] = ['lord', 'loyalist', 'rebel', 'spy'];
  const chips: ReactNode[] = [];
  for (const r of order) {
    const alive = total[r] - dead[r];
    for (let i = 0; i < total[r]; i++) {
      chips.push(
        <span key={`${r}-${i}`} className={`role role-${r}${i >= alive ? ' role-out' : ''}`}>
          {ROLE_NAMES[r]}
        </span>,
      );
    }
  }
  return (
    <div className="role-dist">
      <span className="role-dist-label">身份</span>
      {chips}
    </div>
  );
}

type ActiveSkill =
  | 'rende' | 'wusheng' | 'zhiheng' | 'qixi' | 'lijian' | 'qingnang'
  | 'longdan' | 'kurou' | 'jieyin' | 'fanjian' | 'guose' | 'zhangba' | 'guhuo'
  | 'qiangxi' | 'quhu' | 'tianyi' | 'lianhuan' | 'huoji' | 'shuangxiong' | 'luanji'
  | 'duanliang' | 'dimeng' | 'jiuchi' | 'luanwu'
  | 'jiushi' | 'xuanhuo' | 'xinzhan' | 'jujian' | 'ganlu' | 'mingce' | 'xianzhen'
  | 'gongxin'
  | 'tiaoxin' | 'jixi' | 'zhijian'
  | 'jrende' | 'jwusheng' | 'yijue' | 'jzhiheng' | 'jkurou' | 'jfanjian'
  | 'jguose' | 'jqingnang' | 'qimou' | 'jijiang';

// 出牌阶段这张牌当前能否直接使用(不含选技能转化的情形):
// 不可用的牌在手牌区置灰,而不是提交后才报错(杀次数已满、满血的桃等)
function playableNow(state: GameState, p: PlayerState, id: number): boolean {
  const c = state.cards[id];
  const skills = GENERALS[p.general].skills as readonly string[];
  let name: CardName = c.name;
  // 武神:红桃手牌均视为杀;禁酒:酒均视为杀
  if (c.suit === 'heart' && skills.includes('wushen')) name = 'sha';
  if (name === 'jiu' && skills.includes('jinjiu')) name = 'sha';
  switch (name) {
    case 'shan':
    case 'wuxie':
      return false; // 只能在响应时打出
    case 'sha':
    case 'huosha':
    case 'leisha':
      if (p.flags.tianyiLose || p.flags.xianzhenLose) return false;
      return shaUsed(p) < shaLimit(state, p);
    case 'tao':
      return p.hp < p.maxHp;
    case 'jiu':
      return !p.flags.jiuUsed;
    default:
      return true;
  }
}

// 蛊惑可声明的牌名(基本牌 + 非延时锦囊)
const GUHUO_NAMES: CardName[] = [
  'sha', 'huosha', 'leisha', 'tao', 'jiu',
  'guohe', 'shunshou', 'wuzhong', 'juedou', 'nanman', 'wanjian', 'wugu',
  'taoyuan', 'jiedao', 'huogong', 'tiesuo',
];

// 按牌名需要的目标数(蛊惑声明与普通出牌共用)
function targetsForName(name: CardName): [number, number] {
  if (['sha', 'huosha', 'leisha'].includes(name)) return [1, 1];
  if (name === 'jiedao') return [2, 2];
  if (name === 'tiesuo') return [0, 2]; // 0 = 重铸
  return ['guohe', 'shunshou', 'juedou', 'lebusishu', 'huogong', 'bingliang'].includes(name)
    ? [1, 1] : [0, 0];
}

// 目标数区间 [min, max]
function targetsNeeded(
  state: GameState, humanId: string, skill: ActiveSkill | null, cardIds: number[],
  declare: CardName | null,
): [number, number] {
  if (skill === 'guhuo') return declare ? targetsForName(declare) : [0, 0];
  if (skill) {
    switch (skill) {
      case 'lijian': return [2, 2];
      case 'zhiheng': return [0, 0];
      case 'jzhiheng': return [0, 0];
      case 'kurou': return [0, 0];
      case 'jkurou': return [0, 0];
      case 'qimou': return [0, 0];
      case 'lianhuan': return [0, 2]; // 0 = 重铸
      case 'luanji': return [0, 0];
      case 'jiuchi': return [0, 0];
      case 'luanwu': return [0, 0];
      case 'jiushi': return [0, 0];
      case 'xinzhan': return [0, 0];
      case 'dimeng': return [2, 2];
      case 'ganlu': return [2, 2];
      case 'mingce': return [2, 2];
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
  return targetsForName(name);
}

// 技能需要选择的牌数:[最少, 最多]
function cardsNeeded(skill: ActiveSkill): [number, number] {
  switch (skill) {
    case 'rende': return [1, 99];
    case 'jrende': return [1, 99];
    case 'zhiheng': return [1, 99];
    case 'jzhiheng': return [1, 99];
    case 'qimou': return [0, 0];
    case 'jieyin': return [2, 2];
    case 'zhangba': return [2, 2];
    case 'luanji': return [2, 2];
    case 'kurou': return [0, 0];
    case 'fanjian': return [0, 0];
    case 'quhu': return [0, 0];
    case 'tianyi': return [0, 0];
    case 'luanwu': return [0, 0];
    case 'jiushi': return [0, 0];
    case 'xinzhan': return [0, 0];
    case 'ganlu': return [0, 0];
    case 'xianzhen': return [0, 0];
    case 'gongxin': return [0, 0];
    case 'tiaoxin': return [0, 0];
    case 'jijiang': return [0, 0];
    case 'jujian': return [1, 3];
    case 'qiangxi': return [0, 1]; // 可选:弃一张武器牌代替失去体力
    case 'dimeng': return [0, 99]; // 需弃两者手牌数之差的牌
    default: return [1, 1];
  }
}

// 确认按钮文案随所选动作变化(铁索无目标=重铸,技能显示技能名)
function confirmLabel(
  state: GameState, skill: ActiveSkill | null, cardIds: number[], targets: string[],
): string {
  if (skill) return `发动${SKILL_NAMES[skill]}`;
  if (cardIds.length === 1) {
    const name = state.cards[cardIds[0]].name;
    if (name === 'tiesuo' && targets.length === 0) return '重铸';
    if (name === 'jiu') return '使用酒';
  }
  return '出牌';
}

function multiSelect(skill: ActiveSkill | null): boolean {
  return skill === 'rende' || skill === 'jrende'
    || skill === 'zhiheng' || skill === 'jzhiheng' || skill === 'jieyin'
    || skill === 'zhangba' || skill === 'luanji' || skill === 'dimeng'
    || skill === 'jujian';
}

// ---------- 指向箭头:出牌/技能指定目标时,从来源座位画箭头到目标座位 ----------

interface ArrowLine { x1: number; y1: number; x2: number; y2: number }

// 从事件里提取"来源 → 目标"关系(排除指向自己)
function arrowFromEvent(ev: GameState['eventLog'][number]): { source: PlayerId; targets: PlayerId[] } | null {
  let source: PlayerId;
  let targets: PlayerId[];
  if (ev.type === 'cardPlayed' || ev.type === 'virtualCard') {
    source = ev.player;
    targets = ev.targets;
  } else if (ev.type === 'targeted') {
    source = ev.source;
    targets = ev.targets;
  } else {
    return null;
  }
  const others = targets.filter((t) => t !== source);
  return others.length > 0 ? { source, targets: others } : null;
}

function useTargetArrows(state: GameState): {
  boardRef: React.RefObject<HTMLDivElement>;
  arrows: { key: number; lines: ArrowLine[] } | null;
} {
  const boardRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(0);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arrows, setArrows] = useState<{ key: number; lines: ArrowLine[] } | null>(null);

  useEffect(() => () => {
    if (hideRef.current) clearTimeout(hideRef.current);
  }, []);

  useEffect(() => {
    const log = state.eventLog;
    const from = Math.max(seenRef.current, log.length - 12); // 初次挂载不回放旧箭头
    seenRef.current = log.length;
    let found: { key: number; source: PlayerId; targets: PlayerId[] } | null = null;
    for (let i = from; i < log.length; i++) {
      const a = arrowFromEvent(log[i]);
      if (a) found = { key: i, ...a };
    }
    if (!found) return;
    const info = found;
    // 等 DOM 更新后再量座位位置
    const raf = requestAnimationFrame(() => {
      const board = boardRef.current;
      if (!board) return;
      const boardRect = board.getBoundingClientRect();
      const center = (pid: PlayerId) => {
        const el = board.querySelector(`[data-pid="${pid}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - boardRect.left, y: r.top + r.height / 2 - boardRect.top };
      };
      const src = center(info.source);
      if (!src) return;
      const lines: ArrowLine[] = [];
      for (const t of info.targets) {
        const dst = center(t);
        if (!dst) continue;
        const dx = dst.x - src.x;
        const dy = dst.y - src.y;
        const len = Math.hypot(dx, dy) || 1;
        // 两端各缩进一段,避免箭头压在头像正中
        const pad1 = Math.min(30, len / 4);
        const pad2 = Math.min(48, len / 3);
        lines.push({
          x1: src.x + (dx / len) * pad1,
          y1: src.y + (dy / len) * pad1,
          x2: dst.x - (dx / len) * pad2,
          y2: dst.y - (dy / len) * pad2,
        });
      }
      if (lines.length > 0) {
        setArrows({ key: info.key, lines });
        if (hideRef.current) clearTimeout(hideRef.current);
        hideRef.current = setTimeout(() => setArrows(null), 1400);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [state.eventLog.length, state.eventLog]);

  return { boardRef, arrows };
}

export function GameBoard({
  state, humanId, submit, submitDefault, toast, overContent, onExit, trust,
}: {
  state: GameState;
  humanId: PlayerId;
  submit: (resp: ResponseData) => void;
  submitDefault: () => void;
  toast: string | null;
  overContent: ReactNode;
  onExit?: () => void;
  trust?: { on: boolean; seats: number[]; onToggle: () => void }; // 仅联机:托管开关与各座托管状态
}) {
  const [selCards, setSelCards] = useState<number[]>([]);
  const [selSkill, setSelSkill] = useState<ActiveSkill | null>(null);
  const [selTargets, setSelTargets] = useState<PlayerId[]>([]);
  const [selDeclare, setSelDeclare] = useState<CardName | null>(null);

  const req = state.pendingRequest;
  const isMyPlay = req?.type === 'play' && req.player === humanId && !state.winner;
  const needDialog = req && req.player === humanId && req.type !== 'play' && !state.winner;

  const resetSelection = useCallback(() => {
    setSelCards([]);
    setSelSkill(null);
    setSelTargets([]);
    setSelDeclare(null);
  }, []);

  useEffect(() => {
    resetSelection();
  }, [req?.id, resetSelection]);

  // 音效与特效调度:扫描新出现的事件,派发卡牌/技能/阵亡语音、受伤音效
  // 与座位特效(帧动画)。人声每批只播一条(技能台词优先于报牌名)。
  const voicedRef = useRef(0);
  const fxKeyRef = useRef(1);
  const [fxList, setFxList] = useState<{ key: number; pid: PlayerId; name: string }[]>([]);
  const removeFx = useCallback((key: number) => {
    setFxList((cur) => cur.filter((x) => x.key !== key));
  }, []);
  useEffect(() => {
    const from = voicedRef.current;
    voicedRef.current = state.eventLog.length;
    if (from === 0) return; // 初次挂载不补播历史
    const sound = loadSettings().cardVoice;
    let cardLine: { name: CardName; pid: PlayerId } | null = null;
    let skillLine: { skill: string; pid: PlayerId } | null = null;
    const fx: { key: number; pid: PlayerId; name: string }[] = [];
    const burst = (pid: PlayerId, name: string) => {
      if (FX_FRAMES[name] && fx.length < 6) fx.push({ key: fxKeyRef.current++, pid, name });
    };
    for (let i = from; i < state.eventLog.length; i++) {
      const ev = state.eventLog[i];
      if (ev.type === 'cardPlayed' || ev.type === 'cardResponded' || ev.type === 'virtualCard') {
        const name = ev.type === 'virtualCard' ? ev.as : ev.as ?? state.cards[ev.cardId]?.name;
        if (!name) continue;
        cardLine = { name, pid: ev.player };
        const targets = ev.type === 'cardResponded' ? [] : ev.targets;
        // 出牌类特效
        if (isShaCard(name)) {
          const suit = ev.type !== 'virtualCard' ? state.cards[ev.cardId]?.suit : undefined;
          const slashFx = name === 'huosha' ? 'fire_slash'
            : name === 'leisha' ? 'thunder_slash'
              : suit && (suit === 'heart' || suit === 'diamond') ? 'slash_red' : 'slash_black';
          for (const t of targets) burst(t, slashFx);
          // 武器特效:攻击者带着有专属特效的武器出杀
          const who = state.players.find((x) => x.id === ev.player);
          const wid = who?.equips.weapon;
          if (wid !== undefined) burst(ev.player, state.cards[wid].name);
        } else if (name === 'shan') {
          burst(ev.player, 'jink');
        } else if (name === 'tao') {
          burst(ev.player, 'peach');
        } else if (name === 'jiu') {
          burst(ev.player, 'analeptic');
        } else if (name === 'wuxie') {
          burst(ev.player, 'skill_nullify');
        } else if (name === 'juedou') {
          for (const t of targets) burst(t, 'duel');
        } else if (name === 'tiesuo') {
          for (const t of targets) burst(t, 'chain');
        }
      } else if (ev.type === 'damage') {
        burst(ev.target, 'damage');
        if (sound) playSystemSound(`injure${1 + Math.floor(Math.random() * 3)}`);
      } else if (ev.type === 'skillInvoked') {
        skillLine = { skill: ev.skill, pid: ev.player };
        // 防具特效
        if (ev.skill === 'bagua' || ev.skill === 'bazhen') burst(ev.player, 'baguazhen');
        else if (ev.skill === 'tengjia') burst(ev.player, 'tengjia');
      } else if (ev.type === 'playerDied') {
        const who = state.players.find((x) => x.id === ev.player);
        if (sound && who) playDeathVoice(who.general);
        skillLine = null; // 阵亡语音优先,本批不再叠技能台词
        cardLine = null;
      } else if (ev.type === 'chained' && ev.chained) {
        burst(ev.player, 'chain');
      }
    }
    if (fx.length > 0) setFxList((cur) => [...cur.slice(-8), ...fx]);
    if (!sound) return;
    if (skillLine) {
      playSkillVoice(skillLine.skill, SKILL_NAMES[skillLine.skill as never] ?? skillLine.skill);
    } else if (cardLine) {
      const who = state.players.find((x) => x.id === cardLine!.pid);
      playCardVoice(
        cardLine.name,
        CARD_NAMES[cardLine.name] ?? cardLine.name,
        who ? GENERALS[who.general].gender : 'm',
      );
    }
  }, [state]);

  // 终局音效:胜利/失败各播一次
  const winPlayedRef = useRef(false);
  useEffect(() => {
    if (!state.winner || winPlayedRef.current) return;
    winPlayedRef.current = true;
    if (!loadSettings().cardVoice) return;
    const meWin = state.winner.includes(state.players.find((p) => p.id === humanId)!.role);
    playSystemSound(meWin ? 'win' : 'lose', 0.6);
  }, [state.winner, state.players, humanId]);

  const human = state.players.find((p) => p.id === humanId)!;
  const [needMin, needMax] = targetsNeeded(state, humanId, selSkill, selCards, selDeclare);
  const { boardRef, arrows } = useTargetArrows(state);

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
      submit({
        kind: 'use-skill', skill: selSkill as SkillName, cardIds: selCards, targets: selTargets,
        ...(selSkill === 'guhuo' && selDeclare ? { declare: selDeclare } : {}),
      });
    } else if (selCards.length === 1) {
      submit({ kind: 'play-card', cardId: selCards[0], targets: selTargets });
    }
  };

  const canConfirm = isMyPlay
    && (selSkill
      ? selCards.length >= cardsNeeded(selSkill)[0] && selCards.length <= cardsNeeded(selSkill)[1]
      : selCards.length === 1)
    && (selSkill !== 'guhuo' || selDeclare !== null)
    && selTargets.length >= needMin && selTargets.length <= needMax;

  const weaponId = human.equips.weapon;
  const hasZhangba = weaponId !== undefined && state.cards[weaponId].name === 'zhangba';
  // 化身声明的技能若是主动技(在任意武将的 activeSkills 里出现过),也提供按钮
  const huashenActive = human.huashenSkill !== undefined
    && Object.values(GENERALS).some((g) => (g.activeSkills as string[]).includes(human.huashenSkill!))
    ? [human.huashenSkill as ActiveSkill]
    : [];
  const activeSkills: ActiveSkill[] = [
    ...(GENERALS[human.general].activeSkills as ActiveSkill[]),
    ...huashenActive,
    ...(hasZhangba ? (['zhangba'] as ActiveSkill[]) : []),
  ];
  const skillDisabled = (sk: ActiveSkill): boolean => {
    switch (sk) {
      case 'zhiheng': return !!human.flags.zhiheng;
      case 'qingnang': return !!human.flags.qingnang;
      case 'lijian': return !!human.flags.lijian;
      case 'jieyin': return !!human.flags.jieyin;
      case 'fanjian': return !!human.flags.fanjian;
      case 'qiangxi': return !!human.flags.qiangxi;
      case 'quhu': return !!human.flags.quhu;
      case 'tianyi': return !!human.flags.tianyi;
      case 'dimeng': return !!human.flags.dimeng;
      case 'luanwu': return (human.usedLimit ?? []).includes('luanwu');
      case 'xuanhuo': return !!human.flags.xuanhuo;
      case 'xinzhan': return !!human.flags.xinzhan;
      case 'jujian': return !!human.flags.jujian;
      case 'ganlu': return !!human.flags.ganlu;
      case 'mingce': return !!human.flags.mingce;
      case 'xianzhen': return !!human.flags.xianzhenUsed;
      case 'gongxin':
        return !!human.flags.gongxin
          || (GENERALS[human.general].skills.includes('qinxue')
            && !(human.usedLimit ?? []).includes('qinxue'));
      case 'jiushi': return !!human.flags.jiuUsed || !!human.flipped;
      case 'shuangxiong': return typeof human.flags.shuangxiong !== 'number';
      case 'tiaoxin': return !!human.flags.tiaoxin;
      case 'jixi':
        return !(human.usedLimit ?? []).includes('zaoxian') || (human.tian?.length ?? 0) === 0;
      case 'jzhiheng': return !!human.flags.zhiheng;
      case 'jkurou': return !!human.flags.jkurou;
      case 'jfanjian': return !!human.flags.fanjian;
      case 'jguose': return !!human.flags.guose;
      case 'yijue': return !!human.flags.yijue;
      case 'jqingnang': return !!human.flags.qingnangOff;
      case 'qimou': return (human.usedLimit ?? []).includes('qimou');
      case 'jijiang':
        return human.role !== 'lord'
          || shaUsed(human) >= shaLimit(state, human)
          || !state.players.some(
            (x) => x.alive && x.id !== human.id
              && (x.faction ?? GENERALS[x.general].faction) === 'shu');
      default: return false;
    }
  };

  // 出牌展示板:最近一条卡牌事件(带动画,方便看清场上局势)
  let billboard: { key: number; text: string; cardId?: number } | null = null;
  for (let i = state.eventLog.length - 1; i >= 0 && i >= state.eventLog.length - 12; i--) {
    const ev = state.eventLog[i];
    if (ev.type === 'cardPlayed' || ev.type === 'cardResponded'
        || ev.type === 'judge' || ev.type === 'cardRevealed') {
      billboard = { key: i, text: describeEvent(state, ev, humanId) ?? '', cardId: ev.cardId };
      break;
    }
    if (ev.type === 'damage' || ev.type === 'nullified' || ev.type === 'phaseSkipped') {
      billboard = { key: i, text: describeEvent(state, ev, humanId) ?? '' };
      break;
    }
  }

  // 其他角色按座次(从下家开始)围桌摆放:右侧自下而上 → 顶部从右到左 →
  // 左侧自上而下,上家落在你的左手边,左右相邻即座次相邻
  const otherSeats = state.players
    .filter((p) => p.id !== humanId)
    .sort((a, b) => {
      const da = (a.seat - human.seat + state.players.length) % state.players.length;
      const db = (b.seat - human.seat + state.players.length) % state.players.length;
      return da - db;
    })
    .map((p) => p.id);
  const sideCount = Math.floor(otherSeats.length / 3);
  const rightSeats = otherSeats.slice(0, sideCount).reverse(); // DOM 自上而下,下家在最下
  const topSeats = otherSeats.slice(sideCount, otherSeats.length - sideCount).reverse(); // 从右到左
  const leftSeats = otherSeats.slice(otherSeats.length - sideCount); // 自上而下,上家在最下

  const renderSeat = (pid: PlayerId) => (
    <Seat
      key={pid}
      state={state}
      pid={pid}
      humanId={humanId}
      targetable={isMyPlay && needMax > 0 && state.players.find((p) => p.id === pid)!.alive}
      targeted={selTargets.includes(pid)}
      onTarget={() => toggleTarget(pid)}
      fx={fxList.filter((x) => x.pid === pid)}
      onFxDone={removeFx}
      trusted={trust?.seats.includes(state.players.find((p) => p.id === pid)!.seat)}
    />
  );

  return (
    <div className="app">
      <div className="board" ref={boardRef}>
        {arrows && (
          <svg className="arrow-layer" key={arrows.key}>
            <defs>
              <marker
                id="arrow-head" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#e0b84a" />
              </marker>
            </defs>
            {arrows.lines.map((l, i) => (
              <line
                key={i}
                className="arrow-line"
                x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                markerEnd="url(#arrow-head)"
              />
            ))}
          </svg>
        )}
        <div className="table-grid">
          <div className="seats-side seats-left">
            {leftSeats.map(renderSeat)}
          </div>
          <div className="table-mid">
            <div
              className="seats-topline"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, topSeats.length)}, minmax(0, 1fr))` }}
            >
              {topSeats.map(renderSeat)}
            </div>
            <div className="table-center">
              <div className="table-stats">
                <span>牌堆 {state.drawPile.length}</span>
                <span>弃牌堆 {state.discardPile.length}</span>
                {state.discardPile.slice(-3).map((id) => (
                  <CardChip key={id} state={state} cardId={id} small />
                ))}
              </div>
              {billboard && (
                <div className="billboard" key={billboard.key}>
                  {billboard.cardId !== undefined && billboard.cardId > 0 && (
                    <CardChip state={state} cardId={billboard.cardId} />
                  )}
                  <span className="billboard-text">{billboard.text}</span>
                </div>
              )}
              {state.wugu && (
                <div className="wugu-board">
                  <span className="wugu-title">五谷丰登</span>
                  {state.wugu.cardIds.map((id) => {
                    const taker = state.wugu!.taken[id];
                    return (
                      <div key={id} className="wugu-slot">
                        <CardChip state={state} cardId={id} dimmed={taker !== undefined} />
                        <span className="wugu-taker">
                          {taker ? playerLabel(state, taker, humanId) : ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="seats-side seats-right">
            {rightSeats.map(renderSeat)}
          </div>
        </div>

        <div className="human-area">
          <Seat
            state={state}
            pid={humanId}
            humanId={humanId}
            targetable={false}
            targeted={selTargets.includes(humanId)}
            selectedCards={selCards}
            fx={fxList.filter((x) => x.pid === humanId)}
            onFxDone={removeFx}
            trusted={trust?.seats.includes(human.seat)}
            onEquipClick={
              isMyPlay && (selSkill === 'zhiheng' || selSkill === 'jzhiheng'
                || selSkill === 'lijian'
                || selSkill === 'guose' || selSkill === 'jguose'
                || selSkill === 'qiangxi' || selSkill === 'dimeng'
                || selSkill === 'jujian' || selSkill === 'mingce'
                || selSkill === 'jkurou' || selSkill === 'yijue' || selSkill === 'jwusheng')
                ? toggleCard
                : undefined
            }
          />
          <div className="human-main">
            <div className="hand">
              {human.hand.map((id) => {
                // 选中技能时任何牌都可作为技能素材;否则按当前可用性置灰
                const dead = isMyPlay && !selSkill && !playableNow(state, human, id);
                return (
                  <CardChip
                    key={id}
                    state={state}
                    cardId={id}
                    selected={selCards.includes(id)}
                    onClick={isMyPlay && !dead ? () => toggleCard(id) : undefined}
                    disabled={!isMyPlay || dead}
                    dimmed={dead}
                  />
                );
              })}
              {human.hand.length === 0 && <span className="dialog-hint">没有手牌</span>}
            </div>
            {selSkill === 'jixi' && (human.tian?.length ?? 0) > 0 && (
              <div className="hand">
                <span className="dialog-hint">田:</span>
                {human.tian!.map((id) => (
                  <CardChip
                    key={id}
                    state={state}
                    cardId={id}
                    selected={selCards.includes(id)}
                    onClick={isMyPlay ? () => toggleCard(id) : undefined}
                  />
                ))}
              </div>
            )}
            {selSkill === 'guhuo' && (
              <div className="actions">
                <span className="dialog-hint">声明:</span>
                {GUHUO_NAMES.map((n) => (
                  <button
                    key={n}
                    className={selDeclare === n ? 'btn btn-skill btn-skill-on' : 'btn btn-skill'}
                    onClick={() => { setSelDeclare(n); setSelTargets([]); }}
                  >
                    {CARD_NAMES[n]}
                  </button>
                ))}
              </div>
            )}
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
                    setSelDeclare(null);
                  }}
                >
                  {SKILL_NAMES[sk as SkillName]}
                </button>
              ))}
              <button className="btn btn-primary" disabled={!canConfirm} onClick={confirm}>
                {confirmLabel(state, selSkill, selCards, selTargets)}
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

      <div className="side">
        <div className="side-top">
          <RoleDist state={state} />
        </div>
        <Log state={state} humanId={humanId} />
      </div>

      <div className="corner-btns">
        {trust && (
          <button
            className={trust.on ? 'btn btn-mini btn-trust-on' : 'btn btn-mini'}
            onClick={trust.onToggle}
            title={trust.on ? '收回操作权,自己继续玩' : '暂时把操作权交给 AI(仍留在房间)'}
          >
            {trust.on ? '取消托管' : '托管'}
          </button>
        )}
        <BgmToggle />
        {onExit && (
          <button
            className="btn btn-mini btn-exit"
            onClick={() => {
              if (window.confirm('确定退出当前对局吗?')) onExit();
            }}
          >
            退出
          </button>
        )}
      </div>

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
