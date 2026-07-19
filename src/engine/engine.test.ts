import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import type {
  CardId, CardName, GameState, PlayerId, ResponseData, Role,
} from './types';
import { isRed } from './deck';
import { decide, defaultResponse } from '../ai/simpleAi';

// ---------- 测试工具:直接摆牌构造局面 ----------

function newGame(seed = 1): GameState {
  return createGame({ seed }).state;
}

function removeEverywhere(s: GameState, id: CardId): void {
  const pull = (arr: CardId[]) => {
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
  };
  pull(s.drawPile);
  pull(s.discardPile);
  pull(s.processingZone);
  for (const p of s.players) {
    pull(p.hand);
    pull(p.judgeZone);
    for (const k of Object.keys(p.equips) as Array<keyof typeof p.equips>) {
      if (p.equips[k] === id) delete p.equips[k];
    }
  }
}

function clearHands(s: GameState): void {
  for (const p of s.players) {
    s.drawPile.push(...p.hand);
    p.hand = [];
  }
}

function inUse(s: GameState, id: CardId): boolean {
  return s.players.some(
    (p) => p.hand.includes(id)
      || p.judgeZone.includes(id)
      || Object.values(p.equips).includes(id),
  ) || s.processingZone.includes(id);
}

function findCard(s: GameState, name: CardName, opts?: { red?: boolean }): CardId {
  for (const c of Object.values(s.cards)) {
    if (c.name !== name) continue;
    if (opts?.red !== undefined && isRed(c.suit) !== opts.red) continue;
    if (inUse(s, c.id)) continue;
    return c.id;
  }
  throw new Error(`找不到卡牌 ${name}`);
}

function give(s: GameState, pid: PlayerId, name: CardName, opts?: { red?: boolean }): CardId {
  const id = findCard(s, name, opts);
  removeEverywhere(s, id);
  s.players.find((p) => p.id === pid)!.hand.push(id);
  return id;
}

function equip(s: GameState, pid: PlayerId, name: CardName): CardId {
  const id = findCard(s, name);
  removeEverywhere(s, id);
  const p = s.players.find((x) => x.id === pid)!;
  if (name === 'baguazhen') p.equips.armor = id;
  else if (name === 'jiama') p.equips.horsePlus = id;
  else if (name === 'jianma') p.equips.horseMinus = id;
  else p.equips.weapon = id;
  return id;
}

function setRoles(s: GameState, roles: Record<PlayerId, Role>): void {
  for (const p of s.players) p.role = roles[p.id];
}

// 把牌堆顶设置为指定颜色的牌
function rigDrawTop(s: GameState, opts: { red: boolean }): CardId {
  const id = s.drawPile.find((cid) => isRed(s.cards[cid].suit) === opts.red);
  if (id === undefined) throw new Error('牌堆里找不到指定颜色的牌');
  removeEverywhere(s, id);
  s.drawPile.unshift(id);
  return id;
}

function rigPlay(s: GameState, pid: PlayerId): void {
  s.stack = [];
  s.processingZone = [];
  const p = s.players.find((x) => x.id === pid)!;
  p.flags = {};
  s.turn = { activePlayer: pid, phase: 'play', turnNumber: s.turn.turnNumber };
  s.pendingRequest = { id: s.nextRequestId++, player: pid, type: 'play' };
}

function act(s: GameState, response: ResponseData): GameState {
  const req = s.pendingRequest;
  if (!req) throw new Error('没有待应答请求');
  const r = applyAction(s, { player: req.player, requestId: req.id, response });
  if (r.error) throw new Error(`引擎拒绝:${r.error}`);
  return r.state;
}

function actErr(s: GameState, response: ResponseData): string {
  const req = s.pendingRequest!;
  const r = applyAction(s, { player: req.player, requestId: req.id, response });
  if (!r.error) throw new Error('预期引擎拒绝,但成功了');
  expect(r.state).toBe(s);
  return r.error;
}

function P(s: GameState, pid: PlayerId) {
  return s.players.find((p) => p.id === pid)!;
}

// ---------- 用例 ----------

describe('杀与闪', () => {
  it('杀被闪抵消:无伤害,牌进弃牌堆,回到出牌请求', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const shan = give(s, 'p1', 'shan');
    const hpBefore = P(s, 'p1').hp;

    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });

    s = act(s, { kind: 'card', cardId: shan });
    expect(P(s, 'p1').hp).toBe(hpBefore);
    expect(s.discardPile).toContain(sha);
    expect(s.discardPile).toContain(shan);
    expect(s.stack).toHaveLength(0);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
    expect(P(s, 'p0').flags.sha).toBe(1);
  });

  it('不出闪则受到 1 点伤害', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const hpBefore = P(s, 'p1').hp;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').hp).toBe(hpBefore - 1);
    expect(s.discardPile).toContain(sha);
  });

  it('响应时打出非闪的牌被拒绝', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const tao = give(s, 'p1', 'tao');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    actErr(s, { kind: 'card', cardId: tao });
  });

  it('一回合只能出一杀;诸葛连弩解除限制', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha1 = give(s, 'p0', 'sha');
    const sha2 = give(s, 'p0', 'sha');
    give(s, 'p0', 'zhugeliannu');
    const liannu = P(s, 'p0').hand[2];

    s = act(s, { kind: 'play-card', cardId: sha1, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(actErr(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] })).toContain('次数');

    s = act(s, { kind: 'play-card', cardId: liannu, targets: [] });
    expect(P(s, 'p0').equips.weapon).toBe(liannu);
    s = act(s, { kind: 'play-card', cardId: sha2, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
  });

  it('攻击距离:隔位目标默认打不到,青龙偃月刀可以', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    expect(actErr(s, { kind: 'play-card', cardId: sha, targets: ['p2'] })).toContain('攻击范围');
    equip(s, 'p0', 'qinglongdao');
    const s2 = act(s, { kind: 'play-card', cardId: sha, targets: ['p2'] });
    expect(s2.pendingRequest).toMatchObject({ player: 'p2', pattern: 'shan' });
  });

  it('+1 马拉开距离', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    equip(s, 'p1', 'jiama');
    expect(actErr(s, { kind: 'play-card', cardId: sha, targets: ['p1'] })).toContain('攻击范围');
  });
});

describe('八卦阵', () => {
  it('判定为红色视为闪,不再要求出闪', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    equip(s, 'p1', 'baguazhen');
    const judgeCard = rigDrawTop(s, { red: true });
    const hpBefore = P(s, 'p1').hp;

    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'bagua' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hp).toBe(hpBefore);
    expect(s.discardPile).toContain(judgeCard);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('判定为黑色则仍需出闪', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    equip(s, 'p1', 'baguazhen');
    rigDrawTop(s, { red: false });
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'respond-card', pattern: 'shan' });
  });
});

describe('濒死与死亡', () => {
  it('濒死时按顺序求桃,吃桃后存活', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'rebel', p3: 'spy' });
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    const tao = give(s, 'p3', 'tao');
    P(s, 'p1').hp = 1;

    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p3', type: 'respond-card', pattern: 'tao' });
    s = act(s, { kind: 'card', cardId: tao });
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p1').hp).toBe(1);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('无人救则死亡;杀死反贼摸三张牌', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'rebel', p3: 'spy' });
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    P(s, 'p1').hp = 1;
    P(s, 'p1').general = 'caocao'; // 避免华佗急救干扰

    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p1').alive).toBe(false);
    expect(P(s, 'p1').roleRevealed).toBe(true);
    expect(P(s, 'p0').hand).toHaveLength(3); // 击杀反贼奖励
    expect(s.winner).toBeNull();
  });

  it('主公死亡且内奸非唯一存活时反贼获胜', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'rebel', p1: 'lord', p2: 'loyalist', p3: 'spy' });
    rigPlay(s, 'p0');
    const sha = give(s, 'p0', 'sha');
    P(s, 'p1').hp = 1;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.winner).toEqual(['rebel']);
  });
});

describe('锦囊与无懈可击', () => {
  it('过河拆桥被无懈可击抵消;无懈可以反制无懈', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const gh = give(s, 'p0', 'guohe');
    const wx0 = give(s, 'p0', 'wuxie');
    const target = give(s, 'p1', 'sha');
    const wx2 = give(s, 'p2', 'wuxie');

    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    // 询问顺序从当前回合角色开始:p0 先被问
    expect(s.pendingRequest).toMatchObject({ player: 'p0', pattern: 'wuxie' });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p2', pattern: 'wuxie' });
    s = act(s, { kind: 'card', cardId: wx2 });
    // p2 无懈了过拆,重新询问,p0 可反制
    expect(s.pendingRequest).toMatchObject({ player: 'p0', pattern: 'wuxie' });
    s = act(s, { kind: 'card', cardId: wx0 });
    // 无懈被反制,过拆继续生效
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'pick-card', target: 'p1' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(s.discardPile).toContain(target);
    expect(s.discardPile).toContain(gh);
  });

  it('只有一张无懈时锦囊被抵消', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const gh = give(s, 'p0', 'guohe');
    const kept = give(s, 'p1', 'sha');
    const wx = give(s, 'p2', 'wuxie');
    s = act(s, { kind: 'play-card', cardId: gh, targets: ['p1'] });
    s = act(s, { kind: 'card', cardId: wx });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
    expect(P(s, 'p1').hand).toContain(kept);
    expect(s.discardPile).toContain(gh);
  });

  it('顺手牵羊只能拿距离 1 的目标,拿到手牌', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const ss = give(s, 'p0', 'shunshou');
    const loot = give(s, 'p1', 'sha');
    give(s, 'p2', 'sha');
    expect(actErr(s, { kind: 'play-card', cardId: ss, targets: ['p2'] })).toContain('距离');
    s = act(s, { kind: 'play-card', cardId: ss, targets: ['p1'] });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p0').hand).toContain(loot);
  });

  it('无中生有摸两张牌', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const wz = give(s, 'p0', 'wuzhong');
    s = act(s, { kind: 'play-card', cardId: wz, targets: [] });
    expect(P(s, 'p0').hand).toHaveLength(2);
    expect(s.discardPile).toContain(wz);
  });

  it('决斗:双方轮流出杀,先不出者受伤', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    const jd = give(s, 'p0', 'juedou');
    const sha1 = give(s, 'p1', 'sha');
    const hp0 = P(s, 'p0').hp;
    s = act(s, { kind: 'play-card', cardId: jd, targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'sha', reason: { kind: 'duel' } });
    s = act(s, { kind: 'card', cardId: sha1 });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', pattern: 'sha' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p0').hp).toBe(hp0 - 1);
    expect(s.discardPile).toContain(jd);
  });
});

describe('回合流程', () => {
  it('弃牌阶段弃到手牌上限,随后轮到下家', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    for (let i = 0; i < 5; i++) give(s, 'p0', 'sha');
    P(s, 'p0').hp = 2;
    P(s, 'p0').maxHp = 4;

    s = act(s, { kind: 'end-phase' });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'choose-cards', min: 3 });
    const toDiscard = P(s, 'p0').hand.slice(0, 3);
    s = act(s, { kind: 'cards', cardIds: toDiscard });
    expect(P(s, 'p0').hand).toHaveLength(2);
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'play' });
    expect(P(s, 'p1').hand).toHaveLength(2); // 摸牌阶段摸了两张
  });
});

describe('武将技能', () => {
  it('奸雄:受到伤害后收下造成伤害的杀', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p1').general = 'caocao';
    const sha = give(s, 'p0', 'sha');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'choose-option', reason: 'jianxiong' });
    s = act(s, { kind: 'option', index: 0 });
    expect(P(s, 'p1').hand).toContain(sha);
  });

  it('反馈:受到伤害后拿伤害来源一张牌', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p1').general = 'simayi';
    const sha = give(s, 'p0', 'sha');
    const stolen = give(s, 'p0', 'tao');
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    s = act(s, { kind: 'option', index: 0 });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', type: 'pick-card', target: 'p0' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p1').hand).toContain(stolen);
  });

  it('制衡:弃任意张牌摸等量牌,每回合一次', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p0').general = 'sunquan';
    const a = give(s, 'p0', 'sha');
    const b = give(s, 'p0', 'sha');
    give(s, 'p0', 'tao');
    s = act(s, { kind: 'use-skill', skill: 'zhiheng', cardIds: [a, b] });
    expect(P(s, 'p0').hand).toHaveLength(3);
    expect(s.discardPile).toContain(a);
    expect(actErr(s, { kind: 'use-skill', skill: 'zhiheng', cardIds: [P(s, 'p0').hand[0]] }))
      .toContain('一次');
  });

  it('仁德:给出两张牌回复 1 点体力', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p0').general = 'liubei';
    P(s, 'p0').hp = 2;
    const a = give(s, 'p0', 'sha');
    const b = give(s, 'p0', 'sha');
    s = act(s, { kind: 'use-skill', skill: 'rende', cardIds: [a, b], targets: ['p1'] });
    expect(P(s, 'p0').hp).toBe(3);
    expect(P(s, 'p1').hand).toEqual(expect.arrayContaining([a, b]));
  });

  it('武圣:红色牌当杀使用', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p0').general = 'guanyu';
    const red = give(s, 'p0', 'tao', { red: true });
    s = act(s, { kind: 'use-skill', skill: 'wusheng', cardIds: [red], targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p1', pattern: 'shan' });
  });

  it('奇袭:黑色牌当过河拆桥', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p0').general = 'ganning';
    const black = give(s, 'p0', 'sha', { red: false });
    give(s, 'p1', 'tao');
    s = act(s, { kind: 'use-skill', skill: 'qixi', cardIds: [black], targets: ['p1'] });
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'pick-card', target: 'p1' });
    s = act(s, { kind: 'pick', zone: 'hand' });
    expect(P(s, 'p1').hand).toHaveLength(0);
    expect(s.discardPile).toContain(black);
  });

  it('离间:视为一名男性角色对另一名使用决斗', () => {
    let s = newGame();
    clearHands(s);
    rigPlay(s, 'p0');
    P(s, 'p0').general = 'diaochan';
    P(s, 'p1').general = 'guanyu';
    P(s, 'p2').general = 'caocao';
    const junk = give(s, 'p0', 'sha');
    const hp2 = P(s, 'p2').hp;
    s = act(s, { kind: 'use-skill', skill: 'lijian', cardIds: [junk], targets: ['p1', 'p2'] });
    // p2 作为决斗目标先出杀
    expect(s.pendingRequest).toMatchObject({ player: 'p2', pattern: 'sha' });
    s = act(s, { kind: 'decline' });
    expect(P(s, 'p2').hp).toBe(hp2 - 1);
    expect(s.pendingRequest).toMatchObject({ player: 'p0', type: 'play' });
  });

  it('急救:华佗回合外可用红牌当桃救人', () => {
    let s = newGame();
    clearHands(s);
    setRoles(s, { p0: 'lord', p1: 'rebel', p2: 'rebel', p3: 'spy' });
    rigPlay(s, 'p0');
    P(s, 'p3').general = 'huatuo';
    const sha = give(s, 'p0', 'sha');
    const red = give(s, 'p3', 'shan', { red: true });
    P(s, 'p1').hp = 1;
    s = act(s, { kind: 'play-card', cardId: sha, targets: ['p1'] });
    s = act(s, { kind: 'decline' });
    expect(s.pendingRequest).toMatchObject({ player: 'p3', pattern: 'tao' });
    s = act(s, { kind: 'card', cardId: red, skill: 'jijiu' });
    expect(P(s, 'p1').alive).toBe(true);
    expect(P(s, 'p1').hp).toBe(1);
  });
});

describe('序列化与对局完整性', () => {
  it('GameState 可完整 JSON 序列化并继续运行', () => {
    const s = newGame(42);
    const revived: GameState = JSON.parse(JSON.stringify(s));
    expect(revived).toEqual(s);
    // 在反序列化的状态上继续走若干步
    let cur = revived;
    for (let i = 0; i < 30 && !cur.winner; i++) {
      const req = cur.pendingRequest!;
      const r = applyAction(cur, {
        player: req.player, requestId: req.id, response: defaultResponse(cur, req),
      });
      expect(r.error).toBeUndefined();
      cur = r.state;
    }
  });

  it('AI 互相对战能正常终局(多个种子)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let s = newGame(seed);
      let steps = 0;
      while (!s.winner && steps < 5000) {
        const req = s.pendingRequest!;
        let resp: ResponseData;
        try {
          resp = decide(s, req.player, req);
        } catch {
          resp = defaultResponse(s, req);
        }
        let r = applyAction(s, { player: req.player, requestId: req.id, response: resp });
        if (r.error) {
          r = applyAction(s, { player: req.player, requestId: req.id, response: defaultResponse(s, req) });
        }
        expect(r.error).toBeUndefined();
        s = r.state;
        steps++;
      }
      expect(s.winner).not.toBeNull();
    }
  });
});
