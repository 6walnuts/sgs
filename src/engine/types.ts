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
  | 'lusu' | 'sunjian' | 'dongzhuo' | 'jiaxu'
  // 一将成名 2011
  | 'caozhi' | 'zhangchunhua' | 'yujin'
  | 'fazheng' | 'masu' | 'xushu'
  | 'lingtong' | 'xusheng' | 'wuguotai'
  | 'chengong' | 'gaoshun'
  // 神武将(风/林)
  | 'shenguanyu' | 'shenlvmeng' | 'shencaocao'
  // 山包
  | 'dengai' | 'zhanghe' | 'jiangwei' | 'liushan'
  | 'sunce' | 'zhangzhaozhanghong' | 'zuoci' | 'caiwenji'
  // 界限突破(标准 25 将 + 风 8 将,独立武将与原版共存)
  | 'jiecaocao' | 'jiesimayi' | 'jiexiahoudun' | 'jiezhangliao' | 'jiexuchu'
  | 'jieguojia' | 'jiezhenji'
  | 'jieliubei' | 'jieguanyu' | 'jiezhangfei' | 'jiezhugeliang' | 'jiezhaoyun'
  | 'jiemachao' | 'jiehuangyueying'
  | 'jiesunquan' | 'jieganning' | 'jielvmeng' | 'jiehuanggai' | 'jiezhouyu'
  | 'jiedaqiao' | 'jieluxun' | 'jiesunshangxiang'
  | 'jiehuatuo' | 'jielvbu' | 'jiediaochan'
  | 'jiexiahouyuan' | 'jiecaoren' | 'jiehuangzhong' | 'jieweiyan'
  | 'jiexiaoqiao' | 'jiezhoutai' | 'jiezhangjiao' | 'jieyuji';

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
  | 'wansha' | 'luanwu' | 'weimu' | 'yinghun'
  | 'luoying' | 'jiushi' | 'jueqing' | 'shangshi' | 'yizhong'
  | 'enyuan' | 'xuanhuo' | 'xinzhan' | 'huilei' | 'wuyan' | 'jujian'
  | 'xuanfeng' | 'pojun' | 'ganlu' | 'buyi'
  | 'mingce' | 'zhichi' | 'xianzhen' | 'jinjiu'
  | 'wushen' | 'wuhun' | 'shelie' | 'gongxin' | 'guixin' | 'feiying'
  | 'tuntian' | 'zaoxian' | 'jixi' | 'qiaobian' | 'tiaoxin' | 'zhiji'
  | 'xiangle' | 'fangquan' | 'jiang' | 'hunzi'
  | 'zhijian' | 'guzheng' | 'huashen' | 'xinsheng' | 'beige' | 'duanchang'
  // 界限突破(j 前缀 = 对应原技能的界版;新技能用原名)
  | 'jjianxiong' | 'jfankui' | 'jganglie' | 'jtuxi' | 'jluoyi' | 'jluoshen'
  | 'jrende' | 'jwusheng' | 'yijue' | 'jpaoxiao' | 'jguanxing' | 'yajiao'
  | 'jtieji' | 'jjizhi'
  | 'jzhiheng' | 'fenwei' | 'qinxue' | 'jkurou' | 'zhaxiang' | 'jyingzi'
  | 'jfanjian' | 'jguose' | 'jlianying' | 'jxiaoji'
  | 'jqingnang' | 'liyu' | 'jbiyue'
  | 'shensu3' | 'jjushou' | 'jiewei' | 'jliegong' | 'jkuanggu' | 'qimou'
  | 'jtianxiang' | 'fenji' | 'jleiji' | 'jguhuo' | 'chanyuan'
  // 主公技:激将(刘备)/护驾(曹操)
  | 'jijiang' | 'hujia';

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
  faction?: 'wei' | 'shu' | 'wu' | 'qun'; // 神武将登场时自选的势力
  damageTaken?: Record<PlayerId, number>; // 各角色对自己造成过的伤害合计(武魂用)
  tian?: CardId[];          // 邓艾"屯田"的田牌(明置)
  huashen?: GeneralId[];    // 左慈的化身牌(仅自己可见)
  huashenSkill?: SkillName; // 化身当前声明获得的技能(公开)
  skillsLost?: boolean;     // 断肠:失去所有武将技能
  judgeZone: CardId[]; // 延时锦囊,后放置的先结算
  flags: Record<string, number | boolean>; // 回合内计数,回合结束清空
}

export interface ZoneRef {
  zone: 'hand' | 'equip' | 'judge' | 'buqu' | 'tian' | 'processing' | 'discard' | 'draw';
  player?: PlayerId;
}

// ---------- 结算栈帧:多步结算的可序列化上下文 ----------
// 约定:子帧结束时把结果写入其下方一帧的 childResult。

export interface SlashFrame {
  type: 'slash';
  step: 'start' | 'liuli-wait' | 'liuli-cards' | 'liuli-player'
      | 'tieji' | 'tieji-wait' | 'tieji-judged' | 'jtieji-discard'
      | 'liegong-wait'
      | 'cixiong' | 'cixiong-wait' | 'cixiong-discard'
      | 'cycle' | 'bagua-wait' | 'bagua-judged' | 'ask-shan' | 'shan-wait'
      | 'xiangle-wait'
      | 'dodged' | 'mengjin-wait' | 'mengjin-pick'
      | 'guanshi-wait' | 'guanshi-cards' | 'qinglong-wait'
      | 'hit' | 'qilin-wait' | 'hanbing-wait' | 'hanbing-pick1' | 'hanbing-pick2'
      | 'zhuque-wait' | 'do-damage' | 'finish';
  source: PlayerId;
  target: PlayerId;
  cardId: CardId | null;   // null = 视为使用的杀(神速),无实体牌
  lgDone?: boolean;        // 烈弓已询问
  mjDone?: boolean;        // 猛进已询问
  xlAsked?: boolean;       // 享乐已询问
  extraCardIds?: CardId[]; // 丈八蛇矛:两张牌当杀,一并进弃牌堆
  noSuit?: boolean;        // 丈八的杀无花色(仁王盾不生效)
  element?: DamageElement; // 火杀/雷杀/朱雀羽扇转化
  jiuBonus?: boolean;      // 酒:此杀伤害 +1
  lgPlus?: boolean;        // 界烈弓:目标体力不小于你,伤害 +1
  jtjSuit?: string;        // 界铁骑:判定花色,目标需弃同花色牌否则不能闪
  zqAsked?: boolean;       // 朱雀羽扇已询问
  dodgesNeeded?: number;   // 无双 = 2
  dodgesGot?: number;
  noDodge?: boolean;       // 铁骑判红:不能闪
  ignoreArmor?: boolean;   // 陷阵拼点赢:无视目标防具(八卦/仁王/藤甲)
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
      | 'enyuan-card' | 'pojun-wait' | 'guixin-wait'
      | 'beige-card' | 'beige-judged'
      | 'yiji-wait' | 'yiji-cards' | 'yiji-player'
      | 'jtianxiang-mode' | 'liyu-wait' | 'liyu-pick' | 'liyu-player';
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
  fkTimes?: number;        // 界反馈:每点伤害触发一次
  glTimes?: number;        // 界刚烈:每点伤害触发一次
  lyAsked?: boolean;       // 利驭已询问
  lyCard?: CardId;         // 利驭拿到的牌
  txTarget?: PlayerId;     // 界天香选定的转移目标
  glAsked?: boolean;
  kgAsked?: boolean;       // 狂骨已询问
  txAsked?: boolean;       // 天香已询问
  txCard?: CardId;         // 天香弃置的红桃牌
  txDraw?: boolean;        // 天香转移来的伤害:结算后按已损失体力摸牌
  jmTimes?: number;        // 节命剩余触发次数(每点伤害一次)
  fzAsked?: boolean;       // 放逐已询问
  lrAsked?: boolean;       // 烈刃已询问
  bnAsked?: boolean;       // 暴虐已询问
  eyAsked?: boolean;       // 恩怨已询问
  pjAsked?: boolean;       // 破军已询问
  gxAsked?: boolean;       // 归心已询问
  bgAsked?: boolean;       // 悲歌已询问
  xsDone?: boolean;        // 新生已结算
  beigeBy?: PlayerId;      // 发动悲歌的蔡文姬
  yijiTimes?: number;      // 遗计剩余触发次数(每点伤害一次)
  yijiDrawn?: CardId[];    // 本次遗计摸到且尚未分配的牌
  yijiPicked?: CardId[];
  childResult?: { cardId: CardId };
}

export interface DyingFrame {
  type: 'dying';
  step: 'ask' | 'wait' | 'niepan-wait' | 'buyi-wait';
  npAsked?: boolean; // 涅槃已询问
  byAsked?: boolean; // 补益已询问
  who: PlayerId;
  source: PlayerId | null;
  queue: PlayerId[];
  idx: number;
}

export interface JudgeFrame {
  type: 'judge';
  step: 'flip' | 'guicai' | 'guicai-wait';
  player: PlayerId;
  reason: 'bagua' | 'ganglie' | 'tieji' | 'luoshen' | 'lebusishu' | 'shandian' | 'bingliang' | 'leiji' | 'shuangxiong' | 'baonve' | 'wuhun' | 'tuntian' | 'beige';
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
      | 'zaiqi-wait' | 'haoshi-wait' | 'haoshi-cards' | 'haoshi-player'
      | 'shelie-wait';
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
  step: 'next' | 'after-wuxie' | 'card-wait' | 'pick-wait'
      | 'fenwei-wait' | 'fenwei-players'
      | 'bagua-wait' | 'bagua-judged';
  effName: 'nanman' | 'wanjian' | 'taoyuan' | 'wugu';
  fwAsked?: boolean;   // 奋威已询问
  fwWho?: PlayerId;    // 被询问奋威的甘宁
  bgTarget?: PlayerId; // 本目标已询问过八卦
  cardId: CardId;
  source: PlayerId;
  queue: PlayerId[];
  idx: number;
  shownIds?: CardId[]; // 五谷丰登亮出的牌
  extraCardIds?: CardId[]; // 乱击:两张牌当万箭,结算后一并弃置
  childResult?: { negated?: boolean; cardId?: CardId }; // 无懈结果 / 八卦判定牌
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
  variant: 1 | 2 | 3; // 1=跳过判定+摸牌;2=跳过出牌并弃一张装备;3=跳过弃牌并翻面(界)
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
  step: 'wait' | 'discard-wait';
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

// 天义(太史慈)/陷阵(高顺):出牌阶段拼点,按结果挂本回合增益/惩罚
export interface TianyiFrame {
  type: 'tianyi';
  step: 'start' | 'done';
  skill?: 'tianyi' | 'xianzhen'; // 缺省为天义
  source: PlayerId;
  target: PlayerId;
  childResult?: { won: boolean };
}

// 屯田(邓艾):回合外失去牌后判定,非红桃置为"田"
export interface TuntianFrame {
  type: 'tuntian';
  step: 'ask' | 'wait' | 'judged';
  player: PlayerId;
  childResult?: { cardId: CardId };
}

// 巧变(张郃):弃一张手牌跳过一个阶段(摸牌改为拿牌,出牌改为移动场上牌)
export interface QiaobianFrame {
  type: 'qiaobian';
  step: 'ask' | 'move-start' | 'draw-players' | 'move-src' | 'move-pick' | 'move-dest';
  player: PlayerId;
  phase: 'judge' | 'draw' | 'play' | 'discard';
  moveFrom?: PlayerId;
  moveCard?: CardId;
}

// 挑衅(姜维):令攻击范围内含自己的角色对自己出杀,否则弃其一张牌
export interface TiaoxinFrame {
  type: 'tiaoxin';
  step: 'sha-wait' | 'pick-wait';
  source: PlayerId;
  target: PlayerId;
}

// 志继(姜维觉醒):无手牌时准备阶段觉醒,回复或摸牌,获得观星
export interface ZhijiFrame {
  type: 'zhiji';
  step: 'wait';
  player: PlayerId;
}

// 放权(刘禅):跳过出牌阶段,弃牌阶段末弃一张手牌令他人获得额外回合
export interface FangquanFrame {
  type: 'fangquan';
  step: 'skip-wait' | 'card-wait' | 'player-wait';
  player: PlayerId;
  card?: CardId;
}

// 固政(张昭张纮):他人弃牌阶段结束,可返还其一张弃牌并获得其余
export interface GuzhengFrame {
  type: 'guzheng';
  step: 'ask' | 'pick-wait';
  holder: PlayerId;
  who: PlayerId;
  cards: CardId[];
}

// 化身(左慈):准备阶段可声明化身牌上的一个技能获得之
export interface HuashenFrame {
  type: 'huashen';
  step: 'wait';
  player: PlayerId;
}

// 武魂(神关羽):死亡时令对其伤害最多的角色判定,非桃/桃园则死
export interface WuhunFrame {
  type: 'wuhun';
  step: 'start' | 'judged';
  victim: PlayerId;
  childResult?: { cardId: CardId };
}

// 攻心(神吕蒙):查看他人手牌,可展示其中一张红桃并弃置或置于牌堆顶
export interface GongxinFrame {
  type: 'gongxin';
  step: 'pick-wait' | 'where-wait';
  source: PlayerId;
  target: PlayerId;
  picked?: CardId;
}

// 神武将登场选择势力(建局随机分配模式用;选将模式在选将帧内完成)
export interface GodFactionFrame {
  type: 'god-faction';
  step: 'next' | 'wait';
  queue: PlayerId[];
  idx: number;
}

// 眩惑(法正):红桃手牌给人,再拿其一张牌转交第三者
export interface XuanhuoFrame {
  type: 'xuanhuo';
  step: 'pick-wait' | 'give-wait';
  source: PlayerId;
  target: PlayerId;
  gained?: CardId;
}

// 明策(陈宫):送装备/杀,受赠者选视为出杀或摸一张
export interface MingceFrame {
  type: 'mingce';
  step: 'wait';
  source: PlayerId;
  receiver: PlayerId;
  target: PlayerId; // 陈宫指定的杀目标
}

// 旋风(凌统):失去装备后,视为出杀或对距离1造成伤害
export interface XuanfengFrame {
  type: 'xuanfeng';
  step: 'wait' | 'sha-target' | 'damage-target';
  player: PlayerId;
}

// 英魂(孙坚):准备阶段若已受伤,令一名其他角色摸X弃一或摸一弃X
export interface YinghunFrame {
  type: 'yinghun';
  step: 'start' | 'target-wait' | 'mode-wait' | 'discard-wait';
  player: PlayerId;
  target?: PlayerId;
  need?: number; // 待弃置张数
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

// 界仁德(界刘备):本回合给出第二张仁德牌时,可视为使用一张基本牌
export interface JrendeFrame {
  type: 'jrende';
  step: 'wait' | 'sha-player';
  player: PlayerId;
}

// 义绝(界关羽):弃一张牌令一名角色展示一张手牌,黑色则其技能失效,红色则获得之
export interface YijueFrame {
  type: 'yijue';
  step: 'show-wait' | 'heal-wait';
  source: PlayerId;
  target: PlayerId;
}

// 界反间(界周瑜):交给其他角色一张手牌,其展示手牌弃同花色或失去 1 点体力
export interface JfanjianFrame {
  type: 'jfanjian';
  step: 'wait';
  source: PlayerId;
  target: PlayerId;
  suit: Suit;
}

// 界连营(界陆逊):失去最后手牌后,令至多 X 名角色各摸一张(X=失去的牌数)
export interface JlianyingFrame {
  type: 'jlianying';
  step: 'wait';
  player: PlayerId;
  count: number;
}

// 奋激(界周泰):一名角色结束阶段没有手牌时,可失去 1 点体力令其摸两张
export interface FenjiFrame {
  type: 'fenji';
  step: 'wait';
  holder: PlayerId;
  who: PlayerId;
}

// 奇谋(界魏延):限定技,失去 X 点体力,本回合距离 -X 且额外 X 张杀
export interface QimouFrame {
  type: 'qimou';
  step: 'wait';
  player: PlayerId;
}

// 激将(主动):主公出牌阶段视为使用杀,由蜀势力角色代为打出
export interface JijiangFrame {
  type: 'jijiang';
  step: 'wait';
  lord: PlayerId;
  target: PlayerId;
  queue: PlayerId[];
  idx: number;
}

// 开局选将:主公先选,其余角色按座次依次选;全部选定后发起始手牌
export interface ChooseGeneralsFrame {
  type: 'choose-generals';
  step: 'next' | 'wait' | 'faction-wait'; // faction-wait:刚选了神武将,追问势力
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
  | LierenFrame | BenghuaiFrame | LuanwuFrame | YinghunFrame
  | XuanhuoFrame | MingceFrame | XuanfengFrame
  | WuhunFrame | GongxinFrame | GodFactionFrame
  | TuntianFrame | QiaobianFrame | TiaoxinFrame | ZhijiFrame
  | FangquanFrame | GuzhengFrame | HuashenFrame
  | JrendeFrame | YijueFrame | JfanjianFrame | JlianyingFrame
  | FenjiFrame | QimouFrame | JijiangFrame
  | ChooseGeneralsFrame;

// ---------- 请求-响应 ----------

export interface RequestReason {
  kind: 'slash' | 'duel' | 'qinglong' | 'dying' | 'nullify' | 'discard' | 'guicai'
      | 'liuli' | 'ganglie-discard' | 'yiji' | 'tuxi'
      | 'aoe' | 'jiedao' | 'wugu' | 'guanshi-discard' | 'cixiong-discard'
      | 'huogong-show' | 'huogong-match'
      | 'tianxiang' | 'shensu-equip' | 'leiji' | 'guhuo'
      | 'pindian' | 'jieming' | 'quhu'
      | 'fangzhu' | 'haoshi' | 'luanwu' | 'yinghun'
      | 'enyuan' | 'xuanhuo' | 'xuanfeng' | 'gongxin'
      | 'qiaobian' | 'xiangle' | 'tiaoxin' | 'beige' | 'fangquan' | 'guzheng'
      | 'yijue' | 'jtieji' | 'jjushou' | 'jlianying' | 'fenwei' | 'liyu'
      | 'jijiang' | 'hujia';
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
  | 'fangzhu' | 'zaiqi' | 'haoshi' | 'lieren' | 'baonve' | 'benghuai' | 'yinghun'
  | 'buyi' | 'pojun' | 'xuanfeng' | 'mingce'
  | 'guixin' | 'shelie' | 'gongxin-where' | 'god-faction'
  | 'tuntian' | 'zhiji' | 'fangquan' | 'guzheng' | 'huashen'
  | 'jrende' | 'yijue-heal' | 'jfanjian' | 'fenwei' | 'shensu3' | 'liyu'
  | 'qimou' | 'fenji' | 'jjizhi' | 'jtianxiang-mode';

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
      reason: 'guohe' | 'shunshou' | 'fankui' | 'hanbing' | 'mengjin' | 'lieren' | 'xuanhuo'
        | 'qiaobian' | 'tiaoxin' | 'liyu' }
  | { id: number; player: PlayerId; type: 'choose-general';
      candidates: GeneralId[] };

export type ResponseData =
  | { kind: 'play-card'; cardId: CardId; targets: PlayerId[] }
  | { kind: 'use-skill'; skill: SkillName; cardIds?: CardId[]; targets?: PlayerId[];
      declare?: CardName } // 蛊惑声明的牌名
  | { kind: 'end-phase' }
  | { kind: 'card'; cardId: CardId; skill?: 'wusheng' | 'jwusheng' | 'jijiu' | 'longdan' | 'qingguo' | 'kanpo' | 'jiuchi' | 'guhuo' }
  | { kind: 'cards'; cardIds: CardId[] }                          // 应答 choose-cards
  | { kind: 'option'; index: number }                             // 应答 choose-option
  | { kind: 'players'; players: PlayerId[] }                      // 应答 choose-player
  | { kind: 'arrange'; top: CardId[]; bottom: CardId[] }          // 应答 arrange-cards
  | { kind: 'pick'; zone: 'hand' | 'equip' | 'judge'; cardId?: CardId }
  | { kind: 'general'; general: GeneralId }                       // 应答 choose-general
  | { kind: 'help' }                                              // 主公发动护驾/激将代打
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
  | { type: 'factionChosen'; player: PlayerId; faction: string }
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
  // 护驾/激将代打:主公把"需要杀/闪"的响应转给同势力角色
  help?: { original: PendingRequest; skill: 'hujia' | 'jijiang';
    queue: PlayerId[]; idx: number };
  helpDelivery?: { lord: PlayerId; helper: PlayerId }; // 交付中:校验用帮手的手牌
  helpSpentId?: number; // 该请求已发动过代打,不能再次发动
  // 蛊惑响应声明:于吉把任意手牌声明为需要的牌,质疑流程结束后交付原结算
  guhuoRespond?: { original: PendingRequest; cardId: CardId;
    pattern: 'shan' | 'sha' | 'tao' | 'wuxie'; queue: PlayerId[]; idx: number;
    challenger?: PlayerId };
  guhuoSpentId?: number; // 该请求已声明过蛊惑且被识破,不能再次声明
  // 五谷丰登结算中:亮出的牌与逐轮被选走的情况,对所有玩家公开展示
  wugu?: { cardIds: CardId[]; taken: Record<number, PlayerId> };
  nextRequestId: number;
  winner: Role[] | null;
  eventLog: GameEvent[];
  // 放权:被授予额外回合的角色;额外回合结束后从 resumeSeat 的下一位继续
  extraTurn?: { player: PlayerId; resumeSeat: number; active?: boolean };
}

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}
