---
name: godot-gut-test
description: >-
  使用 GUT (Godot Unit Testing) 框架为 Godot 4.x 项目编写单元测试和集成测试。
  当用户说"写测试"、"添加测试"、"单元测试"、"GUT测试"、"test"时使用。
---

# GUT 测试编写指南

## 项目约定

### 目录结构

```
res://test/
├── unit/                    # 纯逻辑单元测试（不依赖场景树）
│   ├── test_skill_validator.gd
│   ├── test_ai_evaluator.gd
│   ├── test_phase_manager.gd
│   └── test_victory_checker.gd
└── integration/             # 集成测试（涉及多模块协作）
    ├── test_ai_full_turn.gd
    └── test_skill_pipeline.gd
```

### 配置文件

项目根目录 `res://.gutconfig.json`:

```json
{
  "dirs": ["res://test/unit/", "res://test/integration/"],
  "include_subdirs": true,
  "should_exit": true,
  "log_level": 3,
  "prefix": "test_",
  "suffix": ".gd"
}
```

### 命令行运行

> 统一使用 `--headless` 模式，与 `CLAUDE.md` 保持一致。`-gconfig=res://.gutconfig.json` 加载配置（`should_exit: true` 使测试完成后自动退出）。

```bash
# 运行全部测试（标准验收命令）
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json

# 运行指定文件
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gtest=res://test/unit/test_skill_validator.gd

# 运行指定目录
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gdir=res://test/unit/

# 运行名称匹配的测试
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gunit_test_name=validate
```

---

## 测试脚本基础结构

```gdscript
extends GutTest

# 被测模块（纯逻辑类用 RefCounted/静态方法，无需场景树）
# 如果是 class_name 注册的类可直接引用，否则 load/preload

func before_all() -> void:
    # 整个脚本执行前运行一次
    pass

func before_each() -> void:
    # 每个 test_ 方法前运行
    pass

func after_each() -> void:
    # 每个 test_ 方法后运行
    pass

func after_all() -> void:
    # 整个脚本执行后运行一次
    pass

func test_方法名必须以test_开头() -> void:
    assert_true(true, "描述信息")
```

---

## 常用断言速查

| 断言 | 用途 | 示例 |
|------|------|------|
| `assert_eq(got, expected, text)` | 相等 | `assert_eq(hp, 100)` |
| `assert_ne(got, expected, text)` | 不等 | `assert_ne(id, "")` |
| `assert_true(got, text)` | 为真 | `assert_true(result.valid)` |
| `assert_false(got, text)` | 为假 | `assert_false(result.valid)` |
| `assert_null(got, text)` | 为null | `assert_null(unit)` |
| `assert_not_null(got, text)` | 非null | `assert_not_null(cmd)` |
| `assert_gt(got, expected, text)` | 大于 | `assert_gt(score, 0)` |
| `assert_lt(got, expected, text)` | 小于 | `assert_lt(score, 100)` |
| `assert_gte(got, expected, text)` | 大于等于 | `assert_gte(ap, 2)` |
| `assert_lte(got, expected, text)` | 小于等于 | `assert_lte(ap, 10)` |
| `assert_between(got, low, high, text)` | 范围内 | `assert_between(score, -100, 100)` |
| `assert_has(obj, element, text)` | 包含元素 | `assert_has(array, "detective")` |
| `assert_does_not_have(obj, element, text)` | 不包含 | `assert_does_not_have(arr, "x")` |
| `assert_eq_deep(v1, v2)` | 深度比较 | `assert_eq_deep(dict_a, dict_b)` |
| `assert_string_contains(text, search)` | 字符串包含 | `assert_string_contains(msg, "失败")` |
| `assert_is(obj, cls, text)` | 类型判断 | `assert_is(cmd, RefCounted)` |
| `assert_has_method(obj, method)` | 方法存在 | `assert_has_method(obj, "validate")` |

### 信号断言

```gdscript
func test_signal_emitted() -> void:
    var pm := PhaseManager.new()
    watch_signals(pm)
    pm.advance_phase()
    assert_signal_emitted(pm.phase_changed)
    assert_signal_emitted_with_parameters(pm.phase_changed, [Constants.Phase.NOON])
    assert_signal_emit_count(pm.phase_changed, 1)
```

### 标记测试状态

```gdscript
func test_not_implemented_yet() -> void:
    pending("等待 G3 接口就绪")

func test_manual_pass() -> void:
    pass_test("手动通过")

func test_manual_fail() -> void:
    fail_test("发现缺陷")
```

---

## 本项目测试模式

### 模式 1: 纯静态方法测试（最常用）

项目中 `SkillValidator`、`AIEvaluator` 等均为 `RefCounted` + 静态方法，无需场景树。

```gdscript
extends GutTest

# SkillValidator 通过 class_name 全局注册，可直接使用

func test_validate_skill_caster_not_exist() -> void:
    var snapshot := _make_empty_snapshot()
    var result := SkillValidator.validate_skill("invalid_id", "maul", "target_1", snapshot)
    assert_false(result.valid, "施法者不存在应返回 invalid")
    assert_string_contains(result.message, "不存在")

func test_validate_skill_ap_insufficient() -> void:
    var snapshot := _make_snapshot_with_unit("u1", "werewolf", 1) # AP=1, maul需要2
    var result := SkillValidator.validate_skill("u1", "maul", "u2", snapshot)
    assert_false(result.valid, "AP不足应返回 invalid")

# 辅助工厂方法（在测试脚本内定义）
func _make_empty_snapshot() -> RefCounted:
    # 构造最小可用的 mock snapshot
    ...
```

### 模式 2: 实例方法测试

```gdscript
extends GutTest

var _phase_manager: PhaseManager

func before_each() -> void:
    _phase_manager = PhaseManager.new()

func test_initial_phase_is_dawn() -> void:
    assert_eq(_phase_manager.get_current_phase(), Constants.Phase.DAWN)

func test_advance_full_cycle() -> void:
    for i in 6:
        _phase_manager.advance_phase()
    assert_eq(_phase_manager.get_current_round(), 2, "6次推进后应进入第2回合")
```

### 模式 3: Inner Test Classes 分组

```gdscript
extends GutTest

class TestSkillRangeCheck:
    extends GutTest

    func test_investigate_range_is_3() -> void:
        assert_eq(SkillValidator.SKILL_RANGES.get("investigate"), 3)

    func test_maul_range_is_1() -> void:
        assert_eq(SkillValidator.SKILL_RANGES.get("maul"), 1)

    func test_default_range() -> void:
        assert_eq(SkillValidator.DEFAULT_SKILL_RANGE, 1)

class TestSkillValidation:
    extends GutTest

    func test_dead_caster_cannot_use_skill() -> void:
        # ...
        pass
```

### 模式 4: 参数化测试

```gdscript
extends GutTest

func test_skill_ranges(params = use_parameters([
    ["investigate", 3],
    ["arrest", 2],
    ["guard_protect", 1],
    ["maul", 1],
    ["curse", 2],
    ["assassinate", 1],
])) -> void:
    var skill_id: String = params[0]
    var expected_range: int = params[1]
    assert_eq(
        SkillValidator.SKILL_RANGES.get(skill_id),
        expected_range,
        "%s 的范围应为 %d" % [skill_id, expected_range]
    )
```

### 模式 5: 需要场景树的测试

```gdscript
extends GutTest

func test_node_based_component() -> void:
    var node := SomeNode.new()
    add_child_autofree(node)  # 测试结束自动 free
    # node 现在在场景树中，可以测试 _ready/_process 等
    assert_not_null(node)
```

---

## Mock / 辅助数据构造

本项目的数据结构定义在 `shared/data_structures.gd`（class_name: `DataStructures`）。
测试中构造快照和指令时直接使用这些工厂方法：

```gdscript
# 构造 ActionCommand
var move_cmd := DataStructures.ActionCommand.create_move("unit_1", Vector2i(3, 4))
var skill_cmd := DataStructures.ActionCommand.create_skill("unit_1", "maul", "unit_2")
var rest_cmd := DataStructures.ActionCommand.create_rest("unit_1")

# 构造 CommandResult
var ok_result := DataStructures.CommandResult.ok("操作成功")
var fail_result := DataStructures.CommandResult.fail("AP不足")
```

对于 `GameSnapshot` 等复杂对象，在测试文件中编写轻量级工厂函数：

```gdscript
func _make_unit_snapshot(id: String, role: String, faction: int, ap: int, pos: Vector2i) -> DataStructures.UnitSnapshot:
    var unit := DataStructures.UnitSnapshot.new()
    unit.unit_id = id
    unit.role_id = role
    unit.faction = faction
    unit.ap = ap
    unit.position = pos
    unit.state = Constants.UnitState.HIDDEN
    return unit
```

---

## 编写规范

1. **文件命名**: `test_<被测模块snake_case>.gd`，放在 `res://test/unit/` 或 `res://test/integration/`
2. **方法命名**: `test_<被测行为>_<预期结果>`，例如 `test_validate_skill_ap_insufficient`
3. **每个测试方法至少一个断言**，否则 GUT 标记为 risky
4. **优先测试纯逻辑**：`SkillValidator`、`AIEvaluator`、`PhaseManager`、`VictoryChecker` 等 RefCounted 类
5. **不要在测试中依赖 Autoload**：如需 `Constants` 枚举值，直接用 `Constants.Phase.DAWN` 等（Godot 编辑器运行测试时 Autoload 可用）；命令行模式如遇问题，改用 `DataStructures` 中的镜像常量
6. **内存管理**: Node 类型使用 `autofree()` 或 `add_child_autofree()`；RefCounted 自动回收
7. **断言消息使用中文**，与项目文档风格一致

---

## 补充参考

- GUT 官方文档: https://gut.readthedocs.io/en/latest/
- GutTest API: https://gut.readthedocs.io/en/latest/class_ref/class_guttest.html
- 命令行参数: https://gut.readthedocs.io/en/latest/Command-Line.html
