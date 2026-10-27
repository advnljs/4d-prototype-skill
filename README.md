# 4D Prototype · Claude Code skill

把需求文档变成 **4D 原型**：传统原型是一页页摆在空间里的界面（三维），4D 原型多了第四维——**时间**。整个业务变成一条会自己播放的时间轴，按业务时间从第一件事走到最后一件（定时任务、跨天的对账结算、并行分支都在里面），随时暂停、0.25×–2× 调速、跳到任一环节、单独重放，任何人都能随时接手自己点。

时间轴上的每一刻都能看到：**谁**在做（角色、机器、外部系统）、**走到哪一步**（流程依赖图 DAG）、**数据此刻长什么样**（原始格式、状态变化、字段流转）。流程本身写成结构化数据，所以还能**形式化验证**：无环、上下游数据对得上、从任一环节开始都能走完、必需环节不依赖可选环节、非法状态迁移被拒绝，每次改动自动校验。

| 传统原型的痛点 | 4D 原型 |
|---|---|
| 一页页截图，流程靠人讲 | 一键运行，按业务时间自动推进 |
| 谁、在什么时候、做什么，看不出来 | 每个角色一条泳道，演示光标标出是谁在操作 |
| 并行、等待、跨天，画不出来 | 依赖图管先后，时间轴管时刻，点一下跳到次日 |
| 流程对不对，全靠人肉检查 | 流程结构化，不变量测试自动校验 |
| 数据全是占位符 | 报文、库表、Excel 按原样呈现，逐环节可追溯 |
| 换个条件，就得重画 | 换情景、改参数，当场重播 |

适用于大多数 IT 项目：审批与工单、数据处理与核查、系统集成、管理后台、报表、RPA、消费类多端应用、AI / 智能体。后台与外部系统都是确定性的模拟实现，不连接真实系统。

## 安装

任选一种：

```bash
npx 4d-prototype                 # 装到 ~/.claude/skills/4d-prototype（所有项目可用）
npx 4d-prototype --project       # 只装到当前项目 ./.claude/skills/
```

```bash
npx skills add advnljs/4d-prototype-skill    # skills.sh 生态，可选择安装到哪些 agent
```

```bash
clawhub install 4d-prototype                 # ClawHub
```

装好后新开一个 Claude Code 会话，把需求文档交给它，例如：“基于 refer/ 里的需求文档做一个 4D 原型”。

## 仓库内容

| 目录 | 内容 |
|---|---|
| [skills/4d-prototype](skills/4d-prototype/SKILL.md) | skill 本体（英文）：方法、6 篇参考文档、材料解析与无头 Chrome 脚本、时间轴编排层参考实现 flow-kit |
| [examples/tob-doc-audit](examples/tob-doc-audit/README.md) | toB 示例：集团财务共享中心收付款单据智能核查（规则引擎 + 模拟智能体 + RPA 上传与回写 + 驾驶舱），14 个环节 |
| [examples/toc-food-delivery](examples/toc-food-delivery/README.md) | toC 示例：即时配送平台一单外卖的全流程（三端联动 + 智能派单 + 支付幂等 + 对账结算），17 个环节、6 个情景，另有手机版 |

示例的品牌、主体、人物与数据全部虚构。运行示例：

```bash
cd examples/toc-food-delivery && npm install && npm run dev   # http://localhost:5290
cd examples/tob-doc-audit && npm install && npm run dev       # http://localhost:5280
```

打开后点“一键运行完整流程”。`npm test` 运行流程不变量、情景与领域测试。

## English

A Claude Code skill that turns requirement materials (PRD, specs, Word / PDF / Excel samples, sketches, API docs) into a **4D prototype**: a clickable prototype plus a fourth dimension, **time**. The business plays by itself along a timeline at business time — including scheduled and overnight jobs, callbacks and parallel branches — with pause, 0.25–2× speed, jump to any step and replay. Every moment shows who is acting, which step of the workflow DAG is running and what the data looks like. Because the flow is structured data, it is formally checked by tests on every change.

Install with `npx 4d-prototype`, `npx skills add advnljs/4d-prototype-skill` or `clawhub install 4d-prototype`, then ask Claude Code to build a prototype from your requirement doc.

## License

[MIT-0](LICENSE)
