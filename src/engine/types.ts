// 引擎公共类型。整个 GameState 必须可被 JSON.stringify 完整序列化:
// 只允许纯数据(number/string/boolean/null/数组/普通对象),禁止函数、类实例、Map/Set。

export type PlayerId = string; // 'p0' | 'p1' | 'p2' | 'p3'
export type CardId = number;

export type Suit = 'spade' | 'heart' | 'club' | 'diamond';

export type CardName =
  | 'sha' | 'shan' | 'tao'
  | 'guohe' | 'shunshou' | 'wuzhong' | 'juedou' | 'wuxie' | 'lebusishu'
  | 'zhugeliannu' | 'qinglongdao' | 'baguazhen' | 'jiama' | 'jianma';

export interface Card {
  id: CardId;
  name: CardName;
  suit: Suit;
  rank: number; // 1~13
}

export type Role = 'lord' | 'loyalist' | 'rebel' | 'spy';
export type Phase = 'start' | 'judge' | 'draw' | 'play' | 'discard' | 'end';
export type EquipSlot = 'weapon' | 'armor' | 'horsePlus' | 'horseMinus';

export type GeneralId =
  // 初始 8 将
  | 'liubei' | 'guanyu' | 'caocao' | 'simayi'
  | 'sunquan' | 'ganning' | 'diaochan' | 'huatuo'
  // 标准包补全
  | 'xiahoudun' | 'zhangliao' | 'xuchu' | 'guojia' | 'zhenji'
  | 'zhangfei' | 'zhugeliang' | 'zhaoyun' | 'machao' | 'huangyueying'
  | 'lvmeng' | 'huanggai' | 'zhouyu' | 'daqiao' | 'luxun' | 'sunshangxiang'
  | 'lvbu';

export type SkillName =
  | 'rende' | 'wusheng' | 'jianxiong' | 'fankui' | 'guicai'
  | 'zhiheng' | 'jiuyuan' | 'qixi' | 'lijian' | 'biyue'
  | 'jijiu' | 'qingnang' | 'bagua' | 'qinglong'
  | 'ganglie' | 'tuxi' | 'luoyi' | 'tiandu' | 'yiji' | 'luoshen' | 'qingguo'
  | 'paoxiao' | 'guanxing' | 'kongcheng' | 'longdan' | 'mashu' | 'tieji'
  | 'jizhi' | 'qicai'
  | 'keji' | 'kurou' | 'yingzi' | 'fanjian' | 'guose' | 'liuli'
  | 'qianxun' | 'lianying' | 'jieyin' | 'xiaoji'
  | 'wushuang';

export interface PlayerState {
  id: PlayerId;
  seat: number;
  general: GeneralId;
  role: Role;
  roleRevealed: boolean;
  maxHp: number;
  hp: number;
  alive: boolean;
  hand: CardId[];
  equips: Partial<Record<EquipSlot, CardId>>;
  judgeZone: CardId[]; // 延时锦囊(乐不思蜀),后放置的先结算
  flags: Record<string, number | boolean>; // 回合内计数,回合结束清空
}

export interface ZoneRef {
  zone: 'hand' | 'equip' | 'judge' | 'processing' | 'discard' | 'draw';
  player?: PlayerId;
}

// ---------- 结算栈帧:多步结算的可序列化上下文 ----------
// 约定:子帧结束时把结果写入其下方一帧的 childResult。

export interface SlashFrame {
  type: 'slash';
  step: 'start' | 'liuli-wait' | 'liuli-cards' | 'liuli-player'
      | 'tieji' | 'tieji-wait' | 'tieji-judged'
      | 'cycle' | 'bagua-wait' | 'bagua-judged' | 'ask-shan' | 'shan-wait'
      | 'dodged' | 'qinglong-wait' | 'hit' | 'finish';
  source: PlayerId;
  target: PlayerId;
  cardId: CardId;
  dodgesNeeded?: number;   // 无双 = 2
  dodgesGot?: number;
  noDodge?: boolean;       // 铁骑判红:不能闪
  liuliDone?: boolean;
  tiejiDone?: boolean;
  liuliCard?: CardId;
  childResult?: { cardId: CardId };
}

export interface DamageFrame {
  type: 'damage';
  step: 'apply' | 'post' | 'jianxiong-wait' | 'fankui-wait' | 'fankui-pick'
      | 'ganglie-wait' | 'ganglie-judged' | 'ganglie-choice' | 'ganglie-discard'
      | 'yiji-wait' | 'yiji-cards' | 'yiji-player';
  source: PlayerId | null;
  target: PlayerId;
  amount: number;
  causeCardIds: CardId[];
  causeKind?: 'sha' | 'duel';
  jxAsked?: boolean;
  fkAsked?: boolean;
  glAsked?: boolean;
  yijiTimes?: number;      // 遗计剩余触发次数(每点伤害一次)
  yijiDrawn?: CardId[];    // 本次遗计摸到且尚未分配的牌
  yijiPicked?: CardId[];
  childResult?: { cardId: CardId };
}

export interface DyingFrame {
  type: 'dying';
  step: 'ask' | 'wait';
  who: PlayerId;
  source: PlayerId | null;
  queue: PlayerId[];
  idx: number;
}

export interface JudgeFrame {
  type: 'judge';
  step: 'flip' | 'guicai' | 'guicai-wait';
  player: PlayerId;
  reason: 'bagua' | 'ganglie' | 'tieji' | 'luoshen' | 'lebusishu';
  cardId?: CardId;
  queue?: PlayerId[];
  idx?: number;
}

export interface WuxieFrame {
  type: 'wuxie';
  step: 'ask' | 'wait';
  negated: boolean;
  queue?: PlayerId[];
  idx: number;
  info: { cardName: CardName; source: PlayerId; target: PlayerId };
}

export interface TrickFrame {
  type: 'trick';
  step: 'start' | 'after-wuxie' | 'pick-wait' | 'after-duel';
  cardId: CardId | null; // null = 技能视为使用(如离间的决斗)
  effName: 'guohe' | 'shunshou' | 'wuzhong' | 'juedou';
  source: PlayerId;
  target: PlayerId;
  childResult?: { negated: boolean };
}

export interface DuelFrame {
  type: 'duel';
  step: 'ask' | 'wait' | 'done';
  cardId: CardId | null;
  a: PlayerId; // 决斗发起者
  b: PlayerId;
  turn: PlayerId; // 当前需要打出杀的一方,从 b 开始
  remaining?: number; // 无双:本轮还需打出的杀数
}

export interface GuanxingFrame {
  type: 'guanxing';
  step: 'ask' | 'wait' | 'arrange-wait';
  player: PlayerId;
  cardIds?: CardId[];
}

export interface LuoshenFrame {
  type: 'luoshen';
  step: 'ask' | 'wait' | 'judged';
  player: PlayerId;
  childResult?: { cardId: CardId };
}

export interface DrawStepFrame {
  type: 'draw-step';
  step: 'ask' | 'tuxi-wait' | 'luoyi-wait' | 'tuxi-players';
  player: PlayerId;
}

export interface DelayedFrame {
  type: 'delayed';
  step: 'next' | 'after-wuxie' | 'judged';
  who: PlayerId;
  queue: CardId[];
  current?: CardId;
  childResult?: { negated?: boolean; cardId?: CardId };
}

export interface KurouFrame {
  type: 'kurou';
  step: 'draw';
  player: PlayerId;
}

export interface FanjianFrame {
  type: 'fanjian';
  step: 'suit-wait' | 'reveal';
  source: PlayerId;
  target: PlayerId;
  suit?: Suit;
}

export type EffectFrame =
  | SlashFrame | DamageFrame | DyingFrame | JudgeFrame
  | WuxieFrame | TrickFrame | DuelFrame
  | GuanxingFrame | LuoshenFrame | DrawStepFrame | DelayedFrame
  | KurouFrame | FanjianFrame;

// ---------- 请求-响应 ----------

export interface RequestReason {
  kind: 'slash' | 'duel' | 'qinglong' | 'dying' | 'nullify' | 'discard' | 'guicai'
      | 'liuli' | 'ganglie-discard' | 'yiji' | 'tuxi';
  source?: PlayerId;
  target?: PlayerId;
  who?: PlayerId;
  cardName?: CardName;
  negated?: boolean;
}

export type OptionReason =
  | 'bagua' | 'jianxiong' | 'fankui'
  | 'liuli' | 'tieji' | 'ganglie' | 'ganglie-choice'
  | 'yiji' | 'luoshen' | 'guanxing' | 'tuxi' | 'luoyi' | 'fanjian-suit';

export type PendingRequest =
  | { id: number; player: PlayerId; type: 'play' }
  | { id: number; player: PlayerId; type: 'respond-card';
      pattern: 'shan' | 'sha' | 'tao' | 'wuxie';
      canDecline: true; reason: RequestReason }
  | { id: number; player: PlayerId; type: 'choose-cards';
      from: 'hand' | 'hand-equips'; min: number; max: number;
      canDecline: boolean; reason: RequestReason }
  | { id: number; player: PlayerId; type: 'choose-option';
      options: string[]; canDecline: boolean;
      reason: OptionReason }
  | { id: number; player: PlayerId; type: 'choose-player';
      min: number; max: number; candidates: PlayerId[];
      canDecline: boolean; reason: RequestReason }
  | { id: number; player: PlayerId; type: 'arrange-cards';
      cardIds: CardId[]; reason: 'guanxing' }
  | { id: number; player: PlayerId; type: 'pick-card';
      target: PlayerId; handCount: number; equips: CardId[]; judges: CardId[];
      reason: 'guohe' | 'shunshou' | 'fankui' };

export type ResponseData =
  | { kind: 'play-card'; cardId: CardId; targets: PlayerId[] }
  | { kind: 'use-skill'; skill: SkillName; cardIds?: CardId[]; targets?: PlayerId[] }
  | { kind: 'end-phase' }
  | { kind: 'card'; cardId: CardId; skill?: 'wusheng' | 'jijiu' | 'longdan' | 'qingguo' }
  | { kind: 'cards'; cardIds: CardId[] }                          // 应答 choose-cards
  | { kind: 'option'; index: number }                             // 应答 choose-option
  | { kind: 'players'; players: PlayerId[] }                      // 应答 choose-player
  | { kind: 'arrange'; top: CardId[]; bottom: CardId[] }          // 应答 arrange-cards
  | { kind: 'pick'; zone: 'hand' | 'equip' | 'judge'; cardId?: CardId }
  | { kind: 'decline' };

export interface Action {
  player: PlayerId;
  requestId: number;
  response: ResponseData;
}

// ---------- 事件(引擎输出,供 UI 动画与日志) ----------

export type GameEvent =
  | { type: 'turnStarted'; player: PlayerId; turnNumber: number }
  | { type: 'phaseChanged'; player: PlayerId; phase: Phase }
  | { type: 'phaseSkipped'; player: PlayerId; phase: Phase; reason: string }
  | { type: 'cardPlayed'; player: PlayerId; cardId: CardId; targets: PlayerId[]; as?: CardName }
  | { type: 'cardResponded'; player: PlayerId; cardId: CardId; as?: CardName }
  | { type: 'cardsMoved'; cardIds: CardId[]; from: ZoneRef; to: ZoneRef; reason?: string }
  | { type: 'damage'; source: PlayerId | null; target: PlayerId; amount: number }
  | { type: 'hpChanged'; player: PlayerId; hp: number; delta: number }
  | { type: 'judge'; player: PlayerId; cardId: CardId; reason: string }
  | { type: 'skillInvoked'; player: PlayerId; skill: SkillName }
  | { type: 'nullified'; cardName: CardName; target: PlayerId }
  | { type: 'reshuffled' }
  | { type: 'cardRevealed'; player: PlayerId; cardId: CardId; reason: string }
  | { type: 'playerDied'; player: PlayerId; role: Role; killer: PlayerId | null }
  | { type: 'gameOver'; winner: Role[] };

// ---------- GameState ----------

export interface GameState {
  rngState: number;
  players: PlayerState[]; // 按座次
  cards: Record<CardId, Card>;
  drawPile: CardId[]; // 索引 0 为牌堆顶
  discardPile: CardId[];
  processingZone: CardId[];
  turn: { activePlayer: PlayerId; phase: Phase; turnNumber: number };
  stack: EffectFrame[];
  pendingRequest: PendingRequest | null;
  nextRequestId: number;
  winner: Role[] | null;
  eventLog: GameEvent[];
}

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}
