# MEMORY_COLD.md — 冷记忆（历史归档）

> 历史决策和已解决的问题。几乎不需要查阅。
> 保留用于理解架构演进过程。

---

## 架构决策记录（ADR）- 历史归档

### ADR-001: 信号总线通信 ✓ 已执行
- **决策**: 所有跨模块通信必须通过 `SignalBus`
- **原因**: 避免循环依赖，支持模块独立测试
- **状态**: ✅ 已实施，shared/signal_bus.gd

### ADR-002: RefCounted 优先 ✓ 已执行
- **决策**: 纯逻辑类使用 `RefCounted` 而非 `Node`
- **原因**: 无需场景树即可测试，支持 headless CI
- **示例**: `SkillValidator`、`DuelSystem`、`PhaseManager`
- **状态**: ✅ 已实施

### ADR-003: 6 阶段固定循环 ✓ 已执行
- **决策**: 游戏回合固定为 DAWN→NOON→DUSK→NIGHTFALL→MIDNIGHT→DAWN_BREAK
- **约束**: 守序在 DAWN/NOON/DUSK；邪恶在 NIGHTFALL/MIDNIGHT/DAWN_BREAK
- **状态**: ✅ 已实施

### ADR-004: 村民入场替换机制 ✓ 已执行
- **决策**: 第一回合拂晓替换守序角色入场；第一回合入夜替换邪恶角色入场
- **触发**: `ReplacementSystem.needs_replacement(turn, phase)` 仅第1回合
- **状态**: ✅ 已实施

---

## 已解决的问题（历史记录）

### 旧 WK-003: MiniMax-Image 无图片理解（已解决）
- **原问题**: 误以为 MiniMax-Image 有图片理解功能
- **真相**: MiniMax MCP（`minimax-coding-plan-mcp`）有 `understand_image`
- **解决**: 修正文档，区分两个 MCP
- **日期**: 2026-03-30

---

## 废弃的内容

### 旧测试文件结构（2026-03 早期）
```
test/unit/rules/test_duel_system.gd  # 已补全
test/unit/rules/test_replacement_system.gd  # 已补全
test/unit/skills/effects/  # 6 个技能测试已补全
```
