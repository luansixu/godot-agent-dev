---
name: godot-coding-style
description: GDScript 代码风格规范 — Tab 缩进、snake_case、SignalBus 通信、中文注释
type: rules
---

# GDScript 编码风格规范

> 适用项目：`g:/ClaudeCode/day-and-night`（Godot 4.6 GDScript）
> 本规则补充全局 `coding-style.md`，GDScript 项目优先使用本规则。

## 缩进与格式

- **使用 Tab 缩进**（Godot 编辑器默认），不用空格
- 文件编码：**UTF-8**
- 行尾：**LF**（跨平台一致）
- 类名：`PascalCase`（如 `PhaseManager`、`SkillValidator`）
- 方法/变量/文件名：`snake_case`（如 `get_current_phase`、`phase_manager`）
- 常量：`SCREAMING_SNAKE_CASE`（如 `MAX_AP`、`TILE_COST`）
- 信号名：`snake_case`（如 `phase_changed`、`unit_died`）

## 注释规范

- **使用中文注释**，与项目文档风格一致
- 每个类/方法应有简短 docstring 说明用途
- 复杂逻辑块添加行内注释说明

```gdscript
## 获取当前游戏阶段
func get_current_phase() -> int:
    return _current_phase

## 消耗 AP，支持非许可阶段双倍消耗
func consume_ap(unit: UnitSnapshot, delta: int, is_licensed: bool) -> void:
    var cost := delta if is_licensed else delta * 2
    unit.ap = max(0, unit.ap - cost)
```

## 跨模块通信：必须通过 SignalBus

**强制约束**：模块间通信必须通过 `SignalBus`，禁止直接引用其他 Autoload 或节点。

```gdscript
# ❌ 错误：直接调用
other_module.do_something()

# ✅ 正确：通过信号
SignalBus.phase_changed.emit(new_phase)
```

SignalBus 常用信号：
- `phase_changed(phase: int, turn: int)`
- `unit_state_changed(unit_id: String, old_state: int, new_state: int)`
- `action_submitted(unit_id: String, command: Dictionary)`
- `game_over(winner: int)`

## 文件组织

- 一个类一个文件，文件名与类名一致
- 文件路径：`src/<模块>/<feature>.gd`
- Autoload 单例路径：`shared/<name>.gd`（项目启动时注册为全局变量）
- `class_name` 类路径：`src/<模块>/<ClassName>.gd`

## 类型注解

- **必须标注返回类型**（`: int`、`: bool`、`: void`）
- 方法参数尽量标注类型
- 集合类型标注元素类型：`Array[String]`、`Dictionary`、`<UnitSnapshot>`

```gdscript
func get_valid_actions(unit_id: String) -> Array[Dictionary]:
func advance_phase() -> void:
```

## 错误处理

- 使用 `Result`/`Dictionary` 返回值封装成功/失败，避免异常
- 验证前置条件（null 检查、状态检查）后尽早返回

```gdscript
func _handle(caster, target, snapshot) -> Dictionary:
    if caster == null:
        return _fail("施法者无效")
    if not _is_in_range(caster, target):
        return _fail("目标超出范围")
    # ... 正常逻辑
    return _ok({"effects": []})
```
