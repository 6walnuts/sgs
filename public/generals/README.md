# 自定义武将图片

把图片命名为 `<武将id>.jpg` 放进本目录即可覆盖内置的矢量头像,例如:

```
liubei.jpg  guanyu.jpg  caocao.jpg  simayi.jpg
sunquan.jpg ganning.jpg diaochan.jpg huatuo.jpg
```

建议比例约 4:5(如 240×300)。

## 一键下载公有领域古画

在联网的机器上运行:

```bash
npm run portraits          # 已存在的文件会跳过
npm run portraits -- --force  # 覆盖重新下载
```

脚本会从 Wikimedia Commons 检索这 8 位人物的历史画像(《历代帝王图》、
《三才图会》、清代《三国演义》绣像等),只接受公有领域许可的文件,
下载后在本目录生成 `CREDITS.md` 记录每张图的来源与许可。
下载完请进游戏过目;不合适的删掉对应 jpg 即回退到内置矢量头像。

手动放置图片时,请只使用你拥有版权或授权的图片(三国杀官方牌面图
属于游卡桌游的美术资产,请勿放入公开分发的版本)。
