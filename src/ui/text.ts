import type {
  CardName, GameEvent, GameState, PendingRequest, PlayerId, Role, SkillName,
} from '../engine/types';

export const CARD_NAMES: Record<CardName, string> = {
  sha: '杀', huosha: '火杀', leisha: '雷杀', shan: '闪', tao: '桃', jiu: '酒',
  guohe: '过河拆桥', shunshou: '顺手牵羊', wuzhong: '无中生有',
  juedou: '决斗', wuxie: '无懈可击', lebusishu: '乐不思蜀',
  nanman: '南蛮入侵', wanjian: '万箭齐发', wugu: '五谷丰登',
  taoyuan: '桃园结义', jiedao: '借刀杀人', shandian: '闪电',
  huogong: '火攻', tiesuo: '铁索连环', bingliang: '兵粮寸断',
  cixiong: '雌雄双股剑', hanbing: '寒冰剑', zhangba: '丈八蛇矛',
  guanshi: '贯石斧', fangtian: '方天画戟', qilin: '麒麟弓', renwang: '仁王盾',
  zhugeliannu: '诸葛连弩', qinglongdao: '青龙偃月刀', baguazhen: '八卦阵',
  zhuque: '朱雀羽扇', gudingdao: '古锭刀', tengjia: '藤甲', baiyin: '白银狮子',
  jiama: '+1马', jianma: '-1马',
};

export const GENERAL_NAMES: Record<string, string> = {
  liubei: '刘备', guanyu: '关羽', caocao: '曹操', simayi: '司马懿',
  sunquan: '孙权', ganning: '甘宁', diaochan: '貂蝉', huatuo: '华佗',
  xiahoudun: '夏侯惇', zhangliao: '张辽', xuchu: '许褚', guojia: '郭嘉', zhenji: '甄姬',
  zhangfei: '张飞', zhugeliang: '诸葛亮', zhaoyun: '赵云', machao: '马超', huangyueying: '黄月英',
  lvmeng: '吕蒙', huanggai: '黄盖', zhouyu: '周瑜', daqiao: '大乔', luxun: '陆逊',
  sunshangxiang: '孙尚香', lvbu: '吕布',
  xiahouyuan: '夏侯渊', caoren: '曹仁', huangzhong: '黄忠', weiyan: '魏延',
  xiaoqiao: '小乔', zhoutai: '周泰', zhangjiao: '张角', yuji: '于吉',
};

export const SKILL_NAMES: Record<SkillName, string> = {
  rende: '仁德', wusheng: '武圣', jianxiong: '奸雄', fankui: '反馈',
  guicai: '鬼才', zhiheng: '制衡', jiuyuan: '救援', qixi: '奇袭',
  lijian: '离间', biyue: '闭月', jijiu: '急救', qingnang: '青囊',
  bagua: '八卦阵', qinglong: '青龙偃月刀',
  ganglie: '刚烈', tuxi: '突袭', luoyi: '裸衣', tiandu: '天妒', yiji: '遗计',
  luoshen: '洛神', qingguo: '倾国', paoxiao: '咆哮', guanxing: '观星',
  kongcheng: '空城', longdan: '龙胆', mashu: '马术', tieji: '铁骑',
  jizhi: '集智', qicai: '奇才', keji: '克己', kurou: '苦肉', yingzi: '英姿',
  fanjian: '反间', guose: '国色', liuli: '流离', qianxun: '谦逊',
  lianying: '连营', jieyin: '结姻', xiaoji: '枭姬', wushuang: '无双',
  cixiong: '雌雄双股剑', hanbing: '寒冰剑', zhangba: '丈八蛇矛',
  guanshi: '贯石斧', fangtian: '方天画戟', qilin: '麒麟弓', renwang: '仁王盾',
  tengjia: '藤甲', baiyin: '白银狮子', zhuque: '朱雀羽扇', gudingdao: '古锭刀',
  shensu: '神速', jushou: '据守', liegong: '烈弓', kuanggu: '狂骨',
  tianxiang: '天香', hongyan: '红颜', buqu: '不屈', leiji: '雷击',
  guidao: '鬼道', guhuo: '蛊惑',
};

export const SKILL_HINTS: Record<string, string> = {
  rende: '选任意张手牌交给一名其他角色;给满两张回复1点体力',
  wusheng: '选一张红色牌当杀使用',
  zhiheng: '弃任意张牌,摸等量的牌(每回合一次)',
  qixi: '选一张黑色牌当过河拆桥使用',
  lijian: '弃一张牌,令两名男性角色决斗(先选的一方为发起者)',
  qingnang: '弃一张手牌,令一名已受伤角色回复1点体力(每回合一次)',
  longdan: '选一张闪当杀使用(响应时也可杀闪互换)',
  kurou: '失去1点体力,然后摸两张牌',
  jieyin: '弃两张手牌,令一名已受伤的男性角色与你各回复1点体力(每回合一次)',
  fanjian: '令一名角色猜花色并随机获得你一张手牌,猜错则受到1点伤害(每回合一次)',
  guose: '将一张方块牌当乐不思蜀使用',
  zhangba: '将两张手牌当杀使用(无花色)',
  guhuo: '声明一张基本牌或非延时锦囊后扣置一张手牌;若被质疑且为假,牌作废',
};

export const ROLE_NAMES: Record<Role, string> = {
  lord: '主公', loyalist: '忠臣', rebel: '反贼', spy: '内奸',
};

export const SUIT_SYMBOLS: Record<string, string> = {
  spade: '♠', heart: '♥', club: '♣', diamond: '♦',
};

const RANK_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function rankLabel(rank: number): string {
  return RANK_NAMES[rank] ?? String(rank);
}

export function cardLabel(s: GameState, id: number): string {
  const c = s.cards[id];
  return `${CARD_NAMES[c.name]}${SUIT_SYMBOLS[c.suit]}${rankLabel(c.rank)}`;
}

export function seatLabel(s: GameState, pid: PlayerId): string {
  const p = s.players.find((x) => x.id === pid)!;
  return `${p.seat + 1}号位`;
}

export function playerLabel(s: GameState, pid: PlayerId, humanId?: PlayerId): string {
  const p = s.players.find((x) => x.id === pid)!;
  const you = humanId !== undefined && pid === humanId ? '(你)' : '';
  return `${GENERAL_NAMES[p.general]}${you}`;
}

export function describeEvent(s: GameState, ev: GameEvent, humanId?: PlayerId): string | null {
  const label = (pid: PlayerId) => playerLabel(s, pid, humanId);
  switch (ev.type) {
    case 'turnStarted':
      return `—— ${label(ev.player)} 的回合 ——`;
    case 'phaseChanged':
      return null;
    case 'cardPlayed': {
      const as = ev.as ? `(当作${CARD_NAMES[ev.as]})` : '';
      const tgt = ev.targets.length > 0 && ev.targets[0] !== ev.player
        ? ` 对 ${ev.targets.map((t) => label(t)).join('、')}`
        : '';
      return `${label(ev.player)}${tgt} 使用了 ${cardLabel(s, ev.cardId)}${as}`;
    }
    case 'cardResponded': {
      const as = ev.as ? `(当作${CARD_NAMES[ev.as]})` : '';
      return `${label(ev.player)} 打出了 ${cardLabel(s, ev.cardId)}${as}`;
    }
    case 'cardsMoved': {
      switch (ev.reason) {
        case 'draw':
          return `${label(ev.to.player!)} 摸了 ${ev.cardIds.length} 张牌`;
        case 'discard-phase':
        case 'zhiheng':
        case 'qingnang':
        case 'lijian':
          return `${label(ev.from.player!)} 弃置了 ${ev.cardIds.map((id) => cardLabel(s, id)).join('、')}`;
        case 'rende':
          return `${label(ev.from.player!)} 将 ${ev.cardIds.length} 张手牌交给了 ${label(ev.to.player!)}`;
        case 'guohe':
          return ev.from.zone === 'hand'
            ? `${label(ev.from.player!)} 的一张手牌被弃置`
            : `${label(ev.from.player!)} 的 ${ev.cardIds.map((id) => cardLabel(s, id)).join('、')} 被弃置`;
        case 'shunshou':
          return `${label(ev.to.player!)} 获得了 ${label(ev.from.player!)} 的一张牌`;
        case 'jianxiong':
        case 'fankui':
          return `${label(ev.to.player!)} 获得了 ${ev.cardIds.length} 张牌`;
        case 'replace-equip':
          return `${label(ev.from.player!)} 替换下 ${ev.cardIds.map((id) => cardLabel(s, id)).join('、')}`;
        default:
          return null;
      }
    }
    case 'damage': {
      const kind = ev.element === 'fire' ? '火焰伤害' : ev.element === 'thunder' ? '雷电伤害' : '伤害';
      return ev.source
        ? `${label(ev.source)} 对 ${label(ev.target)} 造成了 ${ev.amount} 点${kind}`
        : `${label(ev.target)} 受到了 ${ev.amount} 点${kind}`;
    }
    case 'chained':
      return ev.chained
        ? `${label(ev.player)} 被横置(连环状态)`
        : `${label(ev.player)} 重置(解除连环)`;
    case 'hpChanged':
      return ev.delta > 0
        ? `${label(ev.player)} 回复了 ${ev.delta} 点体力(${ev.hp})`
        : null;
    case 'judge':
      return `${label(ev.player)} 判定:${cardLabel(s, ev.cardId)}`;
    case 'skillInvoked':
      return `${label(ev.player)} 发动了【${SKILL_NAMES[ev.skill]}】`;
    case 'nullified':
      return `${CARD_NAMES[ev.cardName]} 被无懈可击抵消了`;
    case 'reshuffled':
      return '弃牌堆洗回了牌堆';
    case 'playerDied': {
      const killer = ev.killer ? `被 ${label(ev.killer)} 杀死,` : '';
      return `${label(ev.player)}(${ROLE_NAMES[ev.role]})${killer}阵亡`;
    }
    case 'phaseSkipped': {
      const phaseNames: Record<string, string> = {
        start: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束',
      };
      return ev.reason === 'lebusishu'
        ? `${label(ev.player)} 被乐不思蜀跳过了出牌阶段`
        : `${label(ev.player)} 跳过了${phaseNames[ev.phase] ?? ev.phase}阶段`;
    }
    case 'cardRevealed':
      return `${label(ev.player)} 展示了 ${cardLabel(s, ev.cardId)}`;
    case 'flipped':
      return ev.flipped
        ? `${label(ev.player)} 的武将牌翻面(将跳过一个回合)`
        : `${label(ev.player)} 的武将牌翻回正面(跳过此回合)`;
    case 'virtualCard': {
      const tgt = ev.targets.length > 0 && ev.targets[0] !== ev.player
        ? ` 对 ${ev.targets.map((t) => label(t)).join('、')}`
        : '';
      return `${label(ev.player)}${tgt} 视为使用了 ${CARD_NAMES[ev.as]}`;
    }
    case 'gameOver':
      return `游戏结束!${ev.winner.map((r) => ROLE_NAMES[r]).join('、')} 阵营获胜`;
  }
}

export function describeRequest(s: GameState, req: PendingRequest, humanId?: PlayerId): string {
  const label = (pid: PlayerId) => playerLabel(s, pid, humanId);
  switch (req.type) {
    case 'play':
      return '你的出牌阶段';
    case 'respond-card': {
      const r = req.reason;
      switch (r.kind) {
        case 'slash':
          return `${label(r.source!)} 对你使用了杀,是否打出闪?`;
        case 'duel':
          return `与 ${label(r.source!)} 决斗中,是否打出杀?`;
        case 'qinglong':
          return `青龙偃月刀:是否立即对 ${label(r.target!)} 再使用一张杀?`;
        case 'aoe':
          return r.cardName === 'nanman'
            ? `${label(r.source!)} 使用了南蛮入侵,是否打出杀?`
            : `${label(r.source!)} 使用了万箭齐发,是否打出闪?`;
        case 'jiedao':
          return `${label(r.source!)} 借刀杀人:对 ${label(r.target!)} 使用杀,否则将武器交给对方`;
        case 'dying':
          return r.who === req.player
            ? '你处于濒死状态,是否使用桃?'
            : `${label(r.who!)} 濒死,是否使用桃救援?`;
        case 'nullify': {
          const neg = r.negated ? '(它当前已被无懈)' : '';
          return `${label(r.source!)} 对 ${label(r.target!)} 使用了${CARD_NAMES[r.cardName!]}${neg},是否使用无懈可击?`;
        }
        default:
          return '请打出一张牌';
      }
    }
    case 'choose-cards':
      switch (req.reason.kind) {
        case 'guicai':
          return `是否发动【鬼才】打出一张手牌替换 ${label(req.reason.who!)} 的判定牌?`;
        case 'liuli':
          return '流离:弃置一张牌以转移这张杀';
        case 'ganglie-discard':
          return '刚烈:请弃置两张手牌';
        case 'yiji':
          return '遗计:选择要分给其他角色的牌(不选则全部保留)';
        case 'wugu':
          return '五谷丰登:选择一张牌获得';
        case 'guanshi-discard':
          return '贯石斧:弃置两张牌强制命中(不含贯石斧)';
        case 'cixiong-discard':
          return '雌雄双股剑:请弃置一张手牌';
        case 'huogong-show':
          return '火攻:请展示一张手牌';
        case 'huogong-match': {
          const suit = req.reason.suit ? SUIT_SYMBOLS[req.reason.suit] : '';
          return `火攻:弃置一张 ${suit} 花色手牌,对 ${label(req.reason.target!)} 造成1点火焰伤害`;
        }
        case 'tianxiang':
          return '天香:选择一张红桃手牌弃置以转移此伤害';
        case 'shensu-equip':
          return '神速:选择一张装备牌弃置';
        case 'guhuo':
          return '蛊惑:选择要扣置的手牌';
        default:
          return `请弃置 ${req.min} 张手牌`;
      }
    case 'choose-option':
      switch (req.reason) {
        case 'bagua': return '是否发动【八卦阵】进行判定?(红色视为闪)';
        case 'jianxiong': return '是否发动【奸雄】获得造成伤害的牌?';
        case 'fankui': return '是否发动【反馈】获得伤害来源的一张牌?';
        case 'liuli': return '是否发动【流离】把这张杀转移给别人?';
        case 'tieji': return '是否发动【铁骑】进行判定?(红色则目标不能闪)';
        case 'ganglie': return '是否发动【刚烈】进行判定?';
        case 'ganglie-choice': return '刚烈生效:弃两张手牌,或受到1点伤害';
        case 'yiji': return '是否发动【遗计】摸两张牌?';
        case 'luoshen': return '是否发动【洛神】判定?(黑色则获得判定牌并可继续)';
        case 'guanxing': return '是否发动【观星】查看并调整牌堆顶的牌?';
        case 'tuxi': return '是否发动【突袭】放弃摸牌,改为获得至多两名角色各一张手牌?';
        case 'luoyi': return '是否发动【裸衣】少摸一张牌,本回合杀/决斗伤害+1?';
        case 'fanjian-suit': return '反间:猜一种花色(猜错将受到1点伤害)';
        case 'cixiong-choice': return '雌雄双股剑:弃一张手牌,或令攻击者摸一张牌';
        case 'guanshi': return '是否发动【贯石斧】弃两张牌强制命中?';
        case 'qilin': return '是否发动【麒麟弓】弃置目标的一匹马?';
        case 'hanbing': return '是否发动【寒冰剑】防止伤害,改为弃置其两张牌?';
        case 'zhuque': return '是否发动【朱雀羽扇】将此杀当作火杀?';
        case 'shensu1': return '是否发动【神速】跳过判定和摸牌阶段,视为使用一张杀?';
        case 'shensu2': return '是否发动【神速】跳过出牌阶段并弃置一张装备牌,视为使用一张杀?';
        case 'jushou': return '是否发动【据守】摸三张牌并翻面?';
        case 'liegong': return '是否发动【烈弓】令目标不能使用闪?';
        case 'kuanggu': return '是否发动【狂骨】回复1点体力?';
        case 'tianxiang': return '是否发动【天香】弃一张红桃手牌转移此伤害?';
        case 'leiji': return '是否发动【雷击】令一名角色判定?(黑桃则受2点雷伤)';
        case 'guhuo-challenge': return '是否质疑这次蛊惑?(若为真,你失去1点体力)';
      }
      return '';
    case 'choose-player':
      switch (req.reason.kind) {
        case 'tuxi': return `突袭:选择至多 ${req.max} 名角色,各获得其一张手牌`;
        case 'liuli': return '流离:选择杀的新目标(须在你的攻击范围内)';
        case 'yiji': return '遗计:选择获得这些牌的角色';
        case 'leiji': return '雷击:选择一名角色进行判定(黑桃则其受到2点雷电伤害)';
        default: return '请选择目标角色';
      }
    case 'arrange-cards':
      return '观星:调整牌堆顶的牌(上方为牌堆顶,按顺序摸取;移到下方则放到牌堆底)';
    case 'pick-card': {
      const what = req.reason === 'guohe' ? '弃置' : '获得';
      return `选择要${what}的 ${label(req.target)} 的一张牌`;
    }
  }
}

export const OPTION_LABELS: Record<string, string> = {
  bagua: '发动八卦阵',
  jianxiong: '发动奸雄',
  fankui: '发动反馈',
  liuli: '发动流离',
  tieji: '发动铁骑',
  ganglie: '发动刚烈',
  'ganglie-discard': '弃两张手牌',
  'ganglie-damage': '受到1点伤害',
  yiji: '发动遗计',
  luoshen: '发动洛神',
  guanxing: '发动观星',
  tuxi: '发动突袭',
  luoyi: '发动裸衣',
  'cixiong-discard': '弃一张手牌',
  'cixiong-draw': '令其摸一张牌',
  guanshi: '发动贯石斧',
  qilin: '发动麒麟弓',
  hanbing: '发动寒冰剑',
  zhuque: '当作火杀',
  'qilin-plus': '弃置 +1马',
  'qilin-minus': '弃置 -1马',
  shensu1: '发动神速',
  shensu2: '发动神速',
  jushou: '发动据守',
  liegong: '发动烈弓',
  kuanggu: '发动狂骨',
  tianxiang: '发动天香',
  leiji: '发动雷击',
  'guhuo-challenge': '质疑',
  spade: '♠ 黑桃',
  heart: '♥ 红桃',
  club: '♣ 梅花',
  diamond: '♦ 方块',
};
