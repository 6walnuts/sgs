import type { Card, CardName, EquipSlot, Suit } from './types';

const SPECS: Array<{ name: CardName; suit: Suit; ranks: number[] }> = [
  { name: 'sha', suit: 'spade', ranks: [4, 5, 6, 7, 7, 8, 8, 9, 10, 11] },
  { name: 'sha', suit: 'club', ranks: [2, 3, 4, 5, 8, 9, 10, 11, 11] },
  { name: 'sha', suit: 'heart', ranks: [10, 10, 11] },
  { name: 'sha', suit: 'diamond', ranks: [6, 7, 8, 9, 10, 13, 13, 13] },
  { name: 'shan', suit: 'diamond', ranks: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13] },
  { name: 'shan', suit: 'heart', ranks: [2, 2, 13, 13] },
  { name: 'tao', suit: 'heart', ranks: [3, 4, 6, 7, 8, 9, 12] },
  { name: 'tao', suit: 'diamond', ranks: [12] },
  { name: 'guohe', suit: 'spade', ranks: [3, 4, 12] },
  { name: 'guohe', suit: 'club', ranks: [3, 4] },
  { name: 'guohe', suit: 'heart', ranks: [12] },
  { name: 'shunshou', suit: 'spade', ranks: [3, 4] },
  { name: 'shunshou', suit: 'diamond', ranks: [3, 3, 4] },
  { name: 'wuzhong', suit: 'heart', ranks: [7, 8, 9, 11] },
  { name: 'juedou', suit: 'spade', ranks: [1] },
  { name: 'juedou', suit: 'club', ranks: [1] },
  { name: 'juedou', suit: 'diamond', ranks: [1] },
  { name: 'wuxie', suit: 'club', ranks: [12, 13] },
  { name: 'wuxie', suit: 'spade', ranks: [11] },
  { name: 'wuxie', suit: 'diamond', ranks: [12] },
  { name: 'lebusishu', suit: 'spade', ranks: [6] },
  { name: 'lebusishu', suit: 'heart', ranks: [6] },
  { name: 'lebusishu', suit: 'club', ranks: [6] },
  { name: 'nanman', suit: 'spade', ranks: [7, 13] },
  { name: 'nanman', suit: 'club', ranks: [7] },
  { name: 'wanjian', suit: 'heart', ranks: [1] },
  { name: 'wugu', suit: 'heart', ranks: [3, 4] },
  { name: 'taoyuan', suit: 'heart', ranks: [1] },
  { name: 'jiedao', suit: 'club', ranks: [12, 13] },
  { name: 'shandian', suit: 'spade', ranks: [1] },
  { name: 'shandian', suit: 'heart', ranks: [12] },
  { name: 'cixiong', suit: 'spade', ranks: [2] },
  { name: 'hanbing', suit: 'spade', ranks: [2] },
  { name: 'zhangba', suit: 'spade', ranks: [12] },
  { name: 'guanshi', suit: 'diamond', ranks: [5] },
  { name: 'fangtian', suit: 'diamond', ranks: [12] },
  { name: 'qilin', suit: 'heart', ranks: [5] },
  { name: 'renwang', suit: 'club', ranks: [2] },
  { name: 'zhugeliannu', suit: 'club', ranks: [1] },
  { name: 'zhugeliannu', suit: 'diamond', ranks: [1] },
  { name: 'qinglongdao', suit: 'spade', ranks: [5] },
  { name: 'baguazhen', suit: 'spade', ranks: [2] },
  { name: 'baguazhen', suit: 'club', ranks: [2] },
  { name: 'jiama', suit: 'spade', ranks: [5] },
  { name: 'jiama', suit: 'club', ranks: [5] },
  { name: 'jiama', suit: 'heart', ranks: [13] },
  { name: 'jianma', suit: 'heart', ranks: [5] },
  { name: 'jianma', suit: 'spade', ranks: [13] },
  { name: 'jianma', suit: 'diamond', ranks: [13] },
  // 军争篇
  { name: 'huosha', suit: 'heart', ranks: [4, 7, 10] },
  { name: 'huosha', suit: 'diamond', ranks: [4, 5] },
  { name: 'leisha', suit: 'spade', ranks: [4, 5] },
  { name: 'leisha', suit: 'club', ranks: [5, 6, 8] },
  { name: 'jiu', suit: 'spade', ranks: [3, 9] },
  { name: 'jiu', suit: 'club', ranks: [3, 9] },
  { name: 'jiu', suit: 'diamond', ranks: [9] },
  { name: 'huogong', suit: 'heart', ranks: [2, 3] },
  { name: 'huogong', suit: 'diamond', ranks: [12] },
  { name: 'tiesuo', suit: 'spade', ranks: [11, 12] },
  { name: 'tiesuo', suit: 'club', ranks: [10, 11, 12, 13] },
  { name: 'bingliang', suit: 'spade', ranks: [10] },
  { name: 'bingliang', suit: 'club', ranks: [4] },
  { name: 'tengjia', suit: 'spade', ranks: [2] },
  { name: 'tengjia', suit: 'club', ranks: [2] },
  { name: 'baiyin', suit: 'club', ranks: [1] },
  { name: 'zhuque', suit: 'diamond', ranks: [1] },
  { name: 'gudingdao', suit: 'spade', ranks: [1] },
];

export function buildDeck(): Record<number, Card> {
  const cards: Record<number, Card> = {};
  let id = 1;
  for (const spec of SPECS) {
    for (const rank of spec.ranks) {
      cards[id] = { id, name: spec.name, suit: spec.suit, rank };
      id++;
    }
  }
  return cards;
}

export function isRed(suit: Suit): boolean {
  return suit === 'heart' || suit === 'diamond';
}

export function isBlack(suit: Suit): boolean {
  return !isRed(suit);
}

export function equipSlotOf(name: CardName): EquipSlot | null {
  switch (name) {
    case 'zhugeliannu':
    case 'qinglongdao':
    case 'cixiong':
    case 'hanbing':
    case 'zhangba':
    case 'guanshi':
    case 'fangtian':
    case 'qilin':
    case 'zhuque':
    case 'gudingdao':
      return 'weapon';
    case 'baguazhen':
    case 'renwang':
    case 'tengjia':
    case 'baiyin':
      return 'armor';
    case 'jiama':
      return 'horsePlus';
    case 'jianma':
      return 'horseMinus';
    default:
      return null;
  }
}

export const WEAPON_RANGE: Partial<Record<CardName, number>> = {
  zhugeliannu: 1,
  cixiong: 2,
  hanbing: 2,
  qinglongdao: 3,
  zhangba: 3,
  guanshi: 3,
  fangtian: 4,
  qilin: 5,
  zhuque: 4,
  gudingdao: 2,
};

// 三种杀(普通/火/雷)
export function isShaCard(name: CardName): boolean {
  return name === 'sha' || name === 'huosha' || name === 'leisha';
}

export function shaElement(name: CardName): 'fire' | 'thunder' | undefined {
  if (name === 'huosha') return 'fire';
  if (name === 'leisha') return 'thunder';
  return undefined;
}

export function isEquip(name: CardName): boolean {
  return equipSlotOf(name) !== null;
}
