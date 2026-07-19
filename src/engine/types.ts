// 引擎公共类型。整个 GameState 必须可被 JSON.stringify 完整序列化:
// 只允许纯数据(number/string/boolean/null/数组/普通对象),禁止函数、类实例、Map/Set。

export type PlayerId = string; // 'p0' | 'p1' | 'p2' | 'p3'
export type CardId = number;

export type Suit = 'spade' | 'heart' | 'club' | 'diamond';

export type CardName =
  | 'sha' | 'huosha' | 'leisha' | 'shan' | 'tao' | 'jiu'
  | 'guohe' | 'shunshou' | 'wuzhong' | 'juedou' | 'wuxie'
  | 'nanman' | 'wanjian' | 'wugu' | 'taoyuan' | 'jiedao'
  | 'huogong' | 'tiesuo'
  | 'lebusishu' | 'shandian' | 'bingliang'
  | 'zhugeliannu' | 'qinglongdao' | 'cixiong' | 'hanbing' | 'zhangba'
  | 'guanshi' | 'fangtian' | 'qilin' | 'zhuque' | 'gudingdao'
  | 'baguazhen' | 'renwang' | 'tengjia' | 'baiyin' | 'jiama' | 'jianma';

export type DamageElement = 'fire' | 'thunder';

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
  | 'lvbu'
  // 风包
  | 'xiahouyuan' | 'caoren' | 'huangzhong' | 'weiyan'
  | 'xiaoqiao' | 'zhoutai' | 'zhangjiao' | 'yuji'
  // 火包
  | 'dianwei' | 'xunyu' | 'pangtong' | 'wolong'
  | 'taishici' | 'pangde' | 'yanliangwenchou' | 'yuanshao'
  // 林包
  | 'caopi' | 'xuhuang' | 'menghuo' | 'zhurong'
  | 'lusu' | 'dongzhuo' | 'jiaxu';

export type SkillName =
  | 'rende' | 'wusheng' | 'jianxiong' | 'fankui' | 'guicai'
  | 'zhiheng' | 'jiuyuan' | 'qixi' | 'lijian' | 'biyue'
  | 'jijiu' | 'qingnang' | 'bagua' | 'qinglong'
  | 'ganglie' | 'tuxi' | 'luoyi' | 'tiandu' | 'yiji' | 'luoshen' | 'qingguo'
  | 'paoxiao' | 'guanxing' | 'kongcheng' | 'longdan' | 'mashu' | 'tieji'
  | 'jizhi' | 'qicai'
  | 'keji' | 'kurou' | 'yingzi' | 'fanjian' | 'guose' | 'liuli'
  | 'qianxun' | 'lianying' | 'jieyin' | 'xiaoji'
  | 'wushuang'
  // 武器/防具触发(以技能事件形式记录日志)
  | 'cixiong' | 'hanbing' | 'zhangba' | 'guanshi' | 'fangtian' | 'qilin' | 'renwang'
  | 'tengjia' | 'baiyin' | 'zhuque' | 'gudingdao'
  // 风包
  | 'shensu' | 'jushou' | 'liegong' | 'kuanggu'
  | 'tianxiang' | 'hongyan' | 'buqu' | 'leiji' | 'guidao' | 'guhuo'
  | 'qiangxi' | 'quhu' | 'jieming' | 'lianhuan' | 'niepan'
  | 'bazhen' | 'kanpo' | 'huoji' | 'tianyi' | 'mengjin'
  | 'shuangxiong' | 'luanji' | 'xueyi'
  | 'xingshang' | 'fangzhu' | 'songwei' | 'duanliang'
  | 'huoshou' | 'zaiqi' | 'juxiang' | 'lieren'
  | 'haoshi' | 'dimeng' | 'jiuchi' | 'roulin' | 'benghuai' | 'baonve'
  | 'wansha' | 'luanwu' | 'weimu';

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
  chained?: boolean; // 铁索连环:横置状态,属性伤害解除并传导
  flipped?: boolean; // 武将牌翻面:回合开始时翻回并跳过该回合
  buqu?: CardId[];   // 周泰"不屈"的创牌(明置)
  unpicked?: boolean; // 选将模式:尚未选定武将(general 为占位值)
  usedLimit?: SkillName[]; // 已发动过的限定技(不随回合清空)
  judgeZone: CardId[]; // 延时锦囊,后放置的先结算
  flags: Record<string, number | boolean>; // 回合内计数,回合结束清空
}

export interface ZoneRef {
  zone: 'hand' | 'equip' | 'judge' | 'buqu' | 'processing' | 'discard' | 'draw';
  player?: PlayerId;
}

// ---------- 结算栈帧:多步结算的可序列化上下文 ----------
// 约定:子帧结束时把结果写入其下方一帧的 childResult。

export interface SlashFrame {
  type: 'slash';
  step: 'start' | 'liuli-wait' | 'liuli-cards' | 'liuli-player'
      | 'tieji' | 'tieji-wait' | 'tieji-judged'
      | 'liegong-wait'
      | 'cixiong' | 'cixiong-wait' | 'cixiong-discard'
      | 'cycle' | 'bagua-wait' | 'bagua-judged' | 'ask-shan' | 'shan-wait'
      | 'dodged' | 'mengjin-wait' | 'mengjin-pick'
      | 'guanshi-wait' | 'guanshi-cards' | 'qinglong-wait'
      | 'hit' | 'qilin-wait' | 'hanbing-wait' | 'hanbing-pick1' | 'hanbing-pick2'
      | 'zhuque-wait' | 'do-damage' | 'finish';
  source: PlayerId;
  target: PlayerId;
  cardId: CardId | null;   // null = 视为使用的杀(神速),无实体牌
  lgDone?: boolean;        // 烈弓已询问
  mjDone?: boolean;        // 猛进已询问
  extraCardIds?: CardId[]; // 丈八蛇矛:两张牌当杀,一并进弃牌堆
  noSuit?: boolean;        // 丈八的杀无花色(仁王盾不生效)
  element?: DamageElement; // 火杀/雷杀/朱雀羽扇转化
  jiuBonus?: boolean;      // 酒:此杀伤害 +1
  zqAsked?: boolean;       // 朱雀羽扇已询问
  dodgesNeeded?: number;   // 无双 = 2
  dodgesGot?: number;
  noDodge?: boolean;       // 铁骑判红:不能闪
  liuliDone?: boolean;
  tiejiDone?: boolean;
  cxDone?: boolean;        // 雌雄双股剑已询问
  rwChecked?: boolean;     // 仁王盾已检查
  gsDone?: boolean;        // 贯石斧已询问
  qilinDone?: boolean;
  hanbingDone?: boolean;
  liuliCard?: CardId;
  childResult?: { cardId: CardId };
}

export interface DamageFrame {
  type: 'damage';
  step: 'pre' | 'tianxiang-wait' | 'tianxiang-card' | 'tianxiang-player'
      | 'apply' | 'post' | 'jianxiong-wait' | 'fankui-wait' | 'fankui-pick'
      | 'ganglie-wait' | 'ganglie-judged' | 'ganglie-choice' | 'ganglie-discard'
      | 'kuanggu-wait' | 'jieming-player'
      | 'fangzhu-wait' | 'fangzhu-player' | 'lieren-wait'
      | 'baonve-wait' | 'baonve-judged'
      | 'yiji-wait' | 'yiji-cards' | 'yiji-player';
  source: PlayerId | null;
  target: PlayerId;
  amount: number;
  causeCardIds: CardId[];
  causeKind?: 'sha' | 'duel';
  element?: DamageElement;
  propagated?: boolean;     // 连环传导来的伤害不再二次传导
  spreadTo?: PlayerId[];    // 结算完毕后需传导的连环角色
  jxAsked?: boolean;
  fkAsked?: boolean;
  glAsked?: boolean;
  kgAsked?: boolean;       // 狂骨已询问
  txAsked?: boolean;       // 天香已询问
  txCard?: CardId;         // 天香弃置的红桃牌
  txDraw?: boolean;        // 天香转移来的伤害:结算后按已损失体力摸牌
  jmTimes?: number;        // 节命剩余触发次数(每点伤害一次)
  fzAsked?: boolean;       // 放逐已询问
  lrAsked?: boolean;       // 烈刃已询问
  bnAsked?: boolean;       // 暴虐已询问
  yijiTimes?: number;      // 遗计剩余触发次数(每点伤害一次)
  yijiDrawn?: CardId[];    // 本次遗计摸到且尚未分配的牌
  yijiPicked?: CardId[];
  childResult?: { cardId: CardId };
}

export interface DyingFrame {
  type: 'dying';
  step: 'ask' | 'wait' | 'niepan-wait';
  npAsked?: boolean; // 涅槃已询问
  who: PlayerId;
  source: PlayerId | null;
  queue: PlayerId[];
  idx: number;
}

export interface JudgeFrame {
  type: 'judge';
  step: 'flip' | 'guicai' | 'guicai-wait';
  player: PlayerId;
  reason: 'bagua' | 'ganglie' | 'tieji' | 'luoshen' | 'lebusishu' | 'shandian' | 'bingliang' | 'leiji' | 'shuangxiong' | 'baonve';
  cardId?: CardId;
  queue?: Array<{ pid: PlayerId; skill: 'guicai' | 'guidao' }>;
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
  step: 'ask' | 'tuxi-wait' | 'luoyi-wait' | 'tuxi-players'
      | 'shuangxiong-wait' | 'shuangxiong-judged'
      | 'zaiqi-wait' | 'haoshi-wait' | 'haoshi-cards' | 'haoshi-player';
  player: PlayerId;
  hsCards?: CardId[]; // 好施待送出的手牌
  childResult?: { cardId: CardId };
}

export interface DelayedFrame {
  type: 'delayed';
  step: 'next' | 'after-wuxie' | 'judged' | 'cleanup';
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

// AOE 锦囊:南蛮入侵/万箭齐发/桃园结义/五谷丰登,逐目标结算(每个目标可被无懈)
export interface AoeFrame {
  type: 'aoe';
  step: 'next' | 'after-wuxie' | 'card-wait' | 'pick-wait';
  effName: 'nanman' | 'wanjian' | 'taoyuan' | 'wugu';
  cardId: CardId;
  source: PlayerId;
  queue: PlayerId[];
  idx: number;
  shownIds?: CardId[]; // 五谷丰登亮出的牌
  extraCardIds?: CardId[]; // 乱击:两张牌当万箭,结算后一并弃置
  childResult?: { negated: boolean };
}

export interface JiedaoFrame {
  type: 'jiedao';
  step: 'start' | 'after-wuxie' | 'sha-wait';
  cardId: CardId;
  source: PlayerId;
  a: PlayerId; // 持武器者
  b: PlayerId; // 被指定的杀目标
  childResult?: { negated: boolean };
}

export interface HuogongFrame {
  type: 'huogong';
  step: 'start' | 'after-wuxie' | 'show-wait' | 'match-wait';
  cardId: CardId;
  source: PlayerId;
  target: PlayerId;
  shownCard?: CardId;
  childResult?: { negated: boolean };
}

export interface ShensuFrame {
  type: 'shensu';
  step: 'wait' | 'equip-wait' | 'target-wait';
  player: PlayerId;
  variant: 1 | 2; // 1=跳过判定+摸牌;2=跳过出牌并弃一张装备
}

export interface LeijiFrame {
  type: 'leiji';
  step: 'ask' | 'wait' | 'player-wait' | 'judged';
  player: PlayerId;
  target?: PlayerId;
  childResult?: { cardId: CardId };
}

export interface GuhuoFrame {
  type: 'guhuo';
  step: 'next' | 'challenge-wait' | 'resolve';
  player: PlayerId;
  cardId: CardId;
  declared: CardName;
  targets: PlayerId[];
  queue: PlayerId[];
  idx: number;
  challenger?: PlayerId;
}

export interface JushouFrame {
  type: 'jushou';
  step: 'wait';
  player: PlayerId;
}

// 拼点:双方各选一张手牌比点数,大者胜;结果写入下方帧的 childResult
export interface PindianFrame {
  type: 'pindian';
  step: 'start' | 'a-wait' | 'b-wait';
  a: PlayerId; // 发起者
  b: PlayerId;
  cardA?: CardId;
}

// 驱虎(荀彧):与体力更高者拼点,赢则令其对其攻击范围内一名角色造成伤害
export interface QuhuFrame {
  type: 'quhu';
  step: 'start' | 'pindian-done' | 'victim-wait';
  source: PlayerId;
  target: PlayerId;
  childResult?: { won: boolean };
}

// 天义(太史慈):拼点,赢则本回合杀+1且无距离限制,输则不能使用杀
export interface TianyiFrame {
  type: 'tianyi';
  step: 'start' | 'done';
  source: PlayerId;
  target: PlayerId;
  childResult?: { won: boolean };
}

// 烈刃(祝融):杀造成伤害后拼点,赢则获得目标一张牌
export interface LierenFrame {
  type: 'lieren';
  step: 'start' | 'pindian-done' | 'pick-wait';
  source: PlayerId;
  target: PlayerId;
  childResult?: { won: boolean };
}

// 崩坏(董卓):结束阶段非最低体力时,失去 1 点体力或减 1 点体力上限
export interface BenghuaiFrame {
  type: 'benghuai';
  step: 'wait';
  player: PlayerId;
}

// 乱武(贾诩):限定技,其他角色依次对距离最近者出杀,否则失去 1 点体力
export interface LuanwuFrame {
  type: 'luanwu';
  step: 'next' | 'sha-wait' | 'target-wait';
  source: PlayerId;
  queue: PlayerId[];
  idx: number;
  pendingCard?: CardId; // 已打出待选目标的杀
}

// 开局选将:主公先选,其余角色按座次依次选;全部选定后发起始手牌
export interface ChooseGeneralsFrame {
  type: 'choose-generals';
  step: 'next' | 'wait';
  queue: PlayerId[];
  idx: number;
  candidates: Record<PlayerId, GeneralId[]>;
}

export interface TiesuoFrame {
  type: 'tiesuo';
  step: 'next' | 'after-wuxie';
  cardId: CardId;
  source: PlayerId;
  queue: PlayerId[];
  idx: number;
  childResult?: { negated: boolean };
}

export type EffectFrame =
  | SlashFrame | DamageFrame | DyingFrame | JudgeFrame
  | WuxieFrame | TrickFrame | DuelFrame
  | GuanxingFrame | LuoshenFrame | DrawStepFrame | DelayedFrame
  | KurouFrame | FanjianFrame | AoeFrame | JiedaoFrame
  | HuogongFrame | TiesuoFrame
  | ShensuFrame | LeijiFrame | GuhuoFrame | JushouFrame
  | PindianFrame | QuhuFrame | TianyiFrame
  | LierenFrame | BenghuaiFrame | LuanwuFrame
  | ChooseGeneralsFrame;

// ---------- 请求-响应 ----------

export interface RequestReason {
  kind: 'slash' | 'duel' | 'qinglong' | 'dying' | 'nullify' | 'discard' | 'guicai'
      | 'liuli' | 'ganglie-discard' | 'yiji' | 'tuxi'
      | 'aoe' | 'jiedao' | 'wugu' | 'guanshi-discard' | 'cixiong-discard'
      | 'huogong-show' | 'huogong-match'
      | 'tianxiang' | 'shensu-equip' | 'leiji' | 'guhuo'
      | 'pindian' | 'jieming' | 'quhu'
      | 'fangzhu' | 'haoshi' | 'luanwu';
  source?: PlayerId;
  target?: PlayerId;
  who?: PlayerId;
  cardName?: CardName;
  suit?: Suit;
  negated?: boolean;
}

export type OptionReason =
  | 'bagua' | 'jianxiong' | 'fankui'
  | 'liuli' | 'tieji' | 'ganglie' | 'ganglie-choice'
  | 'yiji' | 'luoshen' | 'guanxing' | 'tuxi' | 'luoyi' | 'fanjian-suit'
  | 'cixiong-choice' | 'guanshi' | 'qilin' | 'hanbing' | 'zhuque'
  | 'shensu1' | 'shensu2' | 'jushou' | 'liegong' | 'kuanggu'
  | 'tianxiang' | 'leiji' | 'guhuo-challenge'
  | 'mengjin' | 'shuangxiong' | 'niepan'
  | 'fangzhu' | 'zaiqi' | 'haoshi' | 'lieren' | 'baonve' | 'benghuai';

export type PendingRequest =
  | { id: number; player: PlayerId; type: 'play' }
  | { id: number; player: PlayerId; type: 'respond-card';
      pattern: 'shan' | 'sha' | 'tao' | 'wuxie';
      canDecline: true; reason: RequestReason }
  | { id: number; player: PlayerId; type: 'choose-cards';
      from: 'hand' | 'hand-equips' | 'shown'; min: number; max: number;
      shownIds?: CardId[]; excludeIds?: CardId[];
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
      reason: 'guohe' | 'shunshou' | 'fankui' | 'hanbing' | 'mengjin' | 'lieren' }
  | { id: number; player: PlayerId; type: 'choose-general';
      candidates: GeneralId[] };

export type ResponseData =
  | { kind: 'play-card'; cardId: CardId; targets: PlayerId[] }
  | { kind: 'use-skill'; skill: SkillName; cardIds?: CardId[]; targets?: PlayerId[];
      declare?: CardName } // 蛊惑声明的牌名
  | { kind: 'end-phase' }
  | { kind: 'card'; cardId: CardId; skill?: 'wusheng' | 'jijiu' | 'longdan' | 'qingguo' | 'kanpo' }
  | { kind: 'cards'; cardIds: CardId[] }                          // 应答 choose-cards
  | { kind: 'option'; index: number }                             // 应答 choose-option
  | { kind: 'players'; players: PlayerId[] }                      // 应答 choose-player
  | { kind: 'arrange'; top: CardId[]; bottom: CardId[] }          // 应答 arrange-cards
  | { kind: 'pick'; zone: 'hand' | 'equip' | 'judge'; cardId?: CardId }
  | { kind: 'general'; general: GeneralId }                       // 应答 choose-general
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
  | { type: 'damage'; source: PlayerId | null; target: PlayerId; amount: number; element?: DamageElement }
  | { type: 'chained'; player: PlayerId; chained: boolean }
  | { type: 'flipped'; player: PlayerId; flipped: boolean }
  | { type: 'virtualCard'; player: PlayerId; as: CardName; targets: PlayerId[] }
  | { type: 'targeted'; source: PlayerId; targets: PlayerId[] } // 指向性技能(无实体牌),供 UI 画箭头
  | { type: 'hpChanged'; player: PlayerId; hp: number; delta: number }
  | { type: 'judge'; player: PlayerId; cardId: CardId; reason: string }
  | { type: 'skillInvoked'; player: PlayerId; skill: SkillName }
  | { type: 'nullified'; cardName: CardName; target: PlayerId }
  | { type: 'reshuffled' }
  | { type: 'cardRevealed'; player: PlayerId; cardId: CardId; reason: string }
  | { type: 'playerDied'; player: PlayerId; role: Role; killer: PlayerId | null }
  | { type: 'generalChosen'; player: PlayerId; general: GeneralId }
  | { type: 'pindian'; a: PlayerId; b: PlayerId; cardA: CardId; cardB: CardId; won: boolean }
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
