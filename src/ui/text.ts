import type {
  CardName, GameEvent, GameState, PendingRequest, PlayerId, Role, SkillName,
} from '../engine/types';

export const CARD_NAMES: Record<CardName, string> = {
  sha: '杀', shan: '闪', tao: '桃',
  guohe: '过河拆桥', shunshou: '顺手牵羊', wuzhong: '无中生有',
  juedou: '决斗', wuxie: '无懈可击',
  zhugeliannu: '诸葛连弩', qinglongdao: '青龙偃月刀', baguazhen: '八卦阵',
  jiama: '+1马', jianma: '-1马',
};

export const GENERAL_NAMES: Record<string, string> = {
  liubei: '刘备', guanyu: '关羽', caocao: '曹操', simayi: '司马懿',
  sunquan: '孙权', ganning: '甘宁', diaochan: '貂蝉', huatuo: '华佗',
};

export const SKILL_NAMES: Record<SkillName, string> = {
  rende: '仁德', wusheng: '武圣', jianxiong: '奸雄', fankui: '反馈',
  guicai: '鬼才', zhiheng: '制衡', jiuyuan: '救援', qixi: '奇袭',
  lijian: '离间', biyue: '闭月', jijiu: '急救', qingnang: '青囊',
  bagua: '八卦阵', qinglong: '青龙偃月刀',
};

export const SKILL_HINTS: Record<string, string> = {
  rende: '选任意张手牌交给一名其他角色;给满两张回复1点体力',
  wusheng: '选一张红色牌当杀使用',
  zhiheng: '弃任意张牌,摸等量的牌(每回合一次)',
  qixi: '选一张黑色牌当过河拆桥使用',
  lijian: '弃一张牌,令两名男性角色决斗(先选的一方为发起者)',
  qingnang: '弃一张手牌,令一名已受伤角色回复1点体力(每回合一次)',
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
    case 'damage':
      return ev.source
        ? `${label(ev.source)} 对 ${label(ev.target)} 造成了 ${ev.amount} 点伤害`
        : `${label(ev.target)} 受到了 ${ev.amount} 点伤害`;
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
      return req.reason.kind === 'guicai'
        ? `是否发动【鬼才】打出一张手牌替换 ${label(req.reason.who!)} 的判定牌?`
        : `请弃置 ${req.min} 张手牌`;
    case 'choose-option':
      switch (req.reason) {
        case 'bagua': return '是否发动【八卦阵】进行判定?(红色视为闪)';
        case 'jianxiong': return '是否发动【奸雄】获得造成伤害的牌?';
        case 'fankui': return '是否发动【反馈】获得伤害来源的一张牌?';
      }
      return '';
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
};
