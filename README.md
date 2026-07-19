# 网页版三国杀(单机版)

标准身份场 4 人局:1 名人类玩家 + 3 个 AI。游戏引擎与 UI 完全分离,为将来联机预留了架构。

## 运行

```bash
npm install
npm run dev      # 开发服务器
npm test         # 引擎单元测试(vitest)
npm run build    # 类型检查 + 生产构建
```

## 架构

```
src/
├── engine/        游戏引擎:纯 TS,零依赖,不接触 DOM/React
│   ├── types.ts   GameState / Action / PendingRequest / GameEvent 类型
│   ├── engine.ts  入口:createGame / applyAction(state, action) → { state, events }
│   ├── frames.ts  结算栈帧(杀-闪、伤害、濒死、判定、无懈链、决斗、锦囊)
│   ├── flow.ts    回合流程 + 出牌阶段处理(含全部主动技能)
│   ├── kernel.ts  区域移动 / 摸牌 / 死亡与胜负 等共享工具
│   ├── rules.ts   距离、攻击范围、出牌合法性
│   ├── setup.ts   建局(洗牌、分身份、分武将)
│   ├── rng.ts     可序列化随机数(状态存在 GameState.rngState 里)
│   └── view.ts    视角过滤 viewFor(联机时按玩家分发用)
├── ai/            simpleAi:读取状态 → 产出 ResponseData,绝不直接改状态
├── game/          LocalGame:本地宿主,把人类/AI 应答统一喂给引擎
│                  (联机时这一层换成服务器 + WebSocket,引擎与 AI 不动)
└── ui/            React 单页应用
```

### 核心机制

- **applyAction 是纯函数**:非法 Action 返回 `error` 且状态原样;合法则返回新
  GameState + 本次事件列表。UI 动画与日志都消费事件。
- **GameState 完整可 JSON 序列化**:多步结算的全部进度记录在 `state.stack`
  的"结算栈帧"里(纯数据,无闭包),任意暂停点序列化后可原地继续 —— 这是
  联机同步与断线重连的基础。随机数状态也在 state 内,同 seed + 同 Action
  序列可完整重放。
- **请求-响应**:引擎任意时刻最多一个 `pendingRequest`,一切输入都是对它的
  应答(带 requestId 防过期/乱序)。人类由 UI 应答,AI 由 simpleAi 应答,
  联机时由 WebSocket 应答,接口完全一致。

## 已实现内容

- 身份:主公/忠臣/反贼/内奸各 1,主公 +1 体力上限,死亡奖惩、胜负判定
- 武将 8 个:刘备(仁德)、关羽(武圣)、曹操(奸雄)、司马懿(反馈/鬼才)、
  孙权(制衡/救援)、甘宁(奇袭)、貂蝉(离间/闭月)、华佗(急救/青囊)
- 牌:杀/闪/桃;过河拆桥/顺手牵羊/无中生有/决斗/无懈可击(支持无懈反制无懈);
  诸葛连弩/青龙偃月刀/八卦阵/±1马
- 完整回合流程、距离计算(含马)、濒死求桃、牌堆耗尽重洗
- UI:手牌点选、目标点击、技能按钮、响应弹窗 + 20 秒倒计时(超时默认应答)、
  出牌历史日志

## 已知简化(后续迭代)

- 主公技仅实现救援;激将(刘备)、护驾(曹操)未实现
- 武将随机分配,暂无选将界面
- AI 敌我判断直接读取身份(不看他人手牌);后续改为基于 `viewFor` 视角 + 身份推理
- 鬼才 AI 暂不改判;武圣/急救暂只支持手牌转化
