import type { GeneralId, SkillName } from './types';

export interface GeneralDef {
  id: GeneralId;
  faction: 'wei' | 'shu' | 'wu' | 'qun';
  hp: number;
  gender: 'm' | 'f';
  skills: SkillName[];      // 武将技能(jiuyuan 为主公技,仅当其为主公时生效)
  activeSkills: SkillName[]; // 出牌阶段可主动发动的技能(UI/AI 用)
}

export const GENERALS: Record<GeneralId, GeneralDef> = {
  liubei:   { id: 'liubei',   faction: 'shu', hp: 4, gender: 'm', skills: ['rende'], activeSkills: ['rende'] },
  guanyu:   { id: 'guanyu',   faction: 'shu', hp: 4, gender: 'm', skills: ['wusheng'], activeSkills: ['wusheng'] },
  caocao:   { id: 'caocao',   faction: 'wei', hp: 4, gender: 'm', skills: ['jianxiong'], activeSkills: [] },
  simayi:   { id: 'simayi',   faction: 'wei', hp: 3, gender: 'm', skills: ['fankui', 'guicai'], activeSkills: [] },
  sunquan:  { id: 'sunquan',  faction: 'wu',  hp: 4, gender: 'm', skills: ['zhiheng', 'jiuyuan'], activeSkills: ['zhiheng'] },
  ganning:  { id: 'ganning',  faction: 'wu',  hp: 4, gender: 'm', skills: ['qixi'], activeSkills: ['qixi'] },
  diaochan: { id: 'diaochan', faction: 'qun', hp: 3, gender: 'f', skills: ['lijian', 'biyue'], activeSkills: ['lijian'] },
  huatuo:   { id: 'huatuo',   faction: 'qun', hp: 3, gender: 'm', skills: ['jijiu', 'qingnang'], activeSkills: ['qingnang'] },
};

export const ALL_GENERAL_IDS = Object.keys(GENERALS) as GeneralId[];
