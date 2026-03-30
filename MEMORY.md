# MEMORY.md — 热记忆（每次会话必读）

> 精简版核心知识，< 50 行。每次会话 Claude Code 自动加载。
> 详细知识见 MEMORY_WARM.md（温记忆）和 MEMORY_COLD.md（冷记忆）。

---

## 核心约束（绝对禁止）

| 约束 | 说明 | 违规后果 |
|------|------|---------|
| **SignalBus 通信** | 跨模块必须通过 SignalBus，禁止直接引用 | 循环依赖 |
| **RefCounted 优先** | 纯逻辑类用 RefCounted，非 Node | 无法 headless 测试 |
| **6 阶段固定循环** | DAWN→NOON→DUSK→NIGHTFALL→MIDNIGHT→DAWN_BREAK | 游戏逻辑错乱 |
| **shared/ 冻结** | shared/ 目录为 Day 0 冻结产物 | 破坏全局状态 |

## 快速查询（常见问题）

| 问题 | 答案 |
|------|------|
| Godot 命令找不到 | 在 `~/.claude.json` 配置 shell alias |
| headless 测试崩溃 | 检查 `user://` 写权限，可能需要提权 |
| 截图无法分析 | MiniMax MCP 有 `understand_image`；Claude Code 内置视觉也行 |
| 需要 Godot 文档 | 用 `mcp__context7__query-docs` 查 Godot 4.6 |

## 关键文件路径

```
src/rules/         # 规则引擎（action_system, duel_system, phase_manager...）
src/skills/effects/  # 6 个技能效果（arrest, maul, curse, assassinate, guard_protect, investigate）
shared/           # 冻结区域（constants, signal_bus, data_structures）
test/unit/        # 单元测试（与 src/ 镜像结构）
```

---

> 本文件 < 50 行，Claude Code 每次会话自动加载。
> 如需详细信息，执行 `/skill memory-warm` 加载温记忆。
