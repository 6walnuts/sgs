// 规则式 AI。只通过 ResponseData 应答引擎请求,绝不直接修改 GameState。
// v1 简化:AI 直接读取完整 state 中的身份做敌我判断(不看他人手牌);
// 后续可改为基于 viewFor 视角 + 身份推理。

import type {
  CardId, GameState, PendingRequest, PlayerId, PlayerState, ResponseData, Role,
} from '../engine/types';
import { isBlack, isRed } from '../engine/deck';
import { GENERALS } from '../engine/generals';
import { attackRange, distance, shaLimit, shaUsed } from '../engine/rules';

function card(s: GameState, id: CardId) {
  return s.cards[id];
}

function player(s: GameState, id: PlayerId): PlayerState {
  return s.players.find((p) => p.id === id)!;
}

function hasGeneralSkill(p: PlayerState, skill: string): boolean {
  return GENERALS[p.general].skills.includes(skill as never);
}

function isEnemy(s: GameState, myRole: Role, other: PlayerState): boolean {
  const rebelsAlive = s.players.some((p) => p.alive && p.role === 'rebel');
  switch (myRole) {
    case 'lord':
    case 'loyalist':
      return other.role === 'rebel' || (other.role === 'spy' && !rebelsAlive);
    case 'rebel':
      return other.role === 'lord' || other.role === 'loyalist';
    case 'spy':
      return rebelsAlive ? other.role === 'rebel' : other.role !== 'spy';
  }
}

function enemiesOf(s: GameState, me: PlayerState): PlayerState[] {
  return s.players.filter((p) => p.alive && p.id !== me.id && isEnemy(s, me.role, p));
}

function alliesOf(s: GameState, me: PlayerState): PlayerState[] {
  return s.players.filter((p) => p.alive && p.id !== me.id && !isEnemy(s, me.role, p));
}

function handOf(s: GameState, me: PlayerState, name: string): CardId[] {
  return me.hand.filter((id) => card(s, id).name === name);
}

// 牌的保留价值,弃牌/制衡时先丢低分牌
function keepScore(s: GameState, me: PlayerState, id: CardId): number {
  const c = card(s, id);
  switch (c.name) {
    case 'tao': return 100;
    case 'wuxie': return 80;
    case 'shan': return 70;
    case 'wuzhong': return 60;
    case 'shunshou': return 50;
    case 'guohe': return 45;
    case 'juedou': return 40;
    case 'sha': return 35;
    default: {
      // 装备:槽位为空则有价值,已有装备则是废牌
      const slotFilled = Object.values(me.equips).some(
        (eid) => eid !== undefined && card(s, eid).name === c.name,
      );
      return slotFilled ? 5 : 55;
    }
  }
}

function sortByScoreAsc(s: GameState, me: PlayerState, ids: CardId[]): CardId[] {
  return ids.slice().sort((a, b) => keepScore(s, me, a) - keepScore(s, me, b));
}

function junkCards(s: GameState, me: PlayerState): CardId[] {
  return me.hand.filter((id) => keepScore(s, me, id) <= 35).slice(0, 4);
}

export function decide(s: GameState, me: PlayerId, req: PendingRequest): ResponseData {
  const p = player(s, me);
  switch (req.type) {
    case 'play': return decidePlay(s, p);
    case 'respond-card': return decideRespondCard(s, p, req);
    case 'choose-option': return decideOption(req);
    case 'choose-cards': return decideChooseCards(s, p, req);
    case 'pick-card': return decidePick(s, req);
  }
}

function decidePlay(s: GameState, p: PlayerState): ResponseData {
  const enemies = enemiesOf(s, p);
  const allies = alliesOf(s, p);

  // 1. 危急时吃桃
  const taos = handOf(s, p, 'tao');
  if (p.hp < p.maxHp && taos.length > 0 && (p.hp <= 2 || taos.length > 1)) {
    return { kind: 'play-card', cardId: taos[0], targets: [p.id] };
  }

  // 2. 装备空槽的装备牌
  for (const id of p.hand) {
    const c = card(s, id);
    const slot = equipSlot(c.name);
    if (slot && p.equips[slot] === undefined) {
      return { kind: 'play-card', cardId: id, targets: [] };
    }
  }

  // 3. 无中生有
  const wz = handOf(s, p, 'wuzhong');
  if (wz.length > 0) return { kind: 'play-card', cardId: wz[0], targets: [] };

  // 4. 制衡废牌
  if (hasGeneralSkill(p, 'zhiheng') && !p.flags.zhiheng) {
    const junk = junkCards(s, p).filter((id) => card(s, id).name !== 'sha' || handOf(s, p, 'sha').length > 2);
    if (junk.length > 0) return { kind: 'use-skill', skill: 'zhiheng', cardIds: junk };
  }

  // 5. 顺手牵羊近距离敌人
  const ss = handOf(s, p, 'shunshou');
  if (ss.length > 0) {
    const t = enemies.find((e) => distance(s, p.id, e.id) <= 1 && cardCount(e) > 0);
    if (t) return { kind: 'play-card', cardId: ss[0], targets: [t.id] };
  }

  // 6. 过河拆桥(优先拆有装备的敌人)
  const gh = handOf(s, p, 'guohe');
  if (gh.length > 0) {
    const t = enemies.find((e) => equipCount(e) > 0) ?? enemies.find((e) => cardCount(e) > 0);
    if (t) return { kind: 'play-card', cardId: gh[0], targets: [t.id] };
  }

  // 7. 奇袭:黑牌当过拆
  if (hasGeneralSkill(p, 'qixi')) {
    const black = p.hand.find((id) => isBlack(card(s, id).suit) && keepScore(s, p, id) <= 35);
    const t = enemies.find((e) => cardCount(e) > 0);
    if (black !== undefined && t) {
      return { kind: 'use-skill', skill: 'qixi', cardIds: [black], targets: [t.id] };
    }
  }

  // 8. 青囊救最残的友方(含自己)
  if (hasGeneralSkill(p, 'qingnang') && !p.flags.qingnang && p.hand.length > 0) {
    const hurt = [...allies, p].filter((x) => x.hp < x.maxHp).sort((a, b) => a.hp - b.hp)[0];
    if (hurt) {
      const worst = sortByScoreAsc(s, p, p.hand)[0];
      return { kind: 'use-skill', skill: 'qingnang', cardIds: [worst], targets: [hurt.id] };
    }
  }

  // 9. 离间两个男性敌人
  if (hasGeneralSkill(p, 'lijian') && !p.flags.lijian && p.hand.length > 1) {
    const males = enemies.filter((e) => GENERALS[e.general].gender === 'm');
    if (males.length >= 2) {
      const worst = sortByScoreAsc(s, p, p.hand)[0];
      return { kind: 'use-skill', skill: 'lijian', cardIds: [worst], targets: [males[0].id, males[1].id] };
    }
  }

  // 10. 仁德:受伤时送废牌换回复
  if (hasGeneralSkill(p, 'rende') && p.hp < p.maxHp && allies.length > 0) {
    const given = typeof p.flags.rende === 'number' ? p.flags.rende : 0;
    if (given < 2) {
      const junk = junkCards(s, p).slice(0, 2 - given);
      if (junk.length >= 2 - given) {
        const t = allies.sort((a, b) => a.hand.length - b.hand.length)[0];
        return { kind: 'use-skill', skill: 'rende', cardIds: junk, targets: [t.id] };
      }
    }
  }

  // 11. 杀(含武圣)
  if (shaUsed(p) < shaLimit(s, p)) {
    const inRange = enemies
      .filter((e) => distance(s, p.id, e.id) <= attackRange(s, p))
      .sort((a, b) => a.hp - b.hp);
    if (inRange.length > 0) {
      const sha = handOf(s, p, 'sha');
      if (sha.length > 0) {
        return { kind: 'play-card', cardId: sha[0], targets: [inRange[0].id] };
      }
      if (hasGeneralSkill(p, 'wusheng')) {
        const red = p.hand.find((id) => isRed(card(s, id).suit) && keepScore(s, p, id) <= 55);
        if (red !== undefined) {
          return { kind: 'use-skill', skill: 'wusheng', cardIds: [red], targets: [inRange[0].id] };
        }
      }
    }
  }

  // 12. 决斗:手里杀多时找敌人单挑
  const jd = handOf(s, p, 'juedou');
  if (jd.length > 0 && handOf(s, p, 'sha').length >= 2 && enemies.length > 0) {
    const t = enemies.sort((a, b) => a.hand.length - b.hand.length)[0];
    return { kind: 'play-card', cardId: jd[0], targets: [t.id] };
  }

  return { kind: 'end-phase' };
}

function decideRespondCard(
  s: GameState, p: PlayerState, req: Extract<PendingRequest, { type: 'respond-card' }>,
): ResponseData {
  switch (req.pattern) {
    case 'shan': {
      const shan = handOf(s, p, 'shan');
      if (shan.length > 0) return { kind: 'card', cardId: shan[0] };
      return { kind: 'decline' };
    }
    case 'sha': {
      // 决斗中被迫出杀 / 青龙刀追杀
      if (req.reason.kind === 'qinglong') {
        const t = req.reason.target ? player(s, req.reason.target) : null;
        if (!t || !isEnemy(s, p.role, t)) return { kind: 'decline' };
      }
      const sha = handOf(s, p, 'sha');
      if (sha.length > 0) return { kind: 'card', cardId: sha[0] };
      if (hasGeneralSkill(p, 'wusheng')) {
        const red = p.hand.find((id) => isRed(card(s, id).suit));
        if (red !== undefined) return { kind: 'card', cardId: red, skill: 'wusheng' };
      }
      return { kind: 'decline' };
    }
    case 'tao': {
      const who = req.reason.who ? player(s, req.reason.who) : null;
      if (!who) return { kind: 'decline' };
      const save = who.id === p.id || !isEnemy(s, p.role, who);
      if (!save) return { kind: 'decline' };
      const taos = handOf(s, p, 'tao');
      if (taos.length > 0) return { kind: 'card', cardId: taos[0] };
      if (hasGeneralSkill(p, 'jijiu') && s.turn.activePlayer !== p.id) {
        const red = p.hand.find((id) => isRed(card(s, id).suit));
        if (red !== undefined) return { kind: 'card', cardId: red, skill: 'jijiu' };
      }
      return { kind: 'decline' };
    }
    case 'wuxie': {
      const { cardName, source, target, negated } = req.reason;
      if (!cardName || !source || !target) return { kind: 'decline' };
      const src = player(s, source);
      const tgt = player(s, target);
      // 该锦囊生效是否符合我方利益
      let wantApplied: boolean;
      if (cardName === 'wuzhong') {
        wantApplied = !isEnemy(s, p.role, src) || src.id === p.id;
      } else {
        wantApplied = isEnemy(s, p.role, tgt) && tgt.id !== p.id;
      }
      const appliedIfIdle = !negated;
      if (appliedIfIdle === wantApplied) return { kind: 'decline' };
      const wx = handOf(s, p, 'wuxie');
      if (wx.length > 0) return { kind: 'card', cardId: wx[0] };
      return { kind: 'decline' };
    }
  }
}

function decideOption(_req: Extract<PendingRequest, { type: 'choose-option' }>): ResponseData {
  // 八卦阵 / 奸雄 / 反馈:总是发动
  return { kind: 'option', index: 0 };
}

function decideChooseCards(
  s: GameState, p: PlayerState, req: Extract<PendingRequest, { type: 'choose-cards' }>,
): ResponseData {
  if (req.reason.kind === 'guicai') {
    // v1 简化:鬼才不改判
    return { kind: 'decline' };
  }
  const sorted = sortByScoreAsc(s, p, p.hand);
  return { kind: 'cards', cardIds: sorted.slice(0, req.min) };
}

function decidePick(
  s: GameState, req: Extract<PendingRequest, { type: 'pick-card' }>,
): ResponseData {
  if (req.equips.length > 0) {
    const best = req.equips.slice().sort((a, b) => equipPriority(s, b) - equipPriority(s, a))[0];
    return { kind: 'pick', zone: 'equip', cardId: best };
  }
  return { kind: 'pick', zone: 'hand' };
}

function equipPriority(s: GameState, id: CardId): number {
  switch (card(s, id).name) {
    case 'zhugeliannu': return 5;
    case 'qinglongdao': return 4;
    case 'baguazhen': return 3;
    default: return 1;
  }
}

function equipSlot(name: string): 'weapon' | 'armor' | 'horsePlus' | 'horseMinus' | null {
  switch (name) {
    case 'zhugeliannu': case 'qinglongdao': return 'weapon';
    case 'baguazhen': return 'armor';
    case 'jiama': return 'horsePlus';
    case 'jianma': return 'horseMinus';
    default: return null;
  }
}

function cardCount(p: PlayerState): number {
  return p.hand.length + equipCount(p);
}

function equipCount(p: PlayerState): number {
  return Object.values(p.equips).filter((x) => x !== undefined).length;
}

// 兜底默认应答:AI 决策非法时回退用,也用作人类超时的默认动作
export function defaultResponse(s: GameState, req: PendingRequest): ResponseData {
  switch (req.type) {
    case 'play': return { kind: 'end-phase' };
    case 'respond-card': return { kind: 'decline' };
    case 'choose-option': return req.canDecline ? { kind: 'decline' } : { kind: 'option', index: 0 };
    case 'choose-cards': {
      if (req.canDecline) return { kind: 'decline' };
      const p = s.players.find((x) => x.id === req.player)!;
      return { kind: 'cards', cardIds: p.hand.slice(0, req.min) };
    }
    case 'pick-card':
      return req.handCount > 0
        ? { kind: 'pick', zone: 'hand' }
        : { kind: 'pick', zone: 'equip', cardId: req.equips[0] };
  }
}
