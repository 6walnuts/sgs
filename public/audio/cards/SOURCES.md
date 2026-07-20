# 卡牌语音音效来源

> 同源素材还包括:`public/audio/skills/`(技能台词,文件名为本项目技能名,
> 多台词加数字后缀)、`public/audio/deaths/`(阵亡语音,按武将 id)、
> `public/audio/system/`(受伤/胜负音效)、`public/fx/`(战斗与武器防具
> 特效帧序列,目录名为本项目牌名/特效名)。全部复刻自 QSanguosha-v2,
> 版权归游卡桌游,仅个人使用,勿公开分发。

本目录音效复刻自开源项目 QSanguosha-v2 的 `audio/` 素材
(https://github.com/Mogara/QSanguosha-v2),原始音频版权归 **游卡桌游
(YOKA Games)** 所有,仅供个人学习使用,请勿公开分发或用于商业用途。

## 目录结构

- `male/<牌名>.ogg`、`female/<牌名>.ogg`:基本牌与锦囊语音,
  按使用者武将性别选择(来自 QSGS `audio/card/male|female/`)
- `<牌名>.ogg`(根目录):装备牌音效,无性别之分(来自 QSGS `audio/equip/`)

文件名使用本项目 `src/engine/deck.ts` 中的内部牌名(如 `sha`、`shan`、
`wuxie`、`qinglongdao`)。缺失的牌(如 +1/-1 马)会自动回退到浏览器语音合成。

## 文件名映射(QSGS → 本项目)

slash→sha, thunder_slash→leisha, fire_slash→huosha, jink→shan, peach→tao,
analeptic→jiu, duel→juedou, dismantlement→guohe, snatch→shunshou,
ex_nihilo→wuzhong, nullification→wuxie, indulgence→lebusishu,
supply_shortage→bingliang, iron_chain→tiesuo, fire_attack→huogong,
archery_attack→wanjian, savage_assault→nanman, amazing_grace→wugu,
god_salvation→taoyuan, collateral→jiedao, lightning→shandian;
double_sword→cixiong, ice_sword→hanbing, Spear→zhangba, Axe→guanshi,
Halberd→fangtian, kylin_bow→qilin, renwang_shield→renwang,
Crossbow→zhugeliannu, Blade→qinglongdao, eight_diagram→baguazhen,
Vine→tengjia, silver_lion→baiyin, Fan→zhuque, GudingBlade→gudingdao
