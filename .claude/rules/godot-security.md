---
name: godot-security
description: Godot 项目安全规范 — res:// 路径校验、.tres 资源结构校验、信号总线隔离
type: rules
---

# Godot GDScript 安全规范

> 适用项目：`g:/ClaudeCode/day-and-night`（Godot 4.6）
> 本规则补充全局 `security.md`，Godot 项目优先使用本规则。

## 资源路径安全（res://）

**所有资源加载必须使用 `res://` 前缀**，禁止硬编码绝对路径。

```gdscript
# ✅ 正确
var scene = load("res://data/characters/detective.tres")
var script = preload("res://src/skills/effects/skill_investigate.gd")

# ❌ 错误：绝对路径
var scene = load("C:/Users/.../detective.tres")
```

### 路径校验

加载外部资源前验证路径合法性：

```gdscript
func safe_load(path: String) -> Resource:
    if not path.begins_with("res://"):
        push_error("非法资源路径: " + path)
        return null
    if not FileAccess.file_exists(path):
        push_error("资源不存在: " + path)
        return null
    return load(path)
```

## .tres 资源文件安全

- `.tres` 文件内容不可信，需要类型校验
- 访问 `.tres` 属性前检查是否为预期类型

```gdscript
var char_data: CharacterData = resource as CharacterData
if char_data == null:
    push_error("资源类型不匹配: " + resource_path)
    return
```

## SignalBus 隔离原则

模块间通信通过 SignalBus，防止意外耦合：

- **禁止**模块 A 直接持有模块 B 的引用
- **禁止**在 `shared/` 外直接 `get_node()` 获取其他模块节点
- 信号参数只传递必要数据，不传递对象引用

```gdscript
# ✅ 正确：传递 ID 和必要数据
SignalBus.unit_died.emit(unit_id, position, killer_id)

# ❌ 错误：传递对象引用（增加耦合）
SignalBus.unit_died.emit(unit_object)
```

## 用户输入校验

玩家输入（键盘/鼠标/网络命令）必须校验：

- 命令类型是否合法（`Constants.CommandType`）
- 目标单位是否存在
- AP 消耗是否足够
- 施法者状态是否允许动作

```gdscript
func submit_command(cmd: Dictionary) -> Dictionary:
    if not _is_valid_command_type(cmd.get("type")):
        return CommandResult.fail("非法命令类型")
    if not _unit_exists(cmd.get("unit_id")):
        return CommandResult.fail("单位不存在")
    # ...
```

## 不暴露敏感数据

战斗日志（`BattleLogEntry.text_public`）不得暴露暗置角色身份：

```gdscript
# ❌ 错误：暴露身份
battle_log.append("狼人袭击了" + target.role_id)

# ✅ 正确：只描述行为
battle_log.append("一名角色袭击了另一名角色")
```

## 拒绝服务防护

- 禁止在 `_process`/`_physics_process` 中进行重量级运算
- 使用 `yield`/`await` 分帧处理长时间操作
- 限制循环迭代次数，防止死循环
