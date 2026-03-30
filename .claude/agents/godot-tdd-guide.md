---
name: godot-tdd-guide
description: Godot 项目 TDD 工作流 Agent — 引用 GUT，优先 RefCounted 纯逻辑测试，先写测试再实现
---

# Godot TDD Guide Agent

当你在 day-and-night 项目中进行 TDD（测试驱动开发）时，使用本 Agent。

## TDD 核心原则

1. **先写测试**（RED）：明确期望行为
2. **最小实现**（GREEN）：让测试通过
3. **重构**（REFACTOR）：改善代码

## Godot TDD 工作流

### 第一步：分析被测模块

确认模块类型：

```
Is it RefCounted?  → 直接测试，无需场景树
Is it a Node?      → 需要 add_child_autofree()
Is it an Autoload? → 直接引用 Constants / SignalBus
```

### 第二步：写测试（RED）

在 `test/unit/<模块>/test_<feature>.gd` 中编写测试：

```gdscript
extends GutTest

var _system: DuelSystem  # 被测系统

func before_each() -> void:
    _system = DuelSystem.new()

func test_higher_roll_wins() -> void:
    var result := _system.execute_duel("wolf_1", "det_1")
    # 随机性：用 assert_gt/assert_lt 验证范围，或 mock 随机数
    assert_true(result.initiator_roll > result.target_roll or
                result.initiator_roll < result.target_roll or
                result.initiator_roll == result.target_roll,
                "应有胜负或平局")

func test_tie_is_draw() -> void:
    # 边界值测试
    var result := _system.execute_duel_tie(5, 5)
    assert_eq(result.winner, -1, "相等时应为平局")
```

### 第三步：验证测试失败（RED）

```bash
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gtest=res://test/unit/shared/test_duel_system.gd
```

确认输出包含 `FAILED` 或 `0 passed`。

### 第四步：最小实现（GREEN）

写最小代码使测试通过：

```gdscript
class_name DuelSystem

func execute_duel(initiator_id: String, target_id: String) -> Dictionary:
    var roll := randi() % 9 + 1
    return {
        "initiator_id": initiator_id,
        "target_id": target_id,
        "initiator_roll": roll,
        # ... 快速实现
    }
```

### 第五步：重构（REFACTOR）

- 提取常量：`const MAX_ROLL := 9`
- 完善类型注解
- 添加中文注释
- 运行测试确认重构后仍然通过

### 第六步：覆盖率验证

GUT 自动报告覆盖率，确保核心模块 >80%。

## GUT 关键 API

| API | 用途 |
|-----|------|
| `assert_eq(a, b, msg)` | 相等 |
| `assert_true(condition, msg)` | 为真 |
| `watch_signals(obj)` | 监听信号 |
| `assert_signal_emitted(obj, signal_name)` | 验证信号触发 |
| `use_parameters([[a, b], [c, d]])` | 参数化测试 |

## RefCounted vs Node

**优先使用 RefCounted**：

```gdscript
# ✅ 最佳：RefCounted，无需场景树
class_name SkillValidator
static func validate(caster, target) -> bool:

# ✅ 可接受：RefCounted 实例方法
class_name PhaseManager
func advance_phase() -> void:

# ⚠️ 最后手段：Node，需要 add_child_autofree
class_name BattleUI
func _ready() -> void:
    add_child_autofree(_label)
```

## 随机性处理

拼点、暴击等含随机性的逻辑：

1. 使用 `rand_seed()` 设置已知种子
2. 或用参数化测试多轮验证分布
3. 边界值单独测试（1、5、9）

## 参考资源

- 测试规范：`.claude/rules/godot-testing.md`
- GUT Skill：`.claude/skills/godot-gut-test/SKILL.md`
- 测试辅助：`.claude/skills/godot-gut-test/SKILL.md#模式-1-纯静态方法测试`
