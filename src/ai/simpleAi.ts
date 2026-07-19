// 规则式 AI。只通过 ResponseData 应答引擎请求,绝不直接修改 GameState。
// v1 简化:AI 直接读取完整 state 中的身份做敌我判断(不看他人手牌);
// 后续可改为基于 viewFor 视角 + 身份推理。

import type {
  CardId, GameState, PendingRequest, PlayerId, PlayerState, ResponseData, Role,
} from '../engine/types';
import { isBlack, isRed, isShaCard } from '../engine/deck';
import { GENERALS } from '../engine/generals';
import {
  attackRange, distance, effectiveSuit, kongchengProtected, shaLimit, shaUsed,
} from '../engine/rules';

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

// 所有种类的杀(普通/火/雷)
function shaCards(s: GameState, me: PlayerState): CardId[] {
  return me.hand.filter((id) => isShaCard(card(s, id).name));
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
    case 'lebusishu': return 42;
    case 'nanman': return 44;
    case 'wanjian': return 44;
    case 'wugu': return 46;
    case 'taoyuan': return 30;
    case 'jiedao': return 25;
    case 'shandian': return 20;
    case 'huosha': return 36;
    case 'leisha': return 36;
    case 'jiu': return 45;
    case 'huogong': return 40;
    case 'tiesuo': return 22;
    case 'bingliang': return 41;
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

function stealableCount(p: PlayerState): number {
  return cardCount(p) + p.judgeZone.length;
}

export function decide(s: GameState, me: PlayerId, req: PendingRequest): ResponseData {
  const p = player(s, me);
  switch (req.type) {
    case 'play': return decidePlay(s, p);
    case 'respond-card': return decideRespondCard(s, p, req);
    case 'choose-option': return decideOption(s, p, req);
    case 'choose-cards': return decideChooseCards(s, p, req);
    case 'choose-player': return decideChoosePlayer(s, p, req);
    case 'arrange-cards': return { kind: 'arrange', top: [...req.cardIds], bottom: [] };
    case 'pick-card': return decidePick(s, req);
    case 'choose-general': {
      // 简单启发:偏好体力高、有主动技能的武将
      const best = req.candidates.slice().sort((a, b) => {
        const score = (g: typeof a) => GENERALS[g].hp * 2 + GENERALS[g].activeSkills.length;
        return score(b) - score(a);
      })[0];
      return { kind: 'general', general: best };
    }
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

  // 5. 苦肉:体力充裕时换牌
  if (hasGeneralSkill(p, 'kurou') && p.hp >= 3) {
    return { kind: 'use-skill', skill: 'kurou' };
  }

  // 6. 乐不思蜀 / 国色
  const le = handOf(s, p, 'lebusishu');
  const leTarget = enemies.find(
    (e) => !hasGeneralSkill(e, 'qianxun')
      && !e.judgeZone.some((id) => card(s, id).name === 'lebusishu'),
  );
  if (le.length > 0 && leTarget) {
    return { kind: 'play-card', cardId: le[0], targets: [leTarget.id] };
  }
  if (hasGeneralSkill(p, 'guose') && leTarget) {
    const diamond = p.hand.find((id) => card(s, id).suit === 'diamond' && keepScore(s, p, id) <= 45);
    if (diamond !== undefined) {
      return { kind: 'use-skill', skill: 'guose', cardIds: [diamond], targets: [leTarget.id] };
    }
  }

  // 7. 顺手牵羊近距离敌人
  const ss = handOf(s, p, 'shunshou');
  if (ss.length > 0) {
    const canReach = (e: PlayerState) =>
      (hasGeneralSkill(p, 'qicai') || distance(s, p.id, e.id) <= 1)
      && !hasGeneralSkill(e, 'qianxun') && stealableCount(e) > 0;
    const t = enemies.find(canReach);
    if (t) return { kind: 'play-card', cardId: ss[0], targets: [t.id] };
  }

  // 8. 过河拆桥(优先拆有装备的敌人)
  const gh = handOf(s, p, 'guohe');
  if (gh.length > 0) {
    const t = enemies.find((e) => equipCount(e) > 0) ?? enemies.find((e) => stealableCount(e) > 0);
    if (t) return { kind: 'play-card', cardId: gh[0], targets: [t.id] };
  }

  // 9. 奇袭:黑牌当过拆
  if (hasGeneralSkill(p, 'qixi')) {
    const black = p.hand.find((id) => isBlack(card(s, id).suit) && keepScore(s, p, id) <= 35);
    const t = enemies.find((e) => stealableCount(e) > 0);
    if (black !== undefined && t) {
      return { kind: 'use-skill', skill: 'qixi', cardIds: [black], targets: [t.id] };
    }
  }

  // 10. 青囊救最残的友方(含自己)
  if (hasGeneralSkill(p, 'qingnang') && !p.flags.qingnang && p.hand.length > 0) {
    const hurt = [...allies, p].filter((x) => x.hp < x.maxHp).sort((a, b) => a.hp - b.hp)[0];
    if (hurt) {
      const worst = sortByScoreAsc(s, p, p.hand)[0];
      return { kind: 'use-skill', skill: 'qingnang', cardIds: [worst], targets: [hurt.id] };
    }
  }

  // 11. 结姻:救受伤的男性队友
  if (hasGeneralSkill(p, 'jieyin') && !p.flags.jieyin && p.hand.length >= 4) {
    const t = allies.find((x) => GENERALS[x.general].gender === 'm' && x.hp < x.maxHp);
    if (t) {
      const worst = sortByScoreAsc(s, p, p.hand).slice(0, 2);
      return { kind: 'use-skill', skill: 'jieyin', cardIds: worst, targets: [t.id] };
    }
  }

  // 12. 反间:打敌人手牌与体力
  if (hasGeneralSkill(p, 'fanjian') && !p.flags.fanjian && p.hand.length > 1 && enemies.length > 0) {
    const t = enemies.sort((a, b) => a.hp - b.hp)[0];
    return { kind: 'use-skill', skill: 'fanjian', targets: [t.id] };
  }

  // 13. 离间两个男性敌人
  if (hasGeneralSkill(p, 'lijian') && !p.flags.lijian && p.hand.length > 1) {
    const males = enemies.filter((e) => GENERALS[e.general].gender === 'm');
    if (males.length >= 2 && !kongchengProtected(s, males[1])) {
      const worst = sortByScoreAsc(s, p, p.hand)[0];
      return { kind: 'use-skill', skill: 'lijian', cardIds: [worst], targets: [males[0].id, males[1].id] };
    }
  }

  // 14. 仁德:受伤时送废牌换回复
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

  // 14.5 兵粮寸断 / 火攻 / 铁索重铸
  const bl = handOf(s, p, 'bingliang');
  if (bl.length > 0) {
    const t = enemies.find(
      (e) => distance(s, p.id, e.id) <= 1
        && !e.judgeZone.some((id) => card(s, id).name === 'bingliang'),
    );
    if (t) return { kind: 'play-card', cardId: bl[0], targets: [t.id] };
  }
  const hg = handOf(s, p, 'huogong');
  if (hg.length > 0 && p.hand.length >= 3) {
    const t = enemies.find((e) => e.hand.length > 0);
    if (t) return { kind: 'play-card', cardId: hg[0], targets: [t.id] };
  }
  const ts2 = handOf(s, p, 'tiesuo');
  if (ts2.length > 0) {
    return { kind: 'play-card', cardId: ts2[0], targets: [] }; // 简化:重铸换牌
  }

  // 15. 杀(含火杀/雷杀/武圣/龙胆)
  if (shaUsed(p) < shaLimit(s, p)) {
    const inRange = enemies
      .filter((e) => distance(s, p.id, e.id) <= attackRange(s, p) && !kongchengProtected(s, e))
      .sort((a, b) => a.hp - b.hp);
    if (inRange.length > 0) {
      const sha = shaCards(s, p);
      // 酒:攻击前先喝
      const jiu = handOf(s, p, 'jiu');
      if (sha.length > 0 && jiu.length > 0 && !p.flags.jiuUsed && !p.flags.jiuBuff) {
        return { kind: 'play-card', cardId: jiu[0], targets: [] };
      }
      if (sha.length > 0) {
        return { kind: 'play-card', cardId: sha[0], targets: [inRange[0].id] };
      }
      if (hasGeneralSkill(p, 'wusheng')) {
        const red = p.hand.find((id) => isRed(card(s, id).suit) && keepScore(s, p, id) <= 55);
        if (red !== undefined) {
          return { kind: 'use-skill', skill: 'wusheng', cardIds: [red], targets: [inRange[0].id] };
        }
      }
      if (hasGeneralSkill(p, 'longdan')) {
        const shan = handOf(s, p, 'shan');
        if (shan.length > 1) {
          return { kind: 'use-skill', skill: 'longdan', cardIds: [shan[0]], targets: [inRange[0].id] };
        }
      }
    }
  }

  // 15.5 群体锦囊与借刀
  const nm = [...handOf(s, p, 'nanman'), ...handOf(s, p, 'wanjian')];
  if (nm.length > 0 && enemies.length >= Math.max(1, allies.length)) {
    return { kind: 'play-card', cardId: nm[0], targets: [] };
  }
  const wugu = handOf(s, p, 'wugu');
  if (wugu.length > 0) return { kind: 'play-card', cardId: wugu[0], targets: [] };
  const ty = handOf(s, p, 'taoyuan');
  if (ty.length > 0 && p.hp < p.maxHp) {
    return { kind: 'play-card', cardId: ty[0], targets: [] };
  }
  const jd2 = handOf(s, p, 'jiedao');
  if (jd2.length > 0) {
    for (const a of enemies) {
      if (a.equips.weapon === undefined) continue;
      const b = s.players.find(
        (x) => x.alive && x.id !== a.id
          && distance(s, a.id, x.id) <= attackRange(s, a)
          && isEnemy(s, p.role, x) && !kongchengProtected(s, x),
      );
      if (b) return { kind: 'play-card', cardId: jd2[0], targets: [a.id, b.id] };
    }
  }
  const sd = handOf(s, p, 'shandian');
  if (sd.length > 0 && p.hp >= 3
      && !p.judgeZone.some((id) => card(s, id).name === 'shandian')) {
    return { kind: 'play-card', cardId: sd[0], targets: [] };
  }

  // 16. 决斗:手里杀多时找敌人单挑
  const jd = handOf(s, p, 'juedou');
  if (jd.length > 0 && shaCards(s, p).length >= 2 && enemies.length > 0) {
    const cands = enemies.filter((e) => !kongchengProtected(s, e));
    if (cands.length > 0) {
      const t = cands.sort((a, b) => a.hand.length - b.hand.length)[0];
      return { kind: 'play-card', cardId: jd[0], targets: [t.id] };
    }
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
      if (hasGeneralSkill(p, 'longdan')) {
        const sha = handOf(s, p, 'sha'); // 龙胆仅普通杀可当闪
        if (sha.length > 0) return { kind: 'card', cardId: sha[0], skill: 'longdan' };
      }
      if (hasGeneralSkill(p, 'qingguo')) {
        const black = p.hand.find((id) => isBlack(card(s, id).suit));
        if (black !== undefined) return { kind: 'card', cardId: black, skill: 'qingguo' };
      }
      return { kind: 'decline' };
    }
    case 'sha': {
      // 决斗中被迫出杀 / 青龙刀追杀
      if (req.reason.kind === 'qinglong' || req.reason.kind === 'jiedao') {
        const t = req.reason.target ? player(s, req.reason.target) : null;
        // 借刀:目标非敌人时宁可交武器也不杀队友
        if (!t || !isEnemy(s, p.role, t)) return { kind: 'decline' };
      }
      const sha = shaCards(s, p);
      if (sha.length > 0) return { kind: 'card', cardId: sha[0] };
      if (hasGeneralSkill(p, 'wusheng')) {
        const red = p.hand.find((id) => isRed(card(s, id).suit));
        if (red !== undefined) return { kind: 'card', cardId: red, skill: 'wusheng' };
      }
      if (hasGeneralSkill(p, 'longdan')) {
        const shan = handOf(s, p, 'shan');
        if (shan.length > 1) return { kind: 'card', cardId: shan[0], skill: 'longdan' };
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
      if (who.id === p.id) {
        const jiu = handOf(s, p, 'jiu');
        if (jiu.length > 0) return { kind: 'card', cardId: jiu[0] };
      }
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

function decideOption(
  s: GameState, p: PlayerState, req: Extract<PendingRequest, { type: 'choose-option' }>,
): ResponseData {
  switch (req.reason) {
    case 'ganglie-choice': {
      // 弃两张手牌还是受 1 点伤害
      if (p.hp <= 1 && p.hand.length >= 2) return { kind: 'option', index: 0 };
      if (p.hand.length >= 4) return { kind: 'option', index: 0 };
      return { kind: 'option', index: 1 };
    }
    case 'fanjian-suit':
      return { kind: 'option', index: Math.floor(Math.random() * req.options.length) };
    case 'luoyi': {
      const shaCount = handOf(s, p, 'sha').length;
      return shaCount >= 2 && p.hp >= 3 ? { kind: 'option', index: 0 } : { kind: 'decline' };
    }
    case 'tuxi':
      return { kind: 'option', index: 0 };
    case 'ganglie': {
      // 只对敌人发动(伤害来源在栈里,简化:总是发动)
      return { kind: 'option', index: 0 };
    }
    case 'cixiong-choice':
      // 手牌富余就弃一张,否则让攻击者摸
      return p.hand.length >= 2 ? { kind: 'option', index: 0 } : { kind: 'option', index: 1 };
    case 'guanshi': {
      const junk = p.hand.filter((id) => keepScore(s, p, id) <= 40);
      return junk.length >= 2 ? { kind: 'option', index: 0 } : { kind: 'decline' };
    }
    case 'hanbing':
      // 目标一血时直接打死,否则拆牌更赚
      return { kind: 'option', index: 0 };
    case 'zhuque':
      // 简化:总是转为火杀(可破藤甲、触发连环传导)
      return { kind: 'option', index: 0 };
    case 'shensu1':
      // 判定区有延时锦囊时,跳过判定+摸牌换一张杀是划算的
      return p.judgeZone.length > 0 ? { kind: 'option', index: 0 } : { kind: 'decline' };
    case 'shensu2':
      // 放弃整个出牌阶段换一张杀通常亏,不发动
      return { kind: 'decline' };
    case 'jushou':
      // 缺牌或残血时摸三张再翻面休整
      return p.hp <= 2 || p.hand.length <= 1
        ? { kind: 'option', index: 0 }
        : { kind: 'decline' };
    case 'tianxiang': {
      const heart = p.hand.some((id) => effectiveSuit(s, id, p.id) === 'heart');
      return heart ? { kind: 'option', index: 0 } : { kind: 'decline' };
    }
    case 'shuangxiong':
      // 简化:摸两张通常优于赌一张判定牌,不发动
      return { kind: 'decline' };
    case 'zaiqi':
      // 已损失体力 ≥2 时,期望回血优于摸两张
      return p.maxHp - p.hp >= 2 ? { kind: 'option', index: 0 } : { kind: 'decline' };
    case 'haoshi':
      // 手牌不多时白赚两张(超过5张要送出一半)
      return p.hand.length + 2 <= 5 ? { kind: 'option', index: 0 } : { kind: 'decline' };
    case 'yinghun':
      return { kind: 'option', index: 0 }; // 摸X弃一,对队友收益最大
    case 'buyi':
      return { kind: 'option', index: 0 }; // 简化:总是尝试救(目标是敌是友都可能)
    case 'pojun': {
      // 翻面通常值得,除非目标满编手牌收益太大——简化:总是发动
      return { kind: 'option', index: 0 };
    }
    case 'xuanfeng':
      return { kind: 'option', index: 0 }; // 视为出杀
    case 'mingce':
      return { kind: 'option', index: 1 }; // 保守:摸一张(杀的目标可能是队友)
    case 'guixin':
      return { kind: 'option', index: 0 };
    case 'shelie':
      return { kind: 'option', index: 0 }; // 五张里最多拿四张,通常优于摸两张
    case 'god-faction':
      return { kind: 'option', index: 3 }; // 简化:选群(不受主公技依赖)
    case 'benghuai':
      // 体力充裕时掉体力,残血时掉上限
      return p.hp >= 2 ? { kind: 'option', index: 0 } : { kind: 'option', index: 1 };
    case 'guhuo-challenge':
      // 保守:体力充裕才质疑(猜错真牌要失去 1 点体力)
      return p.hp >= 4 ? { kind: 'option', index: 0 } : { kind: 'decline' };
    default:
      // 八卦阵 / 奸雄 / 反馈 / 铁骑 / 遗计 / 洛神 / 观星 / 流离:总是发动
      return { kind: 'option', index: 0 };
  }
}

function decideChooseCards(
  s: GameState, p: PlayerState, req: Extract<PendingRequest, { type: 'choose-cards' }>,
): ResponseData {
  switch (req.reason.kind) {
    case 'guicai':
      // v1 简化:鬼才不改判
      return { kind: 'decline' };
    case 'yiji':
      // v1 简化:遗计摸到的牌自己留着
      return { kind: 'decline' };
    case 'liuli': {
      const worst = sortByScoreAsc(s, p, p.hand)[0];
      if (worst !== undefined) return { kind: 'cards', cardIds: [worst] };
      return { kind: 'decline' };
    }
    case 'wugu': {
      const shown = req.shownIds ?? [];
      const best = shown.slice().sort((a, b) => keepScore(s, p, b) - keepScore(s, p, a))[0];
      return { kind: 'cards', cardIds: [best] };
    }
    case 'guanshi-discard': {
      const junk = sortByScoreAsc(s, p, p.hand)
        .filter((id) => !(req.excludeIds ?? []).includes(id))
        .slice(0, 2);
      if (junk.length < 2) return { kind: 'decline' };
      return { kind: 'cards', cardIds: junk };
    }
    case 'cixiong-discard':
      return { kind: 'cards', cardIds: sortByScoreAsc(s, p, p.hand).slice(0, 1) };
    case 'huogong-show': {
      // 展示最舍得亮的牌(低价值优先)
      return { kind: 'cards', cardIds: sortByScoreAsc(s, p, p.hand).slice(0, 1) };
    }
    case 'huogong-match': {
      const match = sortByScoreAsc(s, p, p.hand)
        .filter((id) => card(s, id).suit === req.reason.suit);
      if (match.length === 0) return { kind: 'decline' };
      return { kind: 'cards', cardIds: [match[0]] };
    }
    case 'tianxiang': {
      const hearts = sortByScoreAsc(s, p, p.hand)
        .filter((id) => effectiveSuit(s, id, p.id) === 'heart');
      if (hearts.length === 0) return { kind: 'decline' };
      return { kind: 'cards', cardIds: [hearts[0]] };
    }
    case 'gongxin': {
      const shown = req.shownIds ?? [];
      const heart = shown.find((id) => id > 0 && card(s, id).suit === 'heart');
      if (heart !== undefined) return { kind: 'cards', cardIds: [heart] };
      return { kind: 'decline' };
    }
    case 'pindian': {
      const best = p.hand.slice().sort((a, b) => card(s, b).rank - card(s, a).rank)[0];
      return { kind: 'cards', cardIds: [best] };
    }
    case 'enyuan': {
      const heart = sortByScoreAsc(s, p, p.hand).filter((id) => card(s, id).suit === 'heart');
      if (heart.length > 0) return { kind: 'cards', cardIds: [heart[0]] };
      return { kind: 'decline' }; // 没红桃只能失去体力
    }
    case 'shensu-equip': {
      const equips = Object.values(p.equips).filter((id): id is CardId => id !== undefined);
      if (equips.length === 0) return { kind: 'decline' };
      return { kind: 'cards', cardIds: [equips[0]] };
    }
    default: {
      const sorted = sortByScoreAsc(s, p, p.hand);
      return { kind: 'cards', cardIds: sorted.slice(0, req.min) };
    }
  }
}

function decideChoosePlayer(
  s: GameState, p: PlayerState, req: Extract<PendingRequest, { type: 'choose-player' }>,
): ResponseData {
  const cands = req.candidates.map((id) => player(s, id));
  const enemies = cands.filter((x) => isEnemy(s, p.role, x));
  switch (req.reason.kind) {
    case 'tuxi': {
      const pick = [...enemies, ...cands.filter((x) => !enemies.includes(x))]
        .sort((a, b) => b.hand.length - a.hand.length)
        .slice(0, Math.min(2, req.max))
        .map((x) => x.id);
      return { kind: 'players', players: pick.slice(0, Math.max(req.min, Math.min(2, pick.length))) };
    }
    case 'liuli': {
      const t = enemies[0] ?? cands[0];
      if (!t) return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
      return { kind: 'players', players: [t.id] };
    }
    case 'slash': {
      // 神速的杀:挑最残的敌人
      const t = enemies.sort((a, b) => a.hp - b.hp)[0];
      if (t) return { kind: 'players', players: [t.id] };
      return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
    }
    case 'leiji': {
      const t = enemies.sort((a, b) => a.hp - b.hp)[0];
      if (t) return { kind: 'players', players: [t.id] };
      return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
    }
    case 'tianxiang': {
      // 伤害转移给最残的敌人
      const t = enemies.sort((a, b) => a.hp - b.hp)[0];
      if (t) return { kind: 'players', players: [t.id] };
      return { kind: 'decline' };
    }
    case 'jieming': {
      // 补牌给缺牌最多的自己人(含自己)
      const mine = cands.filter((x) => x.id === p.id || !isEnemy(s, p.role, x));
      const t = mine.sort((a, b) => (b.maxHp - b.hand.length) - (a.maxHp - a.hand.length))[0];
      if (t && t.maxHp - t.hand.length > 0) return { kind: 'players', players: [t.id] };
      return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
    }
    case 'quhu': {
      const t = enemies[0] ?? cands[0];
      return { kind: 'players', players: [t.id] };
    }
    case 'fangzhu': {
      // 翻面敌人(摸牌是代价);没有敌人就放弃
      const t = enemies.find((x) => !x.flipped);
      if (t) return { kind: 'players', players: [t.id] };
      return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
    }
    case 'haoshi': {
      const ally = cands.find((x) => !isEnemy(s, p.role, x));
      return { kind: 'players', players: [(ally ?? cands[0]).id] };
    }
    case 'yinghun': {
      // 送牌给自己人;没有队友则放弃
      const ally = cands.find((x) => !isEnemy(s, p.role, x));
      if (ally) return { kind: 'players', players: [ally.id] };
      return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
    }
    case 'luanwu': {
      const t = enemies[0] ?? cands[0];
      return { kind: 'players', players: [t.id] };
    }
    case 'xuanfeng': {
      const t = enemies[0];
      if (t) return { kind: 'players', players: [t.id] };
      return req.canDecline ? { kind: 'decline' } : { kind: 'players', players: [req.candidates[0]] };
    }
    case 'xuanhuo': {
      const ally = cands.find((x) => !isEnemy(s, p.role, x));
      return { kind: 'players', players: [(ally ?? cands[0]).id] };
    }
    default: {
      if (req.canDecline) return { kind: 'decline' };
      return { kind: 'players', players: req.candidates.slice(0, req.min) };
    }
  }
}

function decidePick(
  s: GameState, req: Extract<PendingRequest, { type: 'pick-card' }>,
): ResponseData {
  // 优先拿走判定区的乐不思蜀(拆自己人)/ 敌人的关键装备
  if (req.judges.length > 0) {
    return { kind: 'pick', zone: 'judge', cardId: req.judges[0] };
  }
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
      if (req.from === 'shown') {
        return { kind: 'cards', cardIds: (req.shownIds ?? []).slice(0, req.min) };
      }
      const p = s.players.find((x) => x.id === req.player)!;
      return { kind: 'cards', cardIds: p.hand.slice(0, req.min) };
    }
    case 'choose-player':
      return req.canDecline
        ? { kind: 'decline' }
        : { kind: 'players', players: req.candidates.slice(0, req.min) };
    case 'arrange-cards':
      return { kind: 'arrange', top: [...req.cardIds], bottom: [] };
    case 'pick-card':
      return req.handCount > 0
        ? { kind: 'pick', zone: 'hand' }
        : req.equips.length > 0
          ? { kind: 'pick', zone: 'equip', cardId: req.equips[0] }
          : { kind: 'pick', zone: 'judge', cardId: req.judges[0] };
    case 'choose-general':
      return { kind: 'general', general: req.candidates[0] };
  }
}
