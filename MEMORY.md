# MEMORY.md — 项目记忆

> 本文件记录影响 Agent 行为的项目级知识，供后续会话快速参考。
> 每次发现重要模式或已知问题时更新。

---

## 架构决策记录（ADR）

### ADR-001: 信号总线通信（2026-03）
**决策**：所有跨模块通信必须通过 `SignalBus`，禁止直接引用其他模块。
**原因**：避免循环依赖，支持模块独立测试。
**影响范围**：`src/` 下所有模块。

### ADR-002: RefCounted 优先（2026-03）
**决策**：纯逻辑类使用 `RefCounted` 而非 `Node`，降低测试门槛。
**原因**：无需场景树即可测试，支持 headless CI。
**示例**：`SkillValidator`、`DuelSystem`、`PhaseManager`。

### ADR-003: 6 阶段固定循环（2026-03）
**决策**：游戏回合固定为 DAWN→NOON→DUSK→NIGHTFALL→MIDNIGHT→DAWN_BREAK。
**原因**：阶段少而确定，AI 和规则引擎易于建模。
**约束**：守序阵营在 DAWN/NOON/DUSK 行动；邪恶在 NIGHTFALL/MIDNIGHT/DAWN_BREAK 行动。

### ADR-004: 村民入场替换机制（2026-03）
**决策**：第一回合拂晓替换守序角色入场；第一回合入夜替换邪恶角色入场。
**原因**：避免初始随机摆放导致的不平衡。
**触发**：`ReplacementSystem.needs_replacement(turn, phase)` 仅在第1回合的拂晓/入夜返回 true。

---

## 已知问题与 Workaround

### WK-001: Godot 不在 PATH（2026-03）
**问题**：命令行无法直接运行 `godot`。
**Workaround**：在 `~/.claude.json` 中配置 shell alias，或使用绝对路径。

### WK-002: headless 测试在沙箱下崩溃（2026-03）
**问题**：`user://` 目录无写权限时 GUT 崩溃。
**Workaround**：提权运行或设置 `user://` 到有写权限的目录。

### WK-003: MiniMax-Image 无图片理解能力（2026-03）
**问题**：MiniMax-Image MCP 只有 `generate_image`，无 `understand_image`。
**Workaround**：`capture_game_screenshot` 返回 base64 PNG，Claude Code 原生分析。

### WK-004: MCP Resources 不可用（2026-03）
**问题**：`godot://scene/current` 等 URI 尚未实现。
**Workaround**：使用 `run_project` + `get_debug_output` 轮询状态。

### WK-005: AnimationPlayer/Profiler MCP 未实现（2026-03）
**问题**：`animation.list_players`、`profiler.snapshot` 等工具不存在。
**Workaround**：直接用文件编辑 GDScript 动画资源；用 `get_debug_output` 替代性能分析。

---

## 游戏平衡参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 棋盘大小 | 10×10 | 20 名初始村民 |
| 每回合初始 AP | 4 | 所有角色通用 |
| 移动 AP 消耗 | 曼哈顿距离 | 相邻 = 1 AP |
| 非许可阶段 AP 消耗 | ×2 | 本阵营不行动阶段 |
| 拼点范围 | 1~9 | 掷骰子机制 |
| 调查技能范围 | 3 格（切比雪夫） | 侦探·线索分析 |
| 嗜血技能范围 | 1 格（切比雪夫） | 狼人·嗜血狼人 |
| 拘捕技能范围 | 2 格（切比雪夫） | 警长·拘捕监禁 |
| 魔药技能范围 | 2 格（切比雪夫） | 女巫·夺命魔药 |
| 暗杀技能范围 | 1 格（切比雪夫） | 刺客·一击必杀 |
| 守护技能范围 | 1 格（切比雪夫） | 守卫·范围守护 |

---

## MCP 工具实际状态

| 工具 | 状态 | 来源 |
|------|------|------|
| `capture_game_screenshot` | ✅ 已实现 | npm 包 @satelliteoflove/godot-mcp |
| `input_sequence` | ✅ 已实现 | npm 包 |
| `get_runtime_state` | ✅ 已实现 | npm 包 |
| `animation.list_players` | ❌ 未实现 | 计划支持 |
| `profiler.snapshot` | ❌ 未实现 | 计划支持 |
| `godot://scene/current` | ❌ 未实现 | 计划支持 |

---

## 团队协作要点

- 分支策略：所有修改在 `Zukov1` 分支（当前）；正式合流到 `main`
- 测试要求：PR 需全部 GUT 测试通过，CI 由 `.github/workflows/gut-test.yml` 驱动
- 核心文件冻结：`shared/` 目录为 "Day 0 冻结产物"，修改需评估影响
