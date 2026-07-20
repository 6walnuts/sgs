import type { GeneralId, SkillName } from './types';

export interface GeneralDef {
  id: GeneralId;
  faction: 'wei' | 'shu' | 'wu' | 'qun' | 'god';
  hp: number;
  gender: 'm' | 'f';
  skills: SkillName[];      // 武将技能(jiuyuan 为主公技,仅当其为主公时生效)
  activeSkills: SkillName[]; // 出牌阶段可主动发动的技能(UI/AI 用)
}

export const GENERALS: Record<GeneralId, GeneralDef> = {
  // 初始 8 将
  liubei:   { id: 'liubei',   faction: 'shu', hp: 4, gender: 'm', skills: ['rende', 'jijiang'], activeSkills: ['rende', 'jijiang'] },
  guanyu:   { id: 'guanyu',   faction: 'shu', hp: 4, gender: 'm', skills: ['wusheng'], activeSkills: ['wusheng'] },
  caocao:   { id: 'caocao',   faction: 'wei', hp: 4, gender: 'm', skills: ['jianxiong', 'hujia'], activeSkills: [] },
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
  // 林包
  caopi:    { id: 'caopi',    faction: 'wei', hp: 3, gender: 'm', skills: ['xingshang', 'fangzhu', 'songwei'], activeSkills: [] },
  xuhuang:  { id: 'xuhuang',  faction: 'wei', hp: 4, gender: 'm', skills: ['duanliang'], activeSkills: ['duanliang'] },
  menghuo:  { id: 'menghuo',  faction: 'shu', hp: 4, gender: 'm', skills: ['huoshou', 'zaiqi'], activeSkills: [] },
  zhurong:  { id: 'zhurong',  faction: 'shu', hp: 4, gender: 'f', skills: ['juxiang', 'lieren'], activeSkills: [] },
  lusu:     { id: 'lusu',     faction: 'wu',  hp: 3, gender: 'm', skills: ['haoshi', 'dimeng'], activeSkills: ['dimeng'] },
  sunjian:  { id: 'sunjian',  faction: 'wu',  hp: 4, gender: 'm', skills: ['yinghun'], activeSkills: [] },
  dongzhuo: { id: 'dongzhuo', faction: 'qun', hp: 8, gender: 'm', skills: ['jiuchi', 'roulin', 'benghuai', 'baonve'], activeSkills: ['jiuchi'] },
  jiaxu:    { id: 'jiaxu',    faction: 'qun', hp: 3, gender: 'm', skills: ['wansha', 'luanwu', 'weimu'], activeSkills: ['luanwu'] },
  // 一将成名 2011
  caozhi:       { id: 'caozhi',       faction: 'wei', hp: 3, gender: 'm', skills: ['luoying', 'jiushi'], activeSkills: ['jiushi'] },
  zhangchunhua: { id: 'zhangchunhua', faction: 'wei', hp: 3, gender: 'f', skills: ['jueqing', 'shangshi'], activeSkills: [] },
  yujin:        { id: 'yujin',        faction: 'wei', hp: 4, gender: 'm', skills: ['yizhong'], activeSkills: [] },
  fazheng:      { id: 'fazheng',      faction: 'shu', hp: 3, gender: 'm', skills: ['enyuan', 'xuanhuo'], activeSkills: ['xuanhuo'] },
  masu:         { id: 'masu',         faction: 'shu', hp: 3, gender: 'm', skills: ['xinzhan', 'huilei'], activeSkills: ['xinzhan'] },
  xushu:        { id: 'xushu',        faction: 'shu', hp: 3, gender: 'm', skills: ['wuyan', 'jujian'], activeSkills: ['jujian'] },
  lingtong:     { id: 'lingtong',     faction: 'wu',  hp: 4, gender: 'm', skills: ['xuanfeng'], activeSkills: [] },
  xusheng:      { id: 'xusheng',      faction: 'wu',  hp: 4, gender: 'm', skills: ['pojun'], activeSkills: [] },
  wuguotai:     { id: 'wuguotai',     faction: 'wu',  hp: 3, gender: 'f', skills: ['ganlu', 'buyi'], activeSkills: ['ganlu'] },
  chengong:     { id: 'chengong',     faction: 'qun', hp: 3, gender: 'm', skills: ['mingce', 'zhichi'], activeSkills: ['mingce'] },
  gaoshun:      { id: 'gaoshun',      faction: 'qun', hp: 4, gender: 'm', skills: ['xianzhen', 'jinjiu'], activeSkills: ['xianzhen'] },
  // 山包
  dengai:            { id: 'dengai',            faction: 'wei', hp: 4, gender: 'm', skills: ['tuntian', 'zaoxian'], activeSkills: ['jixi'] },
  zhanghe:           { id: 'zhanghe',           faction: 'wei', hp: 4, gender: 'm', skills: ['qiaobian'], activeSkills: [] },
  jiangwei:          { id: 'jiangwei',          faction: 'shu', hp: 4, gender: 'm', skills: ['tiaoxin', 'zhiji'], activeSkills: ['tiaoxin'] },
  liushan:           { id: 'liushan',           faction: 'shu', hp: 3, gender: 'm', skills: ['xiangle', 'fangquan'], activeSkills: [] },
  sunce:             { id: 'sunce',             faction: 'wu',  hp: 4, gender: 'm', skills: ['jiang', 'hunzi'], activeSkills: [] },
  zhangzhaozhanghong:{ id: 'zhangzhaozhanghong',faction: 'wu',  hp: 3, gender: 'm', skills: ['zhijian', 'guzheng'], activeSkills: ['zhijian'] },
  zuoci:             { id: 'zuoci',             faction: 'qun', hp: 3, gender: 'm', skills: ['huashen', 'xinsheng'], activeSkills: [] },
  caiwenji:          { id: 'caiwenji',          faction: 'qun', hp: 3, gender: 'f', skills: ['beige', 'duanchang'], activeSkills: [] },
  // 界限突破 · 标准包(独立武将,与原版共存)
  jiecaocao:     { id: 'jiecaocao',     faction: 'wei', hp: 4, gender: 'm', skills: ['jjianxiong', 'hujia'], activeSkills: [] },
  jiesimayi:     { id: 'jiesimayi',     faction: 'wei', hp: 3, gender: 'm', skills: ['jfankui', 'guicai'], activeSkills: [] },
  jiexiahoudun:  { id: 'jiexiahoudun',  faction: 'wei', hp: 4, gender: 'm', skills: ['jganglie'], activeSkills: [] },
  jiezhangliao:  { id: 'jiezhangliao',  faction: 'wei', hp: 4, gender: 'm', skills: ['jtuxi'], activeSkills: [] },
  jiexuchu:      { id: 'jiexuchu',      faction: 'wei', hp: 4, gender: 'm', skills: ['jluoyi'], activeSkills: [] },
  jieguojia:     { id: 'jieguojia',     faction: 'wei', hp: 3, gender: 'm', skills: ['tiandu', 'yiji'], activeSkills: [] },
  jiezhenji:     { id: 'jiezhenji',     faction: 'wei', hp: 3, gender: 'f', skills: ['jluoshen', 'qingguo'], activeSkills: [] },
  jieliubei:     { id: 'jieliubei',     faction: 'shu', hp: 4, gender: 'm', skills: ['jrende', 'jijiang'], activeSkills: ['jrende', 'jijiang'] },
  jieguanyu:     { id: 'jieguanyu',     faction: 'shu', hp: 4, gender: 'm', skills: ['jwusheng', 'yijue'], activeSkills: ['jwusheng', 'yijue'] },
  jiezhangfei:   { id: 'jiezhangfei',   faction: 'shu', hp: 4, gender: 'm', skills: ['jpaoxiao'], activeSkills: [] },
  jiezhugeliang: { id: 'jiezhugeliang', faction: 'shu', hp: 3, gender: 'm', skills: ['jguanxing', 'kongcheng'], activeSkills: [] },
  jiezhaoyun:    { id: 'jiezhaoyun',    faction: 'shu', hp: 4, gender: 'm', skills: ['longdan', 'yajiao'], activeSkills: ['longdan'] },
  jiemachao:     { id: 'jiemachao',     faction: 'shu', hp: 4, gender: 'm', skills: ['mashu', 'jtieji'], activeSkills: [] },
  jiehuangyueying: { id: 'jiehuangyueying', faction: 'shu', hp: 3, gender: 'f', skills: ['jjizhi', 'qicai'], activeSkills: [] },
  jiesunquan:    { id: 'jiesunquan',    faction: 'wu', hp: 4, gender: 'm', skills: ['jzhiheng', 'jiuyuan'], activeSkills: ['jzhiheng'] },
  jieganning:    { id: 'jieganning',    faction: 'wu', hp: 4, gender: 'm', skills: ['qixi', 'fenwei'], activeSkills: ['qixi'] },
  jielvmeng:     { id: 'jielvmeng',     faction: 'wu', hp: 4, gender: 'm', skills: ['keji', 'qinxue'], activeSkills: ['gongxin'] },
  jiehuanggai:   { id: 'jiehuanggai',   faction: 'wu', hp: 4, gender: 'm', skills: ['jkurou', 'zhaxiang'], activeSkills: ['jkurou'] },
  jiezhouyu:     { id: 'jiezhouyu',     faction: 'wu', hp: 3, gender: 'm', skills: ['jyingzi', 'jfanjian'], activeSkills: ['jfanjian'] },
  jiedaqiao:     { id: 'jiedaqiao',     faction: 'wu', hp: 3, gender: 'f', skills: ['jguose', 'liuli'], activeSkills: ['jguose'] },
  jieluxun:      { id: 'jieluxun',      faction: 'wu', hp: 3, gender: 'm', skills: ['qianxun', 'jlianying'], activeSkills: [] },
  jiesunshangxiang: { id: 'jiesunshangxiang', faction: 'wu', hp: 3, gender: 'f', skills: ['jieyin', 'xiaoji'], activeSkills: ['jieyin'] },
  jiehuatuo:     { id: 'jiehuatuo',     faction: 'qun', hp: 3, gender: 'm', skills: ['jijiu', 'jqingnang'], activeSkills: ['jqingnang'] },
  jielvbu:       { id: 'jielvbu',       faction: 'qun', hp: 5, gender: 'm', skills: ['wushuang', 'liyu'], activeSkills: [] },
  jiediaochan:   { id: 'jiediaochan',   faction: 'qun', hp: 3, gender: 'f', skills: ['lijian', 'jbiyue'], activeSkills: ['lijian'] },
  // 界限突破 · 风包
  jiexiahouyuan: { id: 'jiexiahouyuan', faction: 'wei', hp: 4, gender: 'm', skills: ['shensu', 'shensu3'], activeSkills: [] },
  jiecaoren:     { id: 'jiecaoren',     faction: 'wei', hp: 4, gender: 'm', skills: ['jjushou', 'jiewei'], activeSkills: [] },
  jiehuangzhong: { id: 'jiehuangzhong', faction: 'shu', hp: 4, gender: 'm', skills: ['jliegong'], activeSkills: [] },
  jieweiyan:     { id: 'jieweiyan',     faction: 'shu', hp: 4, gender: 'm', skills: ['jkuanggu', 'qimou'], activeSkills: ['qimou'] },
  jiexiaoqiao:   { id: 'jiexiaoqiao',   faction: 'wu', hp: 3, gender: 'f', skills: ['jtianxiang', 'hongyan'], activeSkills: [] },
  jiezhoutai:    { id: 'jiezhoutai',    faction: 'wu', hp: 4, gender: 'm', skills: ['buqu', 'fenji'], activeSkills: [] },
  jiezhangjiao:  { id: 'jiezhangjiao',  faction: 'qun', hp: 3, gender: 'm', skills: ['jleiji', 'guidao'], activeSkills: [] },
  jieyuji:       { id: 'jieyuji',       faction: 'qun', hp: 3, gender: 'm', skills: ['jguhuo'], activeSkills: ['guhuo'] },
  // 神武将(登场时自选势力;不加入主公候选)
  shenguanyu: { id: 'shenguanyu', faction: 'god', hp: 5, gender: 'm', skills: ['wushen', 'wuhun'], activeSkills: [] },
  shenlvmeng: { id: 'shenlvmeng', faction: 'god', hp: 3, gender: 'm', skills: ['shelie', 'gongxin'], activeSkills: ['gongxin'] },
  shencaocao: { id: 'shencaocao', faction: 'god', hp: 3, gender: 'm', skills: ['guixin', 'feiying'], activeSkills: [] },
};

export const ALL_GENERAL_IDS = Object.keys(GENERALS) as GeneralId[];
