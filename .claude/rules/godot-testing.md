---
name: godot-testing
description: Godot GUT 测试规范 — 目录约定、RefCounted 优先、覆盖率目标 80%
type: rules
---

# GUT 测试规范

> 适用项目：`g:/ClaudeCode/day-and-night`（Godot 4.6 / GUT 框架）
> 本规则补充全局 `testing.md`，GUT 测试优先使用本规范。

## 测试目标

- **最低覆盖率：80%**（新模块从写测试开始）
- 所有 `src/` 模块必须有对应测试
- 核心逻辑（拼点、技能效果、胜负判定）覆盖率优先保证

## 目录结构

```
test/
├── helpers/
│   └── test_helpers.gd      # 工厂类（全局 class_name）
├── unit/                    # 单元测试（与 src/ 镜像）
│   ├── ai/
│   ├── events/
│   ├── rules/
│   ├── shared/
│   └── skills/
└── integration/            # 集成测试
```

## 文件命名

- 测试文件：`test_<被测模块>.gd`（前缀 `test_`）
- 测试目录：`res://test/unit/<模块>/`
- 每个测试方法：`test_<行为>_<预期结果>`

## 测试类选择

**优先使用 `RefCounted`**：纯逻辑类无需场景树，测试最简单。

| 被测类型 | 测试基类 | 原因 |
|---------|---------|------|
| `RefCounted`（静态方法） | `GutTest` | 无需场景树 |
| `RefCounted`（实例方法） | `GutTest` | 需 `before_each`/`after_each` |
| `Node`（生命周期） | `GutTest` | 需 `add_child_autofree` |

## 工厂方法（TestHelpers）

使用 `TestHelpers` 构造测试数据，禁止在测试中硬编码复杂构造逻辑：

```gdscript
# ✅ 正确：使用工厂方法
var caster := TestHelpers.make_order_unit("det_1", "detective")
var snap := TestHelpers.make_snapshot([caster, target])

# ❌ 错误：直接在测试中构造
var caster := RefCounted.new()
caster.id = "det_1"
# ...
```

## 断言规范

- 每个测试方法**至少一个断言**
- 断言消息使用中文
- 信号断言优先于状态查询（信号是行为证据）

```gdscript
# ✅ 正确
watch_signals(SignalBus)
SignalBus.phase_changed.emit(Constants.Phase.NOON)
assert_signal_emitted_with_parameters(SignalBus.phase_changed, [Constants.Phase.NOON])

# ✅ 正确：中文消息
assert_false(result.success, "AP不足时应失败")
assert_string_contains(result.message, "AP不足")
```

## TDD 工作流

1. **RED**：先写测试，明确期望行为
2. **GREEN**：写最小实现使测试通过
3. **REFACTOR**：清理代码，保持测试通过
4. **验证覆盖率**：`godot --headless` + GUT 输出确认

## 命令行执行（Headless）

```bash
# 全量测试
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json

# 指定文件
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gtest=res://test/unit/rules/test_duel_system.gd
```

## 覆盖率检查

GUT 输出包含覆盖率统计，关注：
- `src/rules/` 和 `src/skills/` 必须 >80%
- 新增 `RefCounted` 类后立即写测试
- 禁止提交无测试的核心逻辑修改

## 内存管理

- `Node` 类型：使用 `add_child_autofree(node)`
- `RefCounted`：自动 GC，无需手动释放
- `before_each` 构造、`after_each` 清理（如有外部资源）
