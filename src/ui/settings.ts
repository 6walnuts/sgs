// 对局与界面设置:持久化到 localStorage,菜单修改,进入对局时生效。

export type PortraitStyle = 'cartoon' | 'card';

export interface GameSettings {
  pickGenerals: boolean;
  generalCandidates: number; // 每人候选武将数(主公 +2);8 人局会被引擎自动下调
  aiDelayMs: number;
  portraitStyle: PortraitStyle; // cartoon=内置卡通插画;card=经典卡牌头像(用户自备图片)
  godGenerals: boolean; // 神武将加入武将池(登场自选势力,不进主公候选)
}

const SETTINGS_KEY = 'sgs-settings';

export const DEFAULT_SETTINGS: GameSettings = {
  pickGenerals: true,
  generalCandidates: 3,
  aiDelayMs: 900,
  portraitStyle: 'cartoon',
  godGenerals: false,
};

let cache: GameSettings | null = null;

export function loadSettings(): GameSettings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache!;
}

export function saveSettings(patch: Partial<GameSettings>): GameSettings {
  cache = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cache));
  } catch { /* 隐私模式等存储不可用时忽略 */ }
  return cache;
}
