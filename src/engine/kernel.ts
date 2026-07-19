// 引擎内部共享工具:上下文、事件、区域移动、摸牌、伤害/死亡/胜负。
// 所有函数只操作传入的 ctx.s(applyAction 已整体 clone),不做任何 IO。

import type {
  Card, CardId, EffectFrame, GameEvent, GameState, PendingRequest, PlayerId,
  PlayerState, Role, SkillName, ZoneRef,
} from './types';
import { ALL_GENERAL_IDS, GENERALS } from './generals';
import type { GeneralId } from './types';
import { equipSlotOf } from './deck';
import { randInt, shuffled } from './rng';

export class EngineError extends Error {}

export interface Ctx {
  s: GameState;
  events: GameEvent[];
}

export function fail(msg: string): never {
  throw new EngineError(msg);
}

export function emit(ctx: Ctx, ev: GameEvent): void {
  ctx.events.push(ev);
  ctx.s.eventLog.push(ev);
}

export function player(s: GameState, id: PlayerId): PlayerState {
  const p = s.players.find((x) => x.id === id);
  if (!p) fail(`未知玩家 ${id}`);
  return p;
}

export function card(s: GameState, id: CardId): Card {
  const c = s.cards[id];
  if (!c) fail(`未知卡牌 ${id}`);
  return c;
}

export function alivePlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => p.alive);
}

// 从 start(默认当前回合角色)起,按座次顺序列出存活玩家
export function orderFrom(s: GameState, start?: PlayerId): PlayerId[] {
  const alive = alivePlayers(s);
  const startSeat = player(s, start ?? s.turn.activePlayer).seat;
  return alive
    .slice()
    .sort((a, b) => {
      const da = (a.seat - startSeat + s.players.length) % s.players.length;
      const db = (b.seat - startSeat + s.players.length) % s.players.length;
      return da - db;
    })
    .map((p) => p.id);
}

export function hasSkill(_s: GameState, p: PlayerState, skill: SkillName): boolean {
  if (!p.alive) return false;
  if (p.skillsLost) return false; // 断肠:失去所有武将技能
  const def = GENERALS[p.general];
  const awakened = p.usedLimit ?? [];
  let owns = def.skills.includes(skill);
  if (!owns) {
    // 觉醒技获得的技能
    if (skill === 'jixi' && def.skills.includes('zaoxian') && awakened.includes('zaoxian')) owns = true;
    else if (skill === 'guanxing' && def.skills.includes('zhiji') && awakened.includes('zhiji')) owns = true;
    else if ((skill === 'yingzi' || skill === 'yinghun')
        && def.skills.includes('hunzi') && awakened.includes('hunzi')) owns = true;
    // 化身:左慈声明获得的技能
    else if (def.skills.includes('huashen') && p.huashenSkill === skill) owns = true;
  }
  if (!owns) return false;
  const lordOnly: SkillName[] = ['jiuyuan', 'xueyi', 'songwei', 'baonve'];
  if (lordOnly.includes(skill) && p.role !== 'lord') return false;
  return true;
}

// 有效势力:神武将用登场时自选的势力,其余用武将本身势力
export function factionOf(_s: GameState, p: PlayerState): 'wei' | 'shu' | 'wu' | 'qun' | 'god' {
  return p.faction ?? GENERALS[p.general].faction;
}

export function equipCardIds(p: PlayerState): CardId[] {
  return Object.values(p.equips).filter((x): x is CardId => x !== undefined);
}

export function totalCardCount(p: PlayerState): number {
  return p.hand.length + equipCardIds(p).length;
}

// ---------- 请求 ----------

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function ask(ctx: Ctx, req: DistributiveOmit<PendingRequest, 'id'>): void {
  if (ctx.s.pendingRequest) fail('内部错误:已有未决请求');
  ctx.s.pendingRequest = { ...req, id: ctx.s.nextRequestId++ } as PendingRequest;
}

// ---------- 区域与移动 ----------

export function findZone(s: GameState, id: CardId): ZoneRef {
  for (const p of s.players) {
    if (p.hand.includes(id)) return { zone: 'hand', player: p.id };
    if (equipCardIds(p).includes(id)) return { zone: 'equip', player: p.id };
    if (p.judgeZone.includes(id)) return { zone: 'judge', player: p.id };
    if (p.buqu?.includes(id)) return { zone: 'buqu', player: p.id };
    if (p.tian?.includes(id)) return { zone: 'tian', player: p.id };
  }
  if (s.processingZone.includes(id)) return { zone: 'processing' };
  if (s.discardPile.includes(id)) return { zone: 'discard' };
  if (s.drawPile.includes(id)) return { zone: 'draw' };
  fail(`卡牌 ${id} 不在任何区域`);
}

function removeFrom(s: GameState, id: CardId, from: ZoneRef): void {
  const pull = (arr: CardId[]) => {
    const i = arr.indexOf(id);
    if (i < 0) fail(`卡牌 ${id} 不在预期区域`);
    arr.splice(i, 1);
  };
  switch (from.zone) {
    case 'hand': pull(player(s, from.player!).hand); break;
    case 'judge': pull(player(s, from.player!).judgeZone); break;
    case 'buqu': pull(player(s, from.player!).buqu ?? []); break;
    case 'tian': pull(player(s, from.player!).tian ?? []); break;
    case 'processing': pull(s.processingZone); break;
    case 'discard': pull(s.discardPile); break;
    case 'draw': pull(s.drawPile); break;
    case 'equip': {
      const p = player(s, from.player!);
      const slot = equipSlotOf(card(s, id).name);
      if (!slot || p.equips[slot] !== id) fail(`卡牌 ${id} 不在装备区`);
      delete p.equips[slot];
      break;
    }
  }
}

function insertTo(s: GameState, id: CardId, to: ZoneRef): void {
  switch (to.zone) {
    case 'hand': player(s, to.player!).hand.push(id); break;
    case 'judge': player(s, to.player!).judgeZone.push(id); break;
    case 'buqu': {
      const p = player(s, to.player!);
      if (!p.buqu) p.buqu = [];
      p.buqu.push(id);
      break;
    }
    case 'tian': {
      const p = player(s, to.player!);
      if (!p.tian) p.tian = [];
      p.tian.push(id);
      break;
    }
    case 'processing': s.processingZone.push(id); break;
    case 'discard': s.discardPile.push(id); break;
    case 'draw': s.drawPile.push(id); break;
    case 'equip': {
      const p = player(s, to.player!);
      const slot = equipSlotOf(card(s, id).name);
      if (!slot) fail(`${id} 不是装备牌`);
      p.equips[slot] = id;
      break;
    }
  }
}

export function moveCards(ctx: Ctx, ids: CardId[], to: ZoneRef, reason?: string): void {
  if (ids.length === 0) return;
  const s = ctx.s;
  const from = findZone(s, ids[0]);
  // 记录移动前的手牌/装备归属,用于连营、枭姬触发
  const handOwners = new Map<PlayerId, number>();
  const equipLoss = new Map<PlayerId, number>();
  const baiyinLosers: PlayerId[] = [];
  for (const id of ids) {
    const z = findZone(s, id);
    if (z.zone === 'hand' && z.player) {
      handOwners.set(z.player, player(s, z.player).hand.length);
    }
    if (z.zone === 'equip' && z.player && !(to.zone === 'equip' && to.player === z.player)) {
      equipLoss.set(z.player, (equipLoss.get(z.player) ?? 0) + 1);
      if (card(s, id).name === 'baiyin') baiyinLosers.push(z.player);
    }
    removeFrom(s, id, z);
  }
  for (const id of ids) insertTo(s, id, to);
  emit(ctx, { type: 'cardsMoved', cardIds: ids, from, to, reason });
  // 连营:失去最后的手牌后摸一张
  for (const [pid] of handOwners) {
    const p = player(s, pid);
    if (p.hand.length === 0 && p.alive && hasSkill(s, p, 'lianying')
        && !(to.zone === 'hand' && to.player === pid)) {
      emit(ctx, { type: 'skillInvoked', player: pid, skill: 'lianying' });
      drawCards(ctx, pid, 1);
    }
  }
  // 枭姬:每失去一张装备区的牌摸两张
  for (const [pid, n] of equipLoss) {
    const p = player(s, pid);
    if (p.alive && hasSkill(s, p, 'xiaoji')) {
      for (let i = 0; i < n; i++) {
        emit(ctx, { type: 'skillInvoked', player: pid, skill: 'xiaoji' });
        drawCards(ctx, pid, 2);
      }
    }
  }
  // 白银狮子:失去该装备时回复 1 点体力
  for (const pid of baiyinLosers) {
    const p = player(s, pid);
    if (p.alive && p.hp < p.maxHp) {
      emit(ctx, { type: 'skillInvoked', player: pid, skill: 'baiyin' });
      heal(ctx, pid, 1);
    }
  }
  // 旋风:凌统失去装备区的牌后,可视为出杀或对距离 1 造成伤害。
  // 插到栈底:当前结算完毕后再询问,避免打断持有栈顶引用的结算帧
  for (const [pid] of equipLoss) {
    const p = player(s, pid);
    if (p.alive && hasSkill(s, p, 'xuanfeng')) {
      s.stack.unshift({ type: 'xuanfeng', step: 'wait', player: pid });
    }
  }
  // 屯田:邓艾于回合外失去手牌/装备后,可判定屯田(同样插到栈底)
  const tuntianLosers = new Set([...handOwners.keys(), ...equipLoss.keys()]);
  for (const pid of tuntianLosers) {
    const p = player(s, pid);
    if (p.alive && s.turn.activePlayer !== pid && hasSkill(s, p, 'tuntian')
        && !(to.zone === 'hand' && to.player === pid)
        && !(to.zone === 'equip' && to.player === pid)) {
      s.stack.unshift({ type: 'tuntian', step: 'ask', player: pid });
    }
  }
  // 落英:其他角色的梅花牌因弃置进入弃牌堆时,曹植获得之(简化为自动)
  if (to.zone === 'discard' && !['play', 'respond', 'recast', 'pindian', 'judge-replaced'].includes(reason ?? '')) {
    const poet = alivePlayers(s).find((x) => hasSkill(s, x, 'luoying'));
    if (poet) {
      const clubs = ids.filter((id) => {
        const z = from;
        return card(s, id).suit === 'club'
          && (z.zone === 'hand' || z.zone === 'equip' || z.zone === 'judge')
          && z.player !== undefined && z.player !== poet.id;
      });
      if (clubs.length > 0) {
        emit(ctx, { type: 'skillInvoked', player: poet.id, skill: 'luoying' });
        moveCards(ctx, clubs, { zone: 'hand', player: poet.id }, 'luoying');
      }
    }
  }
  // 伤逝:手牌减少后检查补牌
  for (const [pid] of handOwners) {
    maybeShangshi(ctx, pid);
  }
}

// 铁索连环:切换横置状态
export function toggleChain(ctx: Ctx, pid: PlayerId): void {
  const p = player(ctx.s, pid);
  p.chained = !p.chained;
  emit(ctx, { type: 'chained', player: pid, chained: !!p.chained });
}

export function moveCard(ctx: Ctx, id: CardId, to: ZoneRef, reason?: string): void {
  moveCards(ctx, [id], to, reason);
}

export function inProcessing(s: GameState, id: CardId | null): boolean {
  return id !== null && s.processingZone.includes(id);
}

// ---------- 摸牌 ----------

export function refillDrawPile(ctx: Ctx): void {
  if (ctx.s.drawPile.length > 0 || ctx.s.discardPile.length === 0) return;
  ctx.s.drawPile = shuffled(ctx.s, ctx.s.discardPile);
  ctx.s.discardPile = [];
  emit(ctx, { type: 'reshuffled' });
}

export function drawCards(ctx: Ctx, pid: PlayerId, n: number): CardId[] {
  const p = player(ctx.s, pid);
  const drawn: CardId[] = [];
  for (let i = 0; i < n; i++) {
    refillDrawPile(ctx);
    const id = ctx.s.drawPile.shift();
    if (id === undefined) break;
    p.hand.push(id);
    drawn.push(id);
  }
  if (drawn.length > 0) {
    emit(ctx, {
      type: 'cardsMoved', cardIds: drawn,
      from: { zone: 'draw' }, to: { zone: 'hand', player: pid }, reason: 'draw',
    });
  }
  return drawn;
}

export function flipToProcessing(ctx: Ctx): CardId {
  refillDrawPile(ctx);
  const id = ctx.s.drawPile.shift();
  if (id === undefined) fail('牌堆与弃牌堆均已耗尽');
  ctx.s.processingZone.push(id);
  return id;
}

export function pickRandomHand(ctx: Ctx, p: PlayerState): CardId {
  if (p.hand.length === 0) fail(`${p.id} 没有手牌`);
  return p.hand[randInt(ctx.s, p.hand.length)];
}

// 化身牌:从未登场且未被化身占用的非神武将中随机发放
export function grantHuashen(s: GameState, pid: PlayerId, n: number): void {
  const p = player(s, pid);
  const used = new Set<GeneralId>(s.players.map((x) => x.general));
  for (const x of s.players) for (const g of x.huashen ?? []) used.add(g);
  const pool = ALL_GENERAL_IDS.filter((g) => !used.has(g) && GENERALS[g].faction !== 'god');
  p.huashen = p.huashen ?? [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = randInt(s, pool.length);
    p.huashen.push(pool[idx]);
    pool.splice(idx, 1);
  }
}

// ---------- 体力 ----------

export function heal(ctx: Ctx, pid: PlayerId, n: number, healer?: PlayerId): void {
  const p = player(ctx.s, pid);
  const next = Math.min(p.maxHp, p.hp + n);
  if (next === p.hp) return;
  const delta = next - p.hp;
  p.hp = next;
  emit(ctx, { type: 'hpChanged', player: pid, hp: p.hp, delta });
  // 恩怨:其他角色令法正回复体力后,该角色摸一张牌
  if (healer && healer !== pid && hasSkill(ctx.s, p, 'enyuan')
      && player(ctx.s, healer).alive) {
    emit(ctx, { type: 'skillInvoked', player: pid, skill: 'enyuan' });
    drawCards(ctx, healer, 1);
  }
  // 不屈:体力回复到 1 以上时弃置创牌
  if (p.hp > 0 && p.buqu && p.buqu.length > 0) {
    moveCards(ctx, [...p.buqu], { zone: 'discard' }, 'buqu');
  }
  maybeShangshi(ctx, pid);
}

// 伤逝:张春华手牌数少于已损失体力值时,将手牌摸至该数(简化为自动)
export function maybeShangshi(ctx: Ctx, pid: PlayerId): void {
  const p = player(ctx.s, pid);
  if (!p.alive || !hasSkill(ctx.s, p, 'shangshi')) return;
  const x = p.maxHp - p.hp;
  if (p.hand.length < x) {
    emit(ctx, { type: 'skillInvoked', player: pid, skill: 'shangshi' });
    drawCards(ctx, pid, x - p.hand.length);
  }
}

// 失去体力(非伤害:不触发奸雄/反馈/刚烈/遗计,但会进入濒死)
export function loseHp(ctx: Ctx, pid: PlayerId, n: number): void {
  const p = player(ctx.s, pid);
  p.hp -= n;
  emit(ctx, { type: 'hpChanged', player: pid, hp: p.hp, delta: -n });
  maybeShangshi(ctx, pid);
  if (p.hp <= 0 && p.alive) {
    pushFrame(ctx, {
      type: 'dying', step: 'ask', who: pid, source: null,
      queue: orderFrom(ctx.s), idx: 0,
    });
  }
}

// 克己计数:自己回合的出牌阶段使用或打出过杀
export function markShaUsage(ctx: Ctx, pid: PlayerId): void {
  if (ctx.s.turn.activePlayer === pid && ctx.s.turn.phase === 'play') {
    player(ctx.s, pid).flags.anySha = true;
  }
}

export function pushFrame(ctx: Ctx, f: EffectFrame): void {
  ctx.s.stack.push(f);
}

export function popFrame(ctx: Ctx, f: EffectFrame, childResult?: unknown): void {
  const top = ctx.s.stack[ctx.s.stack.length - 1];
  if (top !== f) fail('内部错误:弹出的不是栈顶帧');
  ctx.s.stack.pop();
  if (childResult !== undefined && ctx.s.stack.length > 0) {
    (ctx.s.stack[ctx.s.stack.length - 1] as { childResult?: unknown }).childResult = childResult;
  }
}

// ---------- 死亡与胜负 ----------

export function performDeath(ctx: Ctx, pid: PlayerId, killer: PlayerId | null): void {
  const s = ctx.s;
  const dead = player(s, pid);
  dead.alive = false;
  dead.roleRevealed = true;
  emit(ctx, { type: 'playerDied', player: pid, role: dead.role, killer });

  // 行殇:曹丕获得死亡角色的手牌与装备(简化为自动发动),判定区仍弃置
  const mourner = alivePlayers(s).find((x) => x.id !== pid && hasSkill(s, x, 'xingshang'));
  const loot = [...dead.hand, ...equipCardIds(dead)];
  const rest = [...dead.judgeZone, ...(dead.buqu ?? []), ...(dead.tian ?? [])];
  if (mourner && loot.length > 0) {
    emit(ctx, { type: 'skillInvoked', player: mourner.id, skill: 'xingshang' });
    moveCards(ctx, loot, { zone: 'hand', player: mourner.id }, 'xingshang');
    if (rest.length > 0) moveCards(ctx, rest, { zone: 'discard' }, 'death');
  } else {
    const all = [...loot, ...rest];
    if (all.length > 0) moveCards(ctx, all, { zone: 'discard' }, 'death');
  }

  checkVictory(ctx);
  if (s.winner) return;

  // 武魂:神关羽死亡时,令对其造成伤害最多的角色判定,非桃/桃园则死
  if (GENERALS[dead.general].skills.includes('wuhun') && dead.damageTaken) {
    let victim: PlayerId | null = null;
    let most = 0;
    for (const [pid, n] of Object.entries(dead.damageTaken)) {
      const q = s.players.find((x) => x.id === pid);
      if (q?.alive && n > most) {
        most = n;
        victim = pid;
      }
    }
    if (victim) {
      emit(ctx, { type: 'skillInvoked', player: pid, skill: 'wuhun' });
      // 插到栈底,等当前结算(濒死/死亡)完毕后进行
      s.stack.unshift({ type: 'wuhun', step: 'start', victim });
    }
  }
  // 断肠:杀死蔡文姬的角色失去所有武将技能
  if (killer && GENERALS[dead.general].skills.includes('duanchang')) {
    const k = player(s, killer);
    if (k.alive) {
      emit(ctx, { type: 'skillInvoked', player: pid, skill: 'duanchang' });
      k.skillsLost = true;
    }
  }
  // 挥泪:杀死马谡的角色立即弃置所有牌(此时马谡已死,直接查武将定义)
  if (killer && GENERALS[dead.general].skills.includes('huilei')) {
    const k = player(s, killer);
    if (k.alive) {
      emit(ctx, { type: 'skillInvoked', player: pid, skill: 'huilei' });
      const cards = [...k.hand, ...equipCardIds(k)];
      if (cards.length > 0) moveCards(ctx, cards, { zone: 'discard' }, 'huilei');
    }
  }
  // 奖惩:任何角色杀死反贼摸三张;主公杀死忠臣弃置所有牌
  if (killer) {
    const k = player(s, killer);
    if (k.alive) {
      if (dead.role === 'rebel') {
        drawCards(ctx, killer, 3);
      } else if (dead.role === 'loyalist' && k.role === 'lord') {
        const cards = [...k.hand, ...equipCardIds(k)];
        if (cards.length > 0) moveCards(ctx, cards, { zone: 'discard' }, 'punish');
      }
    }
  }
}

export function checkVictory(ctx: Ctx): void {
  const s = ctx.s;
  if (s.winner) return;
  const alive = alivePlayers(s);
  const lordAlive = alive.some((p) => p.role === 'lord');
  if (!lordAlive) {
    const winner: Role[] =
      alive.length === 1 && alive[0].role === 'spy' ? ['spy'] : ['rebel'];
    setWinner(ctx, winner);
    return;
  }
  const rebelOrSpyAlive = alive.some((p) => p.role === 'rebel' || p.role === 'spy');
  if (!rebelOrSpyAlive) {
    setWinner(ctx, ['lord', 'loyalist']);
  }
}

function setWinner(ctx: Ctx, winner: Role[]): void {
  ctx.s.winner = winner;
  for (const p of ctx.s.players) p.roleRevealed = true;
  emit(ctx, { type: 'gameOver', winner });
}
