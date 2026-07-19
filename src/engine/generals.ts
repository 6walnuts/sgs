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
  // 初始 8 将
  liubei:   { id: 'liubei',   faction: 'shu', hp: 4, gender: 'm', skills: ['rende'], activeSkills: ['rende'] },
  guanyu:   { id: 'guanyu',   faction: 'shu', hp: 4, gender: 'm', skills: ['wusheng'], activeSkills: ['wusheng'] },
  caocao:   { id: 'caocao',   faction: 'wei', hp: 4, gender: 'm', skills: ['jianxiong'], activeSkills: [] },
  simayi:   { id: 'simayi',   faction: 'wei', hp: 3, gender: 'm', skills: ['fankui', 'guicai'], activeSkills: [] },
  sunquan:  { id: 'sunquan',  faction: 'wu',  hp: 4, gender: 'm', skills: ['zhiheng', 'jiuyuan'], activeSkills: ['zhiheng'] },
  ganning:  { id: 'ganning',  faction: 'wu',  hp: 4, gender: 'm', skills: ['qixi'], activeSkills: ['qixi'] },
  diaochan: { id: 'diaochan', faction: 'qun', hp: 3, gender: 'f', skills: ['lijian', 'biyue'], activeSkills: ['lijian'] },
  huatuo:   { id: 'huatuo',   faction: 'qun', hp: 3, gender: 'm', skills: ['jijiu', 'qingnang'], activeSkills: ['qingnang'] },
  // 标准包 · 魏
  xiahoudun: { id: 'xiahoudun', faction: 'wei', hp: 4, gender: 'm', skills: ['ganglie'], activeSkills: [] },
  zhangliao: { id: 'zhangliao', faction: 'wei', hp: 4, gender: 'm', skills: ['tuxi'], activeSkills: [] },
  xuchu:     { id: 'xuchu',     faction: 'wei', hp: 4, gender: 'm', skills: ['luoyi'], activeSkills: [] },
  guojia:    { id: 'guojia',    faction: 'wei', hp: 3, gender: 'm', skills: ['tiandu', 'yiji'], activeSkills: [] },
  zhenji:    { id: 'zhenji',    faction: 'wei', hp: 3, gender: 'f', skills: ['luoshen', 'qingguo'], activeSkills: [] },
  // 标准包 · 蜀
  zhangfei:     { id: 'zhangfei',     faction: 'shu', hp: 4, gender: 'm', skills: ['paoxiao'], activeSkills: [] },
  zhugeliang:   { id: 'zhugeliang',   faction: 'shu', hp: 3, gender: 'm', skills: ['guanxing', 'kongcheng'], activeSkills: [] },
  zhaoyun:      { id: 'zhaoyun',      faction: 'shu', hp: 4, gender: 'm', skills: ['longdan'], activeSkills: ['longdan'] },
  machao:       { id: 'machao',       faction: 'shu', hp: 4, gender: 'm', skills: ['mashu', 'tieji'], activeSkills: [] },
  huangyueying: { id: 'huangyueying', faction: 'shu', hp: 3, gender: 'f', skills: ['jizhi', 'qicai'], activeSkills: [] },
  // 标准包 · 吴
  lvmeng:        { id: 'lvmeng',        faction: 'wu', hp: 4, gender: 'm', skills: ['keji'], activeSkills: [] },
  huanggai:      { id: 'huanggai',      faction: 'wu', hp: 4, gender: 'm', skills: ['kurou'], activeSkills: ['kurou'] },
  zhouyu:        { id: 'zhouyu',        faction: 'wu', hp: 3, gender: 'm', skills: ['yingzi', 'fanjian'], activeSkills: ['fanjian'] },
  daqiao:        { id: 'daqiao',        faction: 'wu', hp: 3, gender: 'f', skills: ['guose', 'liuli'], activeSkills: ['guose'] },
  luxun:         { id: 'luxun',         faction: 'wu', hp: 3, gender: 'm', skills: ['qianxun', 'lianying'], activeSkills: [] },
  sunshangxiang: { id: 'sunshangxiang', faction: 'wu', hp: 3, gender: 'f', skills: ['jieyin', 'xiaoji'], activeSkills: ['jieyin'] },
  // 标准包 · 群
  lvbu: { id: 'lvbu', faction: 'qun', hp: 4, gender: 'm', skills: ['wushuang'], activeSkills: [] },
  // 风包
  xiahouyuan: { id: 'xiahouyuan', faction: 'wei', hp: 4, gender: 'm', skills: ['shensu'], activeSkills: [] },
  caoren:     { id: 'caoren',     faction: 'wei', hp: 4, gender: 'm', skills: ['jushou'], activeSkills: [] },
  huangzhong: { id: 'huangzhong', faction: 'shu', hp: 4, gender: 'm', skills: ['liegong'], activeSkills: [] },
  weiyan:     { id: 'weiyan',     faction: 'shu', hp: 4, gender: 'm', skills: ['kuanggu'], activeSkills: [] },
  xiaoqiao:   { id: 'xiaoqiao',   faction: 'wu',  hp: 3, gender: 'f', skills: ['tianxiang', 'hongyan'], activeSkills: [] },
  zhoutai:    { id: 'zhoutai',    faction: 'wu',  hp: 4, gender: 'm', skills: ['buqu'], activeSkills: [] },
  zhangjiao:  { id: 'zhangjiao',  faction: 'qun', hp: 3, gender: 'm', skills: ['leiji', 'guidao'], activeSkills: [] },
  yuji:       { id: 'yuji',       faction: 'qun', hp: 3, gender: 'm', skills: ['guhuo'], activeSkills: ['guhuo'] },
  // 火包
  dianwei:         { id: 'dianwei',         faction: 'wei', hp: 4, gender: 'm', skills: ['qiangxi'], activeSkills: ['qiangxi'] },
  xunyu:           { id: 'xunyu',           faction: 'wei', hp: 3, gender: 'm', skills: ['quhu', 'jieming'], activeSkills: ['quhu'] },
  pangtong:        { id: 'pangtong',        faction: 'shu', hp: 3, gender: 'm', skills: ['lianhuan', 'niepan'], activeSkills: ['lianhuan'] },
  wolong:          { id: 'wolong',          faction: 'shu', hp: 3, gender: 'm', skills: ['bazhen', 'huoji', 'kanpo'], activeSkills: ['huoji'] },
  taishici:        { id: 'taishici',        faction: 'wu',  hp: 4, gender: 'm', skills: ['tianyi'], activeSkills: ['tianyi'] },
  pangde:          { id: 'pangde',          faction: 'qun', hp: 4, gender: 'm', skills: ['mashu', 'mengjin'], activeSkills: [] },
  yanliangwenchou: { id: 'yanliangwenchou', faction: 'qun', hp: 4, gender: 'm', skills: ['shuangxiong'], activeSkills: ['shuangxiong'] },
  yuanshao:        { id: 'yuanshao',        faction: 'qun', hp: 4, gender: 'm', skills: ['luanji', 'xueyi'], activeSkills: ['luanji'] },
};

export const ALL_GENERAL_IDS = Object.keys(GENERALS) as GeneralId[];
