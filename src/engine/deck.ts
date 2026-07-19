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
      return 'weapon';
    case 'baguazhen':
      return 'armor';
    case 'jiama':
      return 'horsePlus';
    case 'jianma':
      return 'horseMinus';
    default:
      return null;
  }
}

export function isEquip(name: CardName): boolean {
  return equipSlotOf(name) !== null;
}
