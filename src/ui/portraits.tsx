// 武将头像:自绘矢量插画(避免官方牌面图的版权问题),按势力配色。
// 若 public/generals/<武将id>.jpg 存在则优先显示该图片,方便替换成自备图源。

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { GeneralId } from '../engine/types';
import { GENERALS } from '../engine/generals';
import { GENERAL_NAMES } from './text';

export const FACTION_COLORS: Record<string, string> = {
  wei: '#3f6ea5',
  shu: '#b04a3a',
  wu: '#3f8a5a',
  qun: '#8a8878',
};

const FACTION_BG: Record<string, [string, string]> = {
  wei: ['#2a3f5c', '#16233a'],
  shu: ['#5c2a26', '#38160f'],
  wu: ['#26502f', '#12301a'],
  qun: ['#4c4a3e', '#2a2921'],
};

// ---------- 共用部件 ----------

function Robe({ color, trim }: { color: string; trim: string }) {
  return (
    <>
      <path d="M8 96 C10 72 24 61 40 61 C56 61 70 72 72 96 Z" fill={color} />
      <path d="M40 62 C35 68 32 80 30 96 L41 74 Z" fill={trim} />
      <path d="M40 62 C45 68 48 80 50 96 L41 74 Z" fill={trim} opacity="0.75" />
    </>
  );
}

function Face({ skin, neck }: { skin: string; neck: string }) {
  return (
    <>
      <rect x="34" y="48" width="12" height="15" rx="4" fill={neck} />
      <ellipse cx="24.5" cy="40" rx="3.2" ry="5" fill={skin} />
      <ellipse cx="55.5" cy="40" rx="3.2" ry="5" fill={skin} />
      <ellipse cx="40" cy="38" rx="15.5" ry="17.5" fill={skin} />
    </>
  );
}

function Eyes({ lift = 0, width = 1.7 }: { lift?: number; width?: number }) {
  return (
    <>
      <path d={`M29 ${38.5 - lift} Q33 36.4 36.6 ${38.2 - lift}`} stroke="#241a12" strokeWidth={width} fill="none" strokeLinecap="round" />
      <path d={`M43.4 ${38.2 - lift} Q47 36.4 51 ${38.5 - lift}`} stroke="#241a12" strokeWidth={width} fill="none" strokeLinecap="round" />
      <circle cx="33.2" cy="38.6" r="1.15" fill="#241a12" />
      <circle cx="46.8" cy="38.6" r="1.15" fill="#241a12" />
    </>
  );
}

function Brows({ angle = 0, color = '#241a12', y = 33 }: { angle?: number; color?: string; y?: number }) {
  return (
    <>
      <path d={`M28 ${y + angle} L37 ${y - angle}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d={`M43 ${y - angle} L52 ${y + angle}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function Nose() {
  return <path d="M40 40 L39.2 45 Q40.2 46.4 41.8 45.4" stroke="#a3745a" strokeWidth="1.3" fill="none" strokeLinecap="round" />;
}

function Mouth({ curve = 1.6, y = 50 }: { curve?: number; y?: number }) {
  return <path d={`M36.5 ${y} Q40 ${y + curve} 43.5 ${y}`} stroke="#8a4a3a" strokeWidth="1.6" fill="none" strokeLinecap="round" />;
}

// ---------- 各武将 ----------

const PORTRAITS: Record<GeneralId, () => ReactNode> = {
  liubei: () => (
    <>
      <Face skin="#eac49c" neck="#d8ab7f" />
      {/* 黑发与冠 */}
      <path d="M25 32 Q26 21 40 20 Q54 21 55 32 Q48 26 40 26 Q32 26 25 32 Z" fill="#241a12" />
      <rect x="31" y="15" width="18" height="6" rx="2" fill="#d8b84a" />
      <rect x="36" y="9" width="8" height="7" rx="2" fill="#b5893a" />
      <circle cx="40" cy="18" r="1.6" fill="#3f8a5a" />
      <Brows angle={1} />
      <Eyes />
      <Nose />
      <Mouth />
      {/* 八字须与山羊须 */}
      <path d="M35 47.5 Q32 49 30.5 52" stroke="#241a12" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M45 47.5 Q48 49 49.5 52" stroke="#241a12" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M38 53.5 Q40 60 42 53.5 Q41 55 40 55 Z" fill="#241a12" />
      <Robe color="#3d6b4f" trim="#d8b84a" />
      <circle cx="40" cy="80" r="3" fill="#d8b84a" opacity="0.9" />
    </>
  ),

  guanyu: () => (
    <>
      <Face skin="#c8654a" neck="#b25640" />
      {/* 绿头巾 */}
      <path d="M24 33 Q24 18 40 17 Q56 18 56 33 Q50 24 40 24 Q30 24 24 33 Z" fill="#2f6b45" />
      <path d="M53 22 Q60 24 58 33 L54 28 Z" fill="#2f6b45" />
      <rect x="26" y="27" width="28" height="4" rx="2" fill="#245236" />
      {/* 卧蚕眉丹凤眼 */}
      <path d="M27 33 Q33 30 38 32.5" stroke="#241a12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M42 32.5 Q47 30 53 33" stroke="#241a12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M29 39 Q34 36.6 37.5 38.6" stroke="#241a12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M42.5 38.6 Q46 36.6 51 39" stroke="#241a12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Nose />
      {/* 长髯 */}
      <path d="M27 42 Q28 56 34 62 Q37 74 40 76 Q43 74 46 62 Q52 56 53 42 Q50 50 44 51 Q42 49 40 49 Q38 49 36 51 Q30 50 27 42 Z" fill="#1c130c" />
      <path d="M35 47 Q33 52 33.5 57" stroke="#3a2a1c" strokeWidth="1" fill="none" />
      <path d="M45 47 Q47 52 46.5 57" stroke="#3a2a1c" strokeWidth="1" fill="none" />
      <Robe color="#2f5240" trim="#d8b84a" />
      {/* 肩甲 */}
      <path d="M10 84 Q14 70 26 66 L28 74 Q18 78 14 90 Z" fill="#b5893a" />
      <path d="M70 84 Q66 70 54 66 L52 74 Q62 78 66 90 Z" fill="#b5893a" />
    </>
  ),

  caocao: () => (
    <>
      <Face skin="#e8c49a" neck="#d6ab7d" />
      {/* 进贤冠 */}
      <path d="M26 30 Q27 20 40 19 Q53 20 54 30 Q47 25 40 25 Q33 25 26 30 Z" fill="#241a12" />
      <path d="M30 20 L34 8 L50 8 L52 20 Z" fill="#1e2a3f" />
      <rect x="28" y="18" width="24" height="4.5" rx="2" fill="#3f6ea5" />
      <circle cx="40" cy="20.2" r="1.5" fill="#d8b84a" />
      <Brows angle={2.4} />
      <Eyes lift={0.5} width={1.9} />
      <Nose />
      {/* 冷峻的嘴与细须 */}
      <path d="M36.5 50.5 Q40 51 43.5 49.6" stroke="#8a4a3a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M34.5 46.8 Q31.5 48.6 30 51.5" stroke="#241a12" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M45.5 46.8 Q48.5 48.6 50 51.5" stroke="#241a12" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M38.4 53.8 Q40 58.5 41.6 53.8 Q40.8 54.8 39.2 54.8 Z" fill="#241a12" />
      <Robe color="#2f4a6b" trim="#cfd8e3" />
      <path d="M33 86 L47 86 L46 90 L34 90 Z" fill="#d8b84a" opacity="0.85" />
    </>
  ),

  simayi: () => (
    <>
      <Face skin="#e9cfa8" neck="#d5b689" />
      {/* 高冠 */}
      <path d="M27 31 Q28 22 40 21 Q52 22 53 31 Q46 26 40 26 Q34 26 27 31 Z" fill="#241a12" />
      <path d="M32 22 L33 7 L47 7 L48 22 Z" fill="#3a2f52" />
      <rect x="31" y="19" width="18" height="4" rx="2" fill="#241a12" />
      <circle cx="40" cy="12" r="1.8" fill="#8fae8f" />
      {/* 细长眼与颧骨阴影 */}
      <Brows angle={1.6} y={33.5} />
      <path d="M29 38.6 L37 38" stroke="#241a12" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M43 38 L51 38.6" stroke="#241a12" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="33.4" cy="38.2" r="0.95" fill="#241a12" />
      <circle cx="46.6" cy="38.2" r="0.95" fill="#241a12" />
      <path d="M30 44 Q32 46 34 46.4" stroke="#c9a377" strokeWidth="1" fill="none" />
      <path d="M50 44 Q48 46 46 46.4" stroke="#c9a377" strokeWidth="1" fill="none" />
      <Nose />
      <path d="M37 50 Q40 50.8 43 50" stroke="#8a4a3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* 细长山羊须 */}
      <path d="M38.6 53.5 Q40 66 41.4 53.5 Q40.7 55 39.3 55 Z" fill="#241a12" />
      <Robe color="#4a3a6b" trim="#b5893a" />
    </>
  ),

  sunquan: () => (
    <>
      <Face skin="#e8c49a" neck="#d6ab7d" />
      {/* 束发金冠 */}
      <path d="M25 31 Q26 20 40 19 Q54 20 55 31 Q48 25 40 25 Q32 25 25 31 Z" fill="#2a1c10" />
      <rect x="30" y="16" width="20" height="5.5" rx="2.5" fill="#d8b84a" />
      <circle cx="40" cy="18.8" r="2" fill="#b03a3a" />
      <path d="M36 11 Q40 8 44 11 L43 16 L37 16 Z" fill="#d8b84a" />
      <Brows angle={1.8} />
      <Eyes width={1.8} />
      <Nose />
      <Mouth curve={2} />
      {/* 环颔短须(碧眼紫髯的紫髯) */}
      <path d="M29 43 Q30 53 36 56 Q38 57.5 40 57.5 Q42 57.5 44 56 Q50 53 51 43 Q48 50 43 51.5 Q41.5 50.6 40 50.6 Q38.5 50.6 37 51.5 Q32 50 29 43 Z" fill="#4a3050" />
      <path d="M34.6 47 Q32 48.4 30.8 50.6" stroke="#4a3050" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M45.4 47 Q48 48.4 49.2 50.6" stroke="#4a3050" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <Robe color="#a53a3a" trim="#d8b84a" />
      <circle cx="40" cy="82" r="2.6" fill="#d8b84a" />
    </>
  ),

  ganning: () => (
    <>
      <Face skin="#d19a6a" neck="#bd8657" />
      {/* 红头巾 + 羽饰 */}
      <path d="M24 32 Q24 19 40 18 Q56 19 56 32 Q49 24 40 24 Q31 24 24 32 Z" fill="#a53a3a" />
      <path d="M52 21 Q58 15 62 16 Q59 20 57 25 Z" fill="#e0e6ea" />
      <path d="M55 20 Q58 17 60.5 17.5" stroke="#9aa6ae" strokeWidth="0.8" fill="none" />
      <path d="M24 30 Q20 33 20 38 L25 35 Z" fill="#8a2f2f" />
      {/* 凶悍眉眼 + 疤 */}
      <Brows angle={3} />
      <Eyes lift={0.6} width={2} />
      <path d="M48 30 L52 44" stroke="#a3644a" strokeWidth="1.4" strokeLinecap="round" />
      <Nose />
      <path d="M36 50.5 Q40 49.3 44 50.5" stroke="#7a3a2a" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      {/* 络腮胡渣 */}
      <path d="M28 44 Q30 51 36 53.5 Q38 54.5 40 54.5 Q42 54.5 44 53.5 Q50 51 52 44 Q49 49.5 43 50.5 Q41.5 50 40 50 Q38.5 50 37 50.5 Q31 49.5 28 44 Z" fill="#3a2a1c" opacity="0.65" />
      {/* 皮甲 + 铃铛 */}
      <Robe color="#5a4632" trim="#8a6a45" />
      <path d="M14 96 L58 66 L62 72 L20 96 Z" fill="#3a2c20" />
      <circle cx="30" cy="84" r="2.6" fill="#d8b84a" />
      <circle cx="38" cy="79" r="2.6" fill="#d8b84a" />
      <circle cx="46" cy="74" r="2.6" fill="#d8b84a" />
    </>
  ),

  diaochan: () => (
    <>
      <Face skin="#f6dfc6" neck="#eccaa8" />
      {/* 云鬓双髻 */}
      <path d="M24 40 Q22 20 40 18 Q58 20 56 40 Q54 27 40 26 Q26 27 24 40 Z" fill="#241a1f" />
      <circle cx="28" cy="17" r="6" fill="#241a1f" />
      <circle cx="52" cy="17" r="6" fill="#241a1f" />
      <path d="M24 34 Q22 44 24 52 L27 40 Z" fill="#241a1f" />
      <path d="M56 34 Q58 44 56 52 L53 40 Z" fill="#241a1f" />
      <rect x="25" y="13.4" width="6" height="1.8" rx="0.9" fill="#d8b84a" transform="rotate(-18 28 14)" />
      <rect x="49" y="13.4" width="6" height="1.8" rx="0.9" fill="#d8b84a" transform="rotate(18 52 14)" />
      <circle cx="52" cy="22.5" r="1.4" fill="#e35b7a" />
      <path d="M52 24 L52 29" stroke="#d8b84a" strokeWidth="1" />
      <circle cx="52" cy="30" r="1" fill="#d8b84a" />
      {/* 柳眉杏眼 */}
      <path d="M28.5 33.5 Q33 31.6 37 33.2" stroke="#241a1f" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M43 33.2 Q47 31.6 51.5 33.5" stroke="#241a1f" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M29.5 38.6 Q33 36.2 36.5 38.4" stroke="#241a1f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M43.5 38.4 Q47 36.2 50.5 38.6" stroke="#241a1f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="33" cy="38.8" r="1.05" fill="#241a1f" />
      <circle cx="47" cy="38.8" r="1.05" fill="#241a1f" />
      {/* 腮红与樱唇 */}
      <ellipse cx="30.5" cy="44" rx="2.8" ry="1.6" fill="#f0a8a0" opacity="0.7" />
      <ellipse cx="49.5" cy="44" rx="2.8" ry="1.6" fill="#f0a8a0" opacity="0.7" />
      <path d="M39 44.6 Q40 45.6 41 44.6" stroke="#d8a888" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M37.6 49.6 Q40 51.6 42.4 49.6 Q40 49 37.6 49.6 Z" fill="#c94f5f" />
      <Robe color="#c96a7a" trim="#f0d8b0" />
      <path d="M34 66 Q40 70 46 66" stroke="#d8b84a" strokeWidth="1.6" fill="none" />
      <circle cx="40" cy="69.5" r="1.6" fill="#d8b84a" />
    </>
  ),

  huatuo: () => (
    <>
      <Face skin="#ecd0ab" neck="#d9b98d" />
      {/* 白发髻与布带 */}
      <path d="M26 31 Q27 21 40 20 Q53 21 54 31 Q47 25.5 40 25.5 Q33 25.5 26 31 Z" fill="#e8e4da" />
      <rect x="35" y="12" width="10" height="8" rx="4" fill="#e8e4da" />
      <rect x="27" y="26.5" width="26" height="4" rx="2" fill="#8a8878" />
      {/* 白眉 慈目 皱纹 */}
      <path d="M27.5 33 Q32 30.6 37 32.6" stroke="#e8e4da" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M43 32.6 Q48 30.6 52.5 33" stroke="#e8e4da" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M29.5 38.8 Q33 36.8 36.5 38.6" stroke="#241a12" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M43.5 38.6 Q47 36.8 50.5 38.8" stroke="#241a12" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M30 42.5 Q32.5 44 35 44.3" stroke="#c9a377" strokeWidth="0.9" fill="none" />
      <path d="M50 42.5 Q47.5 44 45 44.3" stroke="#c9a377" strokeWidth="0.9" fill="none" />
      <Nose />
      {/* 白长髯 */}
      <path d="M29 44 Q30 55 35 60 Q37.5 68 40 70 Q42.5 68 45 60 Q50 55 51 44 Q48 51 43.5 52 Q41.8 50.5 40 50.5 Q38.2 50.5 36.5 52 Q32 51 29 44 Z" fill="#e8e4da" />
      <path d="M35.5 47.5 Q32.5 49 31.2 51.5" stroke="#e8e4da" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M44.5 47.5 Q47.5 49 48.8 51.5" stroke="#e8e4da" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Robe color="#b0a486" trim="#6b8a6b" />
      <circle cx="52" cy="84" r="4" fill="#a56a3a" />
      <rect x="50.8" y="77.5" width="2.4" height="4" rx="1" fill="#6b4a2a" />
    </>
  ),
};

export function GeneralPortrait({ general }: { general: GeneralId }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const faction = GENERALS[general].faction;
  const [bgTop, bgBottom] = FACTION_BG[faction];
  const gradId = `pg-${general}`;
  return (
    <div className={`portrait portrait-${faction}`} title={GENERAL_NAMES[general]}>
      {!imgLoaded && (
        <svg viewBox="0 0 80 96" role="img" aria-label={GENERAL_NAMES[general]}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={bgTop} />
              <stop offset="100%" stopColor={bgBottom} />
            </linearGradient>
          </defs>
          <rect width="80" height="96" fill={`url(#${gradId})`} />
          <circle cx="40" cy="40" r="30" fill="#ffffff" opacity="0.06" />
          {PORTRAITS[general]()}
        </svg>
      )}
      <img
        src={`/generals/${general}.jpg`}
        alt={GENERAL_NAMES[general]}
        style={imgLoaded ? undefined : { display: 'none' }}
        onLoad={() => setImgLoaded(true)}
      />
    </div>
  );
}
