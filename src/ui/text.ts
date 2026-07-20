import type {
  CardName, GameEvent, GameState, PendingRequest, PlayerId, Role, SkillName,
} from '../engine/types';

export const CARD_NAMES: Record<CardName, string> = {
  sha: '杀', huosha: '火杀', leisha: '雷杀', shan: '闪', tao: '桃', jiu: '酒',
  guohe: '过河拆桥', shunshou: '顺手牵羊', wuzhong: '无中生有',
  juedou: '决斗', wuxie: '无懈可击', lebusishu: '乐不思蜀',
  nanman: '南蛮入侵', wanjian: '万箭齐发', wugu: '五谷丰登',
  taoyuan: '桃园结义', jiedao: '借刀杀人', shandian: '闪电',
  huogong: '火攻', tiesuo: '铁索连环', bingliang: '兵粮寸断',
  cixiong: '雌雄双股剑', hanbing: '寒冰剑', zhangba: '丈八蛇矛',
  guanshi: '贯石斧', fangtian: '方天画戟', qilin: '麒麟弓', renwang: '仁王盾',
  zhugeliannu: '诸葛连弩', qinglongdao: '青龙偃月刀', baguazhen: '八卦阵',
  zhuque: '朱雀羽扇', gudingdao: '古锭刀', tengjia: '藤甲', baiyin: '白银狮子',
  jiama: '+1马', jianma: '-1马',
};

export const GENERAL_NAMES: Record<string, string> = {
  liubei: '刘备', guanyu: '关羽', caocao: '曹操', simayi: '司马懿',
  sunquan: '孙权', ganning: '甘宁', diaochan: '貂蝉', huatuo: '华佗',
  xiahoudun: '夏侯惇', zhangliao: '张辽', xuchu: '许褚', guojia: '郭嘉', zhenji: '甄姬',
  zhangfei: '张飞', zhugeliang: '诸葛亮', zhaoyun: '赵云', machao: '马超', huangyueying: '黄月英',
  lvmeng: '吕蒙', huanggai: '黄盖', zhouyu: '周瑜', daqiao: '大乔', luxun: '陆逊',
  sunshangxiang: '孙尚香', lvbu: '吕布',
  xiahouyuan: '夏侯渊', caoren: '曹仁', huangzhong: '黄忠', weiyan: '魏延',
  xiaoqiao: '小乔', zhoutai: '周泰', zhangjiao: '张角', yuji: '于吉',
  dianwei: '典韦', xunyu: '荀彧', pangtong: '庞统', wolong: '诸葛亮·卧龙',
  taishici: '太史慈', pangde: '庞德', yanliangwenchou: '颜良文丑', yuanshao: '袁绍',
  caopi: '曹丕', xuhuang: '徐晃', menghuo: '孟获', zhurong: '祝融',
  lusu: '鲁肃', sunjian: '孙坚', dongzhuo: '董卓', jiaxu: '贾诩',
  caozhi: '曹植', zhangchunhua: '张春华', yujin: '于禁',
  fazheng: '法正', masu: '马谡', xushu: '徐庶',
  lingtong: '凌统', xusheng: '徐盛', wuguotai: '吴国太',
  chengong: '陈宫', gaoshun: '高顺',
  dengai: '邓艾', zhanghe: '张郃', jiangwei: '姜维', liushan: '刘禅',
  sunce: '孙策', zhangzhaozhanghong: '张昭张纮', zuoci: '左慈', caiwenji: '蔡文姬',
  jiecaocao: '界曹操', jiesimayi: '界司马懿', jiexiahoudun: '界夏侯惇',
  jiezhangliao: '界张辽', jiexuchu: '界许褚', jieguojia: '界郭嘉', jiezhenji: '界甄姬',
  jieliubei: '界刘备', jieguanyu: '界关羽', jiezhangfei: '界张飞',
  jiezhugeliang: '界诸葛亮', jiezhaoyun: '界赵云', jiemachao: '界马超',
  jiehuangyueying: '界黄月英',
  jiesunquan: '界孙权', jieganning: '界甘宁', jielvmeng: '界吕蒙',
  jiehuanggai: '界黄盖', jiezhouyu: '界周瑜', jiedaqiao: '界大乔',
  jieluxun: '界陆逊', jiesunshangxiang: '界孙尚香',
  jiehuatuo: '界华佗', jielvbu: '界吕布', jiediaochan: '界貂蝉',
  jiexiahouyuan: '界夏侯渊', jiecaoren: '界曹仁', jiehuangzhong: '界黄忠',
  jieweiyan: '界魏延', jiexiaoqiao: '界小乔', jiezhoutai: '界周泰',
  jiezhangjiao: '界张角', jieyuji: '界于吉',
  shenguanyu: '神关羽', shenlvmeng: '神吕蒙', shencaocao: '神曹操',
};

export const SKILL_NAMES: Record<SkillName, string> = {
  rende: '仁德', wusheng: '武圣', jianxiong: '奸雄', fankui: '反馈',
  guicai: '鬼才', zhiheng: '制衡', jiuyuan: '救援', qixi: '奇袭',
  lijian: '离间', biyue: '闭月', jijiu: '急救', qingnang: '青囊',
  bagua: '八卦阵', qinglong: '青龙偃月刀',
  ganglie: '刚烈', tuxi: '突袭', luoyi: '裸衣', tiandu: '天妒', yiji: '遗计',
  luoshen: '洛神', qingguo: '倾国', paoxiao: '咆哮', guanxing: '观星',
  kongcheng: '空城', longdan: '龙胆', mashu: '马术', tieji: '铁骑',
  jizhi: '集智', qicai: '奇才', keji: '克己', kurou: '苦肉', yingzi: '英姿',
  fanjian: '反间', guose: '国色', liuli: '流离', qianxun: '谦逊',
  lianying: '连营', jieyin: '结姻', xiaoji: '枭姬', wushuang: '无双',
  cixiong: '雌雄双股剑', hanbing: '寒冰剑', zhangba: '丈八蛇矛',
  guanshi: '贯石斧', fangtian: '方天画戟', qilin: '麒麟弓', renwang: '仁王盾',
  tengjia: '藤甲', baiyin: '白银狮子', zhuque: '朱雀羽扇', gudingdao: '古锭刀',
  shensu: '神速', jushou: '据守', liegong: '烈弓', kuanggu: '狂骨',
  tianxiang: '天香', hongyan: '红颜', buqu: '不屈', leiji: '雷击',
  guidao: '鬼道', guhuo: '蛊惑',
  qiangxi: '强袭', quhu: '驱虎', jieming: '节命', lianhuan: '连环',
  niepan: '涅槃', bazhen: '八阵', kanpo: '看破', huoji: '火计',
  tianyi: '天义', mengjin: '猛进', shuangxiong: '双雄', luanji: '乱击',
  xueyi: '血裔',
  xingshang: '行殇', fangzhu: '放逐', songwei: '颂威', duanliang: '断粮',
  huoshou: '祸首', zaiqi: '再起', juxiang: '巨象', lieren: '烈刃',
  haoshi: '好施', dimeng: '缔盟', jiuchi: '酒池', roulin: '肉林',
  benghuai: '崩坏', baonve: '暴虐', wansha: '完杀', luanwu: '乱武',
  weimu: '帷幕', yinghun: '英魂',
  luoying: '落英', jiushi: '酒诗', jueqing: '绝情', shangshi: '伤逝',
  yizhong: '毅重', enyuan: '恩怨', xuanhuo: '眩惑', xinzhan: '心战',
  huilei: '挥泪', wuyan: '无言', jujian: '举荐', xuanfeng: '旋风',
  pojun: '破军', ganlu: '甘露', buyi: '补益', mingce: '明策',
  zhichi: '智迟', xianzhen: '陷阵', jinjiu: '禁酒',
  wushen: '武神', wuhun: '武魂', shelie: '涉猎', gongxin: '攻心',
  guixin: '归心', feiying: '飞影',
  tuntian: '屯田', zaoxian: '凿险', jixi: '急袭', qiaobian: '巧变',
  tiaoxin: '挑衅', zhiji: '志继', xiangle: '享乐', fangquan: '放权',
  jiang: '激昂', hunzi: '魂姿', zhijian: '直谏', guzheng: '固政',
  huashen: '化身', xinsheng: '新生', beige: '悲歌', duanchang: '断肠',
  jjianxiong: '奸雄', jfankui: '反馈', jganglie: '刚烈', jtuxi: '突袭',
  jluoyi: '裸衣', jluoshen: '洛神', jrende: '仁德', jwusheng: '武圣',
  yijue: '义绝', jpaoxiao: '咆哮', jguanxing: '观星', yajiao: '涯角',
  jtieji: '铁骑', jjizhi: '集智', jzhiheng: '制衡', fenwei: '奋威',
  qinxue: '勤学', jkurou: '苦肉', zhaxiang: '诈降', jyingzi: '英姿',
  jfanjian: '反间', jguose: '国色', jlianying: '连营',
  jqingnang: '青囊', liyu: '利驭', jbiyue: '闭月',
  shensu3: '神速', jjushou: '据守', jiewei: '解围', jliegong: '烈弓',
  jkuanggu: '狂骨', qimou: '奇谋', jtianxiang: '天香', fenji: '奋激',
  jleiji: '雷击', jguhuo: '蛊惑', chanyuan: '缠怨',
  jxiaoji: '枭姬',
};

export const SKILL_HINTS: Record<string, string> = {
  rende: '选任意张手牌交给一名其他角色;给满两张回复1点体力',
  wusheng: '选一张红色牌当杀使用',
  zhiheng: '弃任意张牌,摸等量的牌(每回合一次)',
  qixi: '选一张黑色牌当过河拆桥使用',
  lijian: '弃一张牌,令两名男性角色决斗(先选的一方为发起者)',
  qingnang: '弃一张手牌,令一名已受伤角色回复1点体力(每回合一次)',
  longdan: '选一张闪当杀使用(响应时也可杀闪互换)',
  kurou: '失去1点体力,然后摸两张牌',
  jieyin: '弃两张手牌,令一名已受伤的男性角色与你各回复1点体力(每回合一次)',
  fanjian: '令一名角色猜花色并随机获得你一张手牌,猜错则受到1点伤害(每回合一次)',
  guose: '将一张方块牌当乐不思蜀使用',
  zhangba: '将两张手牌当杀使用(无花色)',
  guhuo: '声明一张基本牌或非延时锦囊后扣置一张手牌;若被质疑且为假,牌作废',
  qiangxi: '失去1点体力或弃置一张武器牌,对攻击范围内一名角色造成1点伤害(每阶段一次)',
  quhu: '与体力比你高的角色拼点:赢则其对其攻击范围内你指定的角色造成1点伤害,没赢则其对你造成1点伤害(每回合一次)',
  lianhuan: '将一张梅花手牌当铁索连环使用或重铸',
  huoji: '将一张红色手牌当火攻使用',
  tianyi: '与一名角色拼点:赢则本回合杀无距离限制且可多用一张,没赢则本回合不能使用杀(每回合一次)',
  shuangxiong: '发动过双雄后,本回合可将与判定牌颜色不同的手牌当决斗使用',
  luanji: '将两张相同花色的手牌当万箭齐发使用',
  duanliang: '将一张黑色基本牌或装备牌当兵粮寸断使用(可指定距离2的角色)',
  dimeng: '选两名其他角色,弃置两者手牌数之差的牌,令他们交换手牌(每回合一次)',
  jiuchi: '将一张黑桃手牌当酒使用',
  luanwu: '限定技:所有其他角色依次选择,对各自距离最近的角色使用杀,或失去1点体力',
  jiushi: '翻面并视为使用一张酒(背面时受到伤害后自动翻回)',
  xuanhuo: '交给一名其他角色一张红桃手牌,然后获得其一张牌并转交第三名角色(每回合一次)',
  xinzhan: '手牌数大于体力上限时,观看牌堆顶三张并获得其中的红桃(每回合一次)',
  jujian: '弃一至三张牌令一名其他角色摸等量;弃满三张同类别回复1点体力(每回合一次)',
  ganlu: '令两名角色交换装备区的牌,装备数差不能超过你已损失的体力(每回合一次)',
  mingce: '交给一名其他角色一张装备牌或杀,其选择视为对你指定的角色出杀、或摸一张牌(每回合一次)',
  xianzhen: '与一名角色拼点:赢则本回合对其出杀无距离次数限制且无视防具,输则本回合不能出杀(每回合一次)',
  gongxin: '查看一名角色的手牌,可展示其中一张红桃并弃置或置于牌堆顶(每回合一次)',
  tiaoxin: '令攻击范围内含你的一名角色对你使用杀,否则你弃置其一张牌(每回合一次)',
  jixi: '将一张"田"当顺手牵羊使用(凿险觉醒后)',
  zhijian: '将手牌中的一张装备牌置入一名其他角色的装备区,然后摸一张牌',
  jrende: '将任意张手牌交给一名本阶段未获得过仁德牌的其他角色;给出第二张时可视为使用一张基本牌',
  jwusheng: '将一张红色牌当杀使用或打出;方块杀无距离限制',
  yijue: '弃一张牌令一名角色展示一张手牌:黑色则其本回合技能失效;红色则你获得之并可令其回复1点体力(每回合一次)',
  jzhiheng: '弃任意张牌摸等量的牌;若弃置了所有手牌,额外多摸一张(每回合一次)',
  jkurou: '弃一张牌,然后失去1点体力(诈降:失去体力后摸三张,出牌阶段红杀强化)(每阶段一次)',
  jfanjian: '展示一张手牌并交给一名其他角色,其选择:展示所有手牌并弃置同花色牌,或失去1点体力(每回合一次)',
  jguose: '将一张方块牌当乐不思蜀使用,然后摸一张牌(每阶段一次)',
  jqingnang: '弃一张手牌令一名已受伤角色回复1点体力(每名角色限一次;弃黑色牌则本阶段失效)',
  qimou: '限定技:失去X点体力,本回合计算距离-X且可额外使用X张杀',
};

// 全技能说明:座位技能标签与选将界面的悬浮提示(描述与本实现一致,含简化)
export const SKILL_DESCS: Record<string, string> = {
  // 标准
  rende: '出牌阶段,将任意张手牌交给一名其他角色;本回合给满两张时回复1点体力',
  wusheng: '你可以将一张红色牌当【杀】使用或打出',
  jianxiong: '受到伤害后,你可以获得对你造成伤害的牌',
  fankui: '受到伤害后,你可以获得伤害来源的一张牌',
  guicai: '一名角色的判定牌生效前,你可以打出一张手牌代替之',
  zhiheng: '出牌阶段限一次,弃置任意张牌,然后摸等量的牌',
  jiuyuan: '主公技,其他吴势力角色用桃救你时,你额外回复1点体力',
  qixi: '你可以将一张黑色牌当【过河拆桥】使用',
  lijian: '出牌阶段限一次,弃一张牌令两名男性角色决斗',
  biyue: '结束阶段,你可以摸一张牌',
  jijiu: '你的回合外,可以将一张红色手牌当【桃】使用',
  qingnang: '出牌阶段限一次,弃一张手牌令一名已受伤角色回复1点体力',
  ganglie: '受到伤害后可判定,非红桃则伤害来源选择:弃两张手牌或受到1点伤害',
  tuxi: '摸牌阶段,你可以放弃摸牌,改为获得至多两名角色各一张手牌',
  luoyi: '摸牌阶段少摸一张,本回合你的杀与决斗造成的伤害+1',
  tiandu: '你的判定牌生效后,你获得之',
  yiji: '每受到1点伤害,可摸两张牌,并可将其中的牌交给其他角色',
  luoshen: '准备阶段可判定,黑色则获得判定牌并可继续判定',
  qingguo: '你可以将一张黑色手牌当【闪】使用或打出',
  paoxiao: '锁定技,你使用【杀】无次数限制',
  guanxing: '准备阶段观看牌堆顶的牌(至多5张),任意调整放回顶部或底部',
  kongcheng: '锁定技,你没有手牌时,不能成为杀或决斗的目标',
  longdan: '你可以将杀当闪、闪当杀使用或打出',
  mashu: '锁定技,你计算与其他角色的距离-1',
  tieji: '杀指定目标后可判定,红色则目标不能使用闪',
  jizhi: '你使用非延时锦囊牌时,可以摸一张牌',
  qicai: '锁定技,你使用锦囊牌无距离限制',
  keji: '本回合未使用或打出过杀,则可跳过弃牌阶段',
  kurou: '出牌阶段,失去1点体力,然后摸两张牌',
  yingzi: '锁定技,摸牌阶段多摸一张牌',
  fanjian: '出牌阶段限一次,令一名角色猜花色并随机获得你一张手牌,猜错则受1点伤害',
  guose: '将一张方块牌当【乐不思蜀】使用',
  liuli: '成为杀的目标时,可弃一张牌把杀转移给你攻击范围内的另一名角色',
  qianxun: '锁定技,你不能成为顺手牵羊与乐不思蜀的目标',
  lianying: '失去最后的手牌后,摸一张牌',
  jieyin: '出牌阶段限一次,弃两张手牌令一名已受伤的男性角色与你各回复1点体力',
  xiaoji: '失去装备区的牌后,摸两张牌',
  wushuang: '锁定技,目标需两张闪响应你的杀;与你决斗的角色每次需打出两张杀',
  // 风
  shensu: '可跳过判定+摸牌阶段,或跳过出牌阶段并弃一张装备牌,视为使用一张杀',
  jushou: '结束阶段可摸三张牌,然后翻面',
  liegong: '目标手牌数不小于你的体力或不大于你的攻击范围时,可令其不能闪',
  kuanggu: '对距离1以内的角色造成伤害后,可回复1点体力',
  tianxiang: '受到伤害时,可弃一张红桃手牌将伤害转移给其他角色,其按已损失体力摸牌',
  hongyan: '锁定技,你的黑桃牌视为红桃牌',
  buqu: '濒死时将牌堆顶牌置为"创",点数与已有创均不同则体力回到1',
  leiji: '使用或打出闪后,可令一名角色判定,黑桃则其受到2点雷电伤害',
  guidao: '一名角色的判定牌生效前,可打出一张黑色牌替换之',
  guhuo: '扣置一张手牌并声明为任意基本牌或非延时锦囊;被质疑且为假则作废',
  // 火
  qiangxi: '每阶段限一次,失去1点体力或弃一张武器牌,对攻击范围内一名角色造成1点伤害',
  quhu: '每回合限一次,与体力比你高的角色拼点:赢则其对你指定的角色造成1点伤害,输则其对你造成1点伤害',
  jieming: '每受到1点伤害,可令一名角色将手牌补至其体力上限',
  lianhuan: '将一张梅花手牌当铁索连环使用或重铸',
  niepan: '限定技,濒死时弃置所有牌,复原武将牌,摸三张并回复至3点体力',
  bazhen: '防具区为空时,视为装备着八卦阵',
  kanpo: '你可以将一张黑色手牌当【无懈可击】使用',
  huoji: '将一张红色手牌当【火攻】使用',
  tianyi: '每回合限一次拼点:赢则本回合杀无距离限制且可多用一张,输则本回合不能用杀',
  mengjin: '你的杀被闪抵消后,可弃置目标一张牌',
  shuangxiong: '摸牌阶段可改为判定并获得判定牌,本回合可将与其异色的手牌当决斗',
  luanji: '将两张相同花色的手牌当【万箭齐发】使用',
  xueyi: '主公技,场上每有一名其他群势力角色,你的手牌上限+2',
  // 林
  xingshang: '一名角色死亡时,你获得其手牌与装备',
  fangzhu: '受到伤害后,可令一名其他角色翻面并摸X张牌(X=你已损失的体力)',
  songwei: '主公技,其他魏势力角色的黑色判定牌生效后,你可以摸一张牌',
  duanliang: '将一张黑色基本牌或装备牌当【兵粮寸断】使用,并可指定距离2的角色',
  huoshou: '锁定技,南蛮入侵对你无效,且由你代替使用者成为其伤害来源',
  zaiqi: '摸牌阶段可改为亮出X张牌(X=已损失体力),红桃回复1点,其余入手',
  juxiang: '锁定技,南蛮入侵对你无效;其他角色使用的南蛮结算后你获得之',
  lieren: '杀造成伤害后,可与目标拼点,赢则获得其一张牌',
  haoshi: '摸牌阶段可多摸两张,若手牌超过5张须将一半交给手牌最少的角色',
  dimeng: '每回合限一次,弃X张牌令两名其他角色交换手牌(X=两者手牌数之差)',
  jiuchi: '将一张黑桃手牌当【酒】使用',
  roulin: '锁定技,你对女性、女性对你使用的杀需要两张闪响应',
  benghuai: '锁定技,结束阶段你不是体力最小的角色时,失去1点体力或减1点体力上限',
  baonve: '主公技,其他群势力角色造成伤害后可判定,黑桃则你回复1点体力',
  wansha: '锁定技,你的回合内,濒死的角色只有本人能使用桃',
  luanwu: '限定技,所有其他角色依次对各自距离最近的角色出杀,否则失去1点体力',
  weimu: '锁定技,你不能成为黑色锦囊牌的目标',
  yinghun: '准备阶段已受伤时,可令一名其他角色摸X弃一或摸一弃X(X=你已损失的体力)',
  // 一将成名2011
  luoying: '其他角色的梅花牌因弃置或判定进入弃牌堆时,你获得之',
  jiushi: '需要使用酒时可翻面视为使用酒;武将牌背面时受到伤害后翻回正面',
  jueqing: '锁定技,你造成的伤害均视为体力流失',
  shangshi: '手牌数少于已损失体力时,将手牌补至该数量',
  yizhong: '锁定技,防具区为空时,黑色的杀对你无效',
  enyuan: '其他角色令你回复体力后其摸一张牌;对你造成伤害后须交你一张红桃或失去1点体力',
  xuanhuo: '每回合限一次,交给一名角色一张红桃手牌,获得其一张牌并转交第三名角色',
  xinzhan: '手牌数大于体力上限时,观看牌堆顶三张并获得其中的红桃',
  huilei: '锁定技,杀死你的角色弃置所有牌',
  wuyan: '锁定技,你与其他角色之间的非延时锦囊伤害均无效',
  jujian: '每回合限一次,弃一至三张牌令一名其他角色摸等量;弃满三张同类别则回复1点体力',
  xuanfeng: '失去装备区的牌后,可视为使用杀,或对距离1的角色造成1点伤害',
  pojun: '杀造成伤害后,可令目标摸X张牌(X=其体力值,至多5)并翻面',
  ganlu: '每回合限一次,令两名角色交换装备区的牌(装备数差不超过你已损失的体力)',
  buyi: '一名角色濒死时,可展示其一张手牌,非基本牌则弃之令其回复1点体力',
  mingce: '每回合限一次,交给一名角色装备牌或杀,其选择视为对你指定的角色出杀、或摸一张牌',
  zhichi: '回合外受到伤害后,本回合杀与非延时锦囊对你无效',
  xianzhen: '每回合限一次拼点:赢则本回合对其出杀无距离次数限制且无视防具,输则不能出杀',
  jinjiu: '锁定技,你的酒均视为杀',
  // 神
  wushen: '锁定技,你的红桃手牌均视为杀',
  wuhun: '死亡时,令对你造成伤害最多的角色判定,非桃与桃园结义则其死亡',
  shelie: '摸牌阶段可改为亮出牌堆顶五张牌,获得其中每种花色各一张',
  gongxin: '出牌阶段限一次,查看一名角色的手牌,可展示其中一张红桃并弃置或置于牌堆顶',
  guixin: '受到伤害后,可获得每名其他角色的一张随机手牌,然后翻面',
  feiying: '锁定技,其他角色计算与你的距离+1',
  // 山
  tuntian: '回合外失去牌后可判定,非红桃置为"田";你每有一张田,计算与其他角色距离-1',
  zaoxian: '觉醒技,准备阶段田≥3时,减1点体力上限并获得技能急袭',
  jixi: '你可以将一张"田"当【顺手牵羊】使用',
  qiaobian: '可弃一张手牌跳过一个阶段:摸牌阶段改为获得两名角色各一张手牌,出牌阶段改为移动场上一张牌',
  tiaoxin: '每回合限一次,令攻击范围内含你的一名角色对你使用杀,否则你弃置其一张牌',
  zhiji: '觉醒技,准备阶段没有手牌时,回复1点或摸两张,减1点体力上限并获得观星',
  xiangle: '锁定技,杀指定你为目标时,使用者须弃一张基本牌,否则此杀无效',
  fangquan: '可跳过出牌阶段,结束阶段弃一张手牌,令一名其他角色获得一个额外回合',
  jiang: '你使用红色杀/决斗,或成为红色杀/决斗的目标时,摸一张牌',
  hunzi: '觉醒技,准备阶段体力为1时,减1点体力上限并获得英姿、英魂',
  zhijian: '出牌阶段,将手牌中的一张装备牌置入其他角色的装备区,然后摸一张牌',
  guzheng: '其他角色的弃牌阶段结束时,可将其一张弃牌返还给他,你获得其余弃牌',
  huashen: '开局获得两张化身牌,每回合准备阶段可声明获得其中一个技能',
  xinsheng: '受到伤害后,获得一张化身牌',
  beige: '任意角色受到杀的伤害后,可弃一张牌令其判定:红桃回复1点/方块摸两张/梅花来源弃两张/黑桃来源翻面',
  duanchang: '锁定技,杀死你的角色失去所有武将技能',
  // 界限突破
  jjianxiong: '受到伤害后,你可以摸一张牌并获得对你造成伤害的牌',
  jfankui: '每受到1点伤害,可获得伤害来源的一张牌',
  jganglie: '每受到1点伤害可判定,非红桃则来源选择:弃两张手牌或受到1点伤害',
  jtuxi: '摸牌阶段可少摸X张牌,改为获得X名角色各一张手牌(X至多2)',
  jluoyi: '摸牌阶段可放弃摸牌,亮出三张获得其中的基本牌/武器/决斗,本回合杀与决斗伤害+1',
  jluoshen: '准备阶段可判定,黑色则获得之并可继续;获得的判定牌本回合不计入手牌上限',
  jrende: '将任意张手牌交给一名本阶段未获得过仁德牌的角色;给出第二张时可视为使用一张基本牌',
  jwusheng: '你可以将一张红色牌当杀使用或打出;方块杀无距离限制',
  yijue: '每回合限一次,弃一张牌令一名角色展示一张手牌:黑色则其本回合技能失效,红色则你获得之并可令其回复1点体力',
  jpaoxiao: '锁定技,杀无次数限制;本回合使用过杀后,再使用杀无距离限制',
  jguanxing: '准备阶段观看牌堆顶五张牌(存活少于4人时三张),任意调整放回顶部或底部',
  yajiao: '回合外使用或打出手牌后,亮出牌堆顶一张牌,与之同类别则获得,否则弃置',
  jtieji: '杀指定目标后可判定,目标须弃一张与结果同花色的牌,否则不能使用闪',
  jjizhi: '使用非延时锦囊时摸一张牌;若为基本牌可弃置之,本回合手牌上限+1',
  jzhiheng: '出牌阶段限一次,弃任意张牌摸等量;若弃光所有手牌,额外多摸一张',
  fenwei: '限定技,群体锦囊指定目标后,可令此牌对其中任意名目标无效',
  qinxue: '觉醒技,准备阶段手牌比体力多3张(7人以上2张)时,减1点体力上限并获得攻心',
  jkurou: '出牌阶段限一次,弃一张牌,然后失去1点体力',
  zhaxiang: '锁定技,每失去1点体力摸三张牌;出牌阶段失去体力后,本阶段红杀无距离限制且不可被闪响应,杀次数+1',
  jyingzi: '锁定技,摸牌阶段多摸一张牌;你的手牌上限等于体力上限',
  jfanjian: '每回合限一次,展示一张手牌并交给一名其他角色,其选择:展示所有手牌并弃置同花色的牌,或失去1点体力',
  jguose: '每阶段限一次,将一张方块牌当乐不思蜀使用,然后摸一张牌',
  jlianying: '失去最后的手牌后,可令至多X名角色各摸一张牌(X=失去的手牌数)',
  jxiaoji: '失去装备区的牌后,摸两张牌',
  jqingnang: '出牌阶段每名角色限一次,弃一张手牌令一名已受伤角色回复1点体力;弃黑色牌则本阶段青囊失效',
  liyu: '杀造成伤害后,可获得目标区域一张牌:非装备则其摸一张,装备则其指定另一名角色与你决斗',
  jbiyue: '结束阶段摸一张牌;若没有手牌,则摸两张',
  shensu3: '神速③:可跳过弃牌阶段并翻面,视为使用一张杀',
  jjushou: '结束阶段可摸四张牌并弃置一张,然后翻面',
  jiewei: '你的武将牌翻至正面时,可移动场上的一张牌',
  jliegong: '你的杀可指定距离不大于其点数的目标;目标手牌不多于你则不可闪,体力不小于你则伤害+1',
  jkuanggu: '对距离1以内的角色造成伤害后,可回复1点体力或摸一张牌',
  qimou: '限定技,失去X点体力,本回合计算距离-X且可额外使用X张杀',
  jtianxiang: '受到伤害时可弃一张红桃手牌,令一名其他角色受此伤害并按已损失体力摸牌,或令其失去1点体力并获得此牌',
  fenji: '一名角色结束阶段没有手牌时,可失去1点体力令其摸两张牌',
  jleiji: '使用或打出闪后可令一名角色判定:黑桃则其受2点雷电伤害,梅花则受1点且你回复1点体力',
  jguhuo: '扣置手牌声明为任意基本牌或非延时锦囊;质疑真牌者获得"缠怨"',
  chanyuan: '锁定技,你不能质疑蛊惑;体力为1时,你的其他技能失效',
};

export const ROLE_NAMES: Record<Role, string> = {
  lord: '主公', loyalist: '忠臣', rebel: '反贼', spy: '内奸',
};

export const FACTION_NAMES: Record<string, string> = {
  wei: '魏', shu: '蜀', wu: '吴', qun: '群', god: '神',
};

export const SUIT_SYMBOLS: Record<string, string> = {
  spade: '♠', heart: '♥', club: '♣', diamond: '♦',
};

const RANK_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function rankLabel(rank: number): string {
  return RANK_NAMES[rank] ?? String(rank);
}

export function cardLabel(s: GameState, id: number): string {
  const c = s.cards[id];
  return `${CARD_NAMES[c.name]}${SUIT_SYMBOLS[c.suit]}${rankLabel(c.rank)}`;
}

export function seatLabel(s: GameState, pid: PlayerId): string {
  const p = s.players.find((x) => x.id === pid)!;
  return `${p.seat + 1}号位`;
}

export function playerLabel(s: GameState, pid: PlayerId, humanId?: PlayerId): string {
  const p = s.players.find((x) => x.id === pid)!;
  const you = humanId !== undefined && pid === humanId ? '(你)' : '';
  if (p.unpicked) return `${seatLabel(s, pid)}${you}`;
  return `${GENERAL_NAMES[p.general]}${you}`;
}

export function describeEvent(s: GameState, ev: GameEvent, humanId?: PlayerId): string | null {
  const label = (pid: PlayerId) => playerLabel(s, pid, humanId);
  switch (ev.type) {
    case 'turnStarted':
      return `—— ${label(ev.player)} 的回合 ——`;
    case 'phaseChanged':
      return null;
    case 'cardPlayed': {
      const as = ev.as ? `(当作${CARD_NAMES[ev.as]})` : '';
      const tgt = ev.targets.length > 0 && ev.targets[0] !== ev.player
        ? ` 对 ${ev.targets.map((t) => label(t)).join('、')}`
        : '';
      return `${label(ev.player)}${tgt} 使用了 ${cardLabel(s, ev.cardId)}${as}`;
    }
    case 'cardResponded': {
      const as = ev.as ? `(当作${CARD_NAMES[ev.as]})` : '';
      return `${label(ev.player)} 打出了 ${cardLabel(s, ev.cardId)}${as}`;
    }
    case 'cardsMoved': {
      switch (ev.reason) {
        case 'draw':
          return `${label(ev.to.player!)} 摸了 ${ev.cardIds.length} 张牌`;
        case 'discard-phase':
        case 'zhiheng':
        case 'qingnang':
        case 'lijian':
          return `${label(ev.from.player!)} 弃置了 ${ev.cardIds.map((id) => cardLabel(s, id)).join('、')}`;
        case 'rende':
          return `${label(ev.from.player!)} 将 ${ev.cardIds.length} 张手牌交给了 ${label(ev.to.player!)}`;
        case 'guohe':
          return ev.from.zone === 'hand'
            ? `${label(ev.from.player!)} 的一张手牌被弃置`
            : `${label(ev.from.player!)} 的 ${ev.cardIds.map((id) => cardLabel(s, id)).join('、')} 被弃置`;
        case 'shunshou':
          return `${label(ev.to.player!)} 获得了 ${label(ev.from.player!)} 的一张牌`;
        case 'jianxiong':
        case 'fankui':
          return `${label(ev.to.player!)} 获得了 ${ev.cardIds.length} 张牌`;
        case 'replace-equip':
          return `${label(ev.from.player!)} 替换下 ${ev.cardIds.map((id) => cardLabel(s, id)).join('、')}`;
        default:
          return null;
      }
    }
    case 'damage': {
      const kind = ev.element === 'fire' ? '火焰伤害' : ev.element === 'thunder' ? '雷电伤害' : '伤害';
      return ev.source
        ? `${label(ev.source)} 对 ${label(ev.target)} 造成了 ${ev.amount} 点${kind}`
        : `${label(ev.target)} 受到了 ${ev.amount} 点${kind}`;
    }
    case 'chained':
      return ev.chained
        ? `${label(ev.player)} 被横置(连环状态)`
        : `${label(ev.player)} 重置(解除连环)`;
    case 'hpChanged':
      return ev.delta > 0
        ? `${label(ev.player)} 回复了 ${ev.delta} 点体力(${ev.hp})`
        : null;
    case 'judge':
      return `${label(ev.player)} 判定:${cardLabel(s, ev.cardId)}`;
    case 'skillInvoked':
      return `${label(ev.player)} 发动了【${SKILL_NAMES[ev.skill]}】`;
    case 'nullified':
      return `${CARD_NAMES[ev.cardName]} 被无懈可击抵消了`;
    case 'reshuffled':
      return '弃牌堆洗回了牌堆';
    case 'playerDied': {
      const killer = ev.killer ? `被 ${label(ev.killer)} 杀死,` : '';
      return `${label(ev.player)}(${ROLE_NAMES[ev.role]})${killer}阵亡`;
    }
    case 'phaseSkipped': {
      const phaseNames: Record<string, string> = {
        start: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束',
      };
      return ev.reason === 'lebusishu'
        ? `${label(ev.player)} 被乐不思蜀跳过了出牌阶段`
        : `${label(ev.player)} 跳过了${phaseNames[ev.phase] ?? ev.phase}阶段`;
    }
    case 'cardRevealed':
      return `${label(ev.player)} 展示了 ${cardLabel(s, ev.cardId)}`;
    case 'generalChosen':
      return `${seatLabel(s, ev.player)} 选择了武将 ${GENERAL_NAMES[ev.general]}`;
    case 'factionChosen':
      return `${label(ev.player)} 选择了势力:${FACTION_NAMES[ev.faction] ?? ev.faction}`;
    case 'targeted':
      return null; // 仅用于 UI 指向箭头,技能日志由 skillInvoked 承担
    case 'pindian':
      return `${label(ev.a)} 与 ${label(ev.b)} 拼点:`
        + `${cardLabel(s, ev.cardA)} 对 ${cardLabel(s, ev.cardB)},`
        + `${ev.won ? label(ev.a) : label(ev.b)} 胜`;
    case 'flipped':
      return ev.flipped
        ? `${label(ev.player)} 的武将牌翻面(将跳过一个回合)`
        : `${label(ev.player)} 的武将牌翻回正面(跳过此回合)`;
    case 'virtualCard': {
      const tgt = ev.targets.length > 0 && ev.targets[0] !== ev.player
        ? ` 对 ${ev.targets.map((t) => label(t)).join('、')}`
        : '';
      return `${label(ev.player)}${tgt} 视为使用了 ${CARD_NAMES[ev.as]}`;
    }
    case 'gameOver':
      return `游戏结束!${ev.winner.map((r) => ROLE_NAMES[r]).join('、')} 阵营获胜`;
  }
}

export function describeRequest(s: GameState, req: PendingRequest, humanId?: PlayerId): string {
  const label = (pid: PlayerId) => playerLabel(s, pid, humanId);
  switch (req.type) {
    case 'play':
      return '你的出牌阶段';
    case 'respond-card': {
      const r = req.reason;
      switch (r.kind) {
        case 'slash':
          return `${label(r.source!)} 对你使用了杀,是否打出闪?`;
        case 'duel':
          return `与 ${label(r.source!)} 决斗中,是否打出杀?`;
        case 'qinglong':
          return `青龙偃月刀:是否立即对 ${label(r.target!)} 再使用一张杀?`;
        case 'aoe':
          return r.cardName === 'nanman'
            ? `${label(r.source!)} 使用了南蛮入侵,是否打出杀?`
            : `${label(r.source!)} 使用了万箭齐发,是否打出闪?`;
        case 'jiedao':
          return `${label(r.source!)} 借刀杀人:对 ${label(r.target!)} 使用杀,否则将武器交给对方`;
        case 'luanwu':
          return `${label(r.source!)} 发动了乱武:对距离最近的角色使用杀,否则失去1点体力`;
        case 'tiaoxin':
          return `${label(r.target!)} 挑衅你:对其使用一张杀,否则其弃置你一张牌`;
        case 'dying':
          return r.who === req.player
            ? '你处于濒死状态,是否使用桃?'
            : `${label(r.who!)} 濒死,是否使用桃救援?`;
        case 'nullify': {
          const neg = r.negated ? '(它当前已被无懈)' : '';
          return `${label(r.source!)} 对 ${label(r.target!)} 使用了${CARD_NAMES[r.cardName!]}${neg},是否使用无懈可击?`;
        }
        default:
          return '请打出一张牌';
      }
    }
    case 'choose-cards':
      switch (req.reason.kind) {
        case 'guicai':
          return `是否发动【鬼才】打出一张手牌替换 ${label(req.reason.who!)} 的判定牌?`;
        case 'liuli':
          return '流离:弃置一张牌以转移这张杀';
        case 'ganglie-discard':
          return '刚烈:请弃置两张手牌';
        case 'yiji':
          return '遗计:选择要分给其他角色的牌(不选则全部保留)';
        case 'wugu':
          return '五谷丰登:选择一张牌获得';
        case 'guanshi-discard':
          return '贯石斧:弃置两张牌强制命中(不含贯石斧)';
        case 'cixiong-discard':
          return '雌雄双股剑:请弃置一张手牌';
        case 'huogong-show':
          return '火攻:请展示一张手牌';
        case 'huogong-match': {
          const suit = req.reason.suit ? SUIT_SYMBOLS[req.reason.suit] : '';
          return `火攻:弃置一张 ${suit} 花色手牌,对 ${label(req.reason.target!)} 造成1点火焰伤害`;
        }
        case 'tianxiang':
          return '天香:选择一张红桃手牌弃置以转移此伤害';
        case 'shensu-equip':
          return '神速:选择一张装备牌弃置';
        case 'guhuo':
          return '蛊惑:选择要扣置的手牌';
        case 'pindian':
          return `拼点:与 ${label(req.reason.target!)} 各选一张手牌比点数,大者胜`;
        case 'haoshi':
          return '好施:选择一半手牌交给手牌最少的一名其他角色';
        case 'gongxin':
          return '攻心:查看其手牌,可选择展示其中一张红桃';
        case 'yinghun':
          return '英魂:请弃置指定数量的手牌';
        case 'enyuan':
          return '恩怨:交出一张红桃手牌,否则失去1点体力(点放弃)';
        case 'xiangle':
          return '享乐:弃置一张基本牌,否则你的杀对刘禅无效';
        case 'beige':
          return '悲歌:可弃置一张牌,令受到杀伤害的角色进行判定';
        case 'qiaobian':
          return '巧变:弃置一张手牌以发动此阶段的巧变';
        case 'fangquan':
          return '放权:弃置一张手牌,令一名其他角色获得一个额外回合';
        case 'guzheng':
          return '固政:选择一张返还给弃牌的角色,其余弃牌归你';
        case 'yijue':
          return '义绝:请展示一张手牌(黑色:本回合技能失效;红色:被其获得,可回复1点体力)';
        case 'jtieji': {
          const suit = req.reason.suit ? SUIT_SYMBOLS[req.reason.suit] : '';
          return `界铁骑:弃置一张 ${suit} 花色的牌,否则不能使用闪`;
        }
        case 'jjushou':
          return '据守:弃置一张手牌,然后翻面';
        default:
          return `请弃置 ${req.min} 张手牌`;
      }
    case 'choose-option':
      switch (req.reason) {
        case 'bagua': return '是否发动【八卦阵】进行判定?(红色视为闪)';
        case 'jianxiong': return '是否发动【奸雄】获得造成伤害的牌?';
        case 'fankui': return '是否发动【反馈】获得伤害来源的一张牌?';
        case 'liuli': return '是否发动【流离】把这张杀转移给别人?';
        case 'tieji': return '是否发动【铁骑】进行判定?(红色则目标不能闪)';
        case 'ganglie': return '是否发动【刚烈】进行判定?';
        case 'ganglie-choice': return '刚烈生效:弃两张手牌,或受到1点伤害';
        case 'yiji': return '是否发动【遗计】摸两张牌?';
        case 'luoshen': return '是否发动【洛神】判定?(黑色则获得判定牌并可继续)';
        case 'guanxing': return '是否发动【观星】查看并调整牌堆顶的牌?';
        case 'tuxi': return '是否发动【突袭】放弃摸牌,改为获得至多两名角色各一张手牌?';
        case 'luoyi': return '是否发动【裸衣】少摸一张牌,本回合杀/决斗伤害+1?';
        case 'fanjian-suit': return '反间:猜一种花色(猜错将受到1点伤害)';
        case 'cixiong-choice': return '雌雄双股剑:弃一张手牌,或令攻击者摸一张牌';
        case 'guanshi': return '是否发动【贯石斧】弃两张牌强制命中?';
        case 'qilin': return '是否发动【麒麟弓】弃置目标的一匹马?';
        case 'hanbing': return '是否发动【寒冰剑】防止伤害,改为弃置其两张牌?';
        case 'zhuque': return '是否发动【朱雀羽扇】将此杀当作火杀?';
        case 'shensu1': return '是否发动【神速】跳过判定和摸牌阶段,视为使用一张杀?';
        case 'shensu2': return '是否发动【神速】跳过出牌阶段并弃置一张装备牌,视为使用一张杀?';
        case 'jushou': return '是否发动【据守】摸三张牌并翻面?';
        case 'liegong': return '是否发动【烈弓】令目标不能使用闪?';
        case 'kuanggu': return '是否发动【狂骨】回复1点体力?';
        case 'tianxiang': return '是否发动【天香】弃一张红桃手牌转移此伤害?';
        case 'leiji': return '是否发动【雷击】令一名角色判定?(黑桃则受2点雷伤)';
        case 'guhuo-challenge': return '是否质疑这次蛊惑?(若为真,你失去1点体力)';
        case 'mengjin': return '是否发动【猛进】弃置目标的一张牌?';
        case 'shuangxiong': return '是否发动【双雄】放弃摸牌,改为判定并获得判定牌?(本回合可将异色手牌当决斗)';
        case 'niepan': return '是否发动【涅槃】?(限定技:弃置所有牌,复原武将牌,摸三张并回复到3点体力)';
        case 'fangzhu': return '是否发动【放逐】令一名其他角色翻面并摸牌?';
        case 'zaiqi': return '是否发动【再起】放弃摸牌,改为亮出已损失体力数的牌?(红桃回血,其余入手)';
        case 'haoshi': return '是否发动【好施】额外摸两张牌?(手牌超过5张需送出一半)';
        case 'lieren': return '是否发动【烈刃】与目标拼点?(赢则获得其一张牌)';
        case 'baonve': return '是否发动【暴虐】判定?(黑桃则主公回复1点体力)';
        case 'benghuai': return '崩坏:你不是体力最小的角色,失去1点体力或减1点体力上限';
        case 'yinghun': return '英魂:选择令目标摸X弃一,或摸一弃X(X=你已损失的体力)';
        case 'buyi': return '是否发动【补益】展示濒死者一张手牌?(非基本牌则弃之令其回复1点)';
        case 'pojun': return '是否发动【破军】令目标摸牌(其体力值)并翻面?';
        case 'xuanfeng': return '旋风:失去装备后,视为出杀或对距离1的角色造成1点伤害';
        case 'mingce': return '明策:视为对指定角色使用杀,或摸一张牌';
        case 'guixin': return '是否发动【归心】从每名其他角色处获得一张随机手牌,然后翻面?';
        case 'shelie': return '是否发动【涉猎】放弃摸牌,改为亮出五张并获得每种花色各一张?';
        case 'gongxin-where': return '攻心:弃置这张红桃,或将其置于牌堆顶';
        case 'god-faction': return '你是神武将:请选择登场势力(影响救援/血裔等势力技能)';
        case 'tuntian': return '是否发动【屯田】判定?(非红桃判定牌置为"田",每张田计算与其他角色距离-1)';
        case 'zhiji': return '志继觉醒:选择回复1点体力或摸两张牌(体力上限已-1,并获得观星)';
        case 'fangquan': return '是否发动【放权】跳过出牌阶段?(结束阶段可弃一张手牌令他人获得额外回合)';
        case 'guzheng': return '是否发动【固政】?(将其此阶段弃置的牌返还一张,其余归你)';
        case 'huashen': return '化身:声明获得一张化身牌上的技能(至回合结束)';
        case 'jrende': return '界仁德:本阶段给出了第二张仁德牌,可视为使用一张基本牌';
        case 'yijue-heal': return '义绝:是否令其回复1点体力?';
        case 'jfanjian': return '界反间:展示所有手牌并弃置与其交来的牌同花色的牌,或失去1点体力';
        case 'fenwei': return '是否发动【奋威】?(限定技:令此群体锦囊对任意名目标无效)';
        case 'shensu3': return '是否发动【神速】跳过弃牌阶段并翻面,视为使用一张杀?';
        case 'liyu': return '是否发动【利驭】获得其一张牌?(非装备则其摸一张;装备则其指定角色与你决斗)';
        case 'qimou': return '奇谋(限定技):失去X点体力,本回合距离-X且可额外使用X张杀';
        case 'fenji': return '是否发动【奋激】失去1点体力,令没有手牌的该角色摸两张牌?';
        case 'jjizhi': return '集智:摸到的是基本牌,是否弃置之令本回合手牌上限+1?';
        case 'jtianxiang-mode': return '界天香:令其受到转移的伤害并摸牌,或令其失去1点体力并获得你弃置的红桃';
      }
      return '';
    case 'choose-player':
      switch (req.reason.kind) {
        case 'tuxi': return `突袭:选择至多 ${req.max} 名角色,各获得其一张手牌`;
        case 'liuli': return '流离:选择杀的新目标(须在你的攻击范围内)';
        case 'yiji': return '遗计:选择获得这些牌的角色';
        case 'leiji': return '雷击:选择一名角色进行判定(黑桃则其受到2点雷电伤害)';
        case 'jieming': return '节命:令一名角色将手牌补至其体力上限';
        case 'quhu': return '驱虎:选择拼点对象攻击范围内的一名角色,由其对之造成1点伤害';
        case 'fangzhu': return '放逐:令一名其他角色翻面并摸等同于你已损失体力的牌';
        case 'yinghun': return '英魂:选择一名其他角色(摸X弃一或摸一弃X,X=你已损失的体力)';
        case 'xuanhuo': return '眩惑:选择获得这张牌的角色(不能是原持有者)';
        case 'xuanfeng': return '旋风:选择目标角色';
        case 'haoshi': return '好施:选择获得这些牌的角色(手牌最少者)';
        case 'luanwu': return '乱武:选择距离最近的一名角色作为杀的目标';
        case 'jlianying': return '界连营:选择摸牌的角色(每人一张)';
        case 'fenwei': return '奋威:选择要豁免此群体锦囊的角色';
        case 'liyu': return '利驭:选择与其决斗的角色';
        default: return '请选择目标角色';
      }
    case 'arrange-cards':
      return '观星:调整牌堆顶的牌(上方为牌堆顶,按顺序摸取;移到下方则放到牌堆底)';
    case 'pick-card': {
      if (req.reason === 'qiaobian') return `巧变:选择要移动的 ${label(req.target)} 场上的一张牌`;
      if (req.reason === 'liyu') return `利驭:选择要获得的 ${label(req.target)} 的一张牌`;
      const what = req.reason === 'guohe' || req.reason === 'mengjin' || req.reason === 'tiaoxin'
        ? '弃置' : '获得';
      return `选择要${what}的 ${label(req.target)} 的一张牌`;
    }
    case 'choose-general': {
      const me = s.players.find((x) => x.id === req.player)!;
      return me.role === 'lord' ? '你是主公,请选择你的武将' : '请选择你的武将';
    }
  }
}

export const OPTION_LABELS: Record<string, string> = {
  bagua: '发动八卦阵',
  jianxiong: '发动奸雄',
  fankui: '发动反馈',
  liuli: '发动流离',
  tieji: '发动铁骑',
  ganglie: '发动刚烈',
  'ganglie-discard': '弃两张手牌',
  'ganglie-damage': '受到1点伤害',
  yiji: '发动遗计',
  luoshen: '发动洛神',
  guanxing: '发动观星',
  tuxi: '发动突袭',
  luoyi: '发动裸衣',
  'cixiong-discard': '弃一张手牌',
  'cixiong-draw': '令其摸一张牌',
  guanshi: '发动贯石斧',
  qilin: '发动麒麟弓',
  hanbing: '发动寒冰剑',
  zhuque: '当作火杀',
  'qilin-plus': '弃置 +1马',
  'qilin-minus': '弃置 -1马',
  shensu1: '发动神速',
  shensu2: '发动神速',
  jushou: '发动据守',
  liegong: '发动烈弓',
  kuanggu: '发动狂骨',
  tianxiang: '发动天香',
  leiji: '发动雷击',
  'guhuo-challenge': '质疑',
  mengjin: '发动猛进',
  shuangxiong: '发动双雄',
  niepan: '发动涅槃',
  fangzhu: '发动放逐',
  zaiqi: '发动再起',
  haoshi: '发动好施',
  lieren: '发动烈刃',
  baonve: '发动暴虐',
  'benghuai-hp': '失去1点体力',
  'benghuai-maxhp': '减1点体力上限',
  'yinghun-a': '摸X张弃一张',
  'yinghun-b': '摸一张弃X张',
  buyi: '发动补益',
  pojun: '发动破军',
  'xuanfeng-sha': '视为使用杀',
  'xuanfeng-damage': '对距离1造成伤害',
  'mingce-sha': '视为使用杀',
  'mingce-draw': '摸一张牌',
  guixin: '发动归心',
  shelie: '发动涉猎',
  'gongxin-discard': '弃置之',
  'gongxin-top': '置于牌堆顶',
  tuntian: '发动屯田',
  'jrende-sha': '视为使用杀',
  'jrende-tao': '视为使用桃',
  'jrende-jiu': '视为使用酒',
  'yijue-heal': '令其回复1点体力',
  'jfanjian-show': '展示手牌弃同花色',
  'jfanjian-hp': '失去1点体力',
  fenwei: '发动奋威',
  shensu3: '发动神速',
  liyu: '发动利驭',
  'qimou-1': '失去1点体力',
  'qimou-2': '失去2点体力',
  'qimou-3': '失去3点体力',
  fenji: '发动奋激',
  jjizhi: '弃置并+1手牌上限',
  'jtx-damage': '令其受此伤害并摸牌',
  'jtx-losehp': '令其失去1点体力得此牌',
  'kuanggu-heal': '回复1点体力',
  'kuanggu-draw': '摸一张牌',
  'zhiji-heal': '回复1点体力',
  'zhiji-draw': '摸两张牌',
  fangquan: '发动放权',
  guzheng: '发动固政',
  'faction-wei': '魏',
  'faction-shu': '蜀',
  'faction-wu': '吴',
  'faction-qun': '群',
  spade: '♠ 黑桃',
  heart: '♥ 红桃',
  club: '♣ 梅花',
  diamond: '♦ 方块',
};
