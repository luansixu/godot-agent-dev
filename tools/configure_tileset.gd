## TileSet 配置工具
## 用法: godot --headless --path "$PWD" -s res://tools/configure_tileset.gd -- --output <path>
## 无参数时输出帮助信息

extends SceneTree

# ============================================================================
# 配置参数
# ============================================================================

## Tile 大小（像素）
const TILE_SIZE := Vector2i(64, 64)

## TerrainSet 0: 棋盘底格
const BOARD_BG_TEXTURE := "res://assets/placeholders/placeholder_board_bg.png"
const BOARD_COLOR := Color("#37474F")  # 深灰色

## TerrainSet 1: 高亮覆盖层（4 个 terrain：蓝/绿/黄/红）
const HIGHLIGHT_COLORS := {
	0: Color("#2196F3"),  # 蓝: 选中格
	1: Color("#4CAF50"),  # 绿: AP tier 0
	2: Color("#FFC107"),  # 黄: AP tier 1
	3: Color("#F44336"),  # 红: AP tier 2
}

# ============================================================================
# 主程序
# ============================================================================

func _init() -> void:
	# Godot 4.x -s script.gd 时：
	#   OS.get_cmdline_args() → 包含 -s 和脚本路径（需要过滤）
	#   OS.get_cmdline_user_args() → -- 后的用户参数
	# 策略：将所有脚本参数放在 -- 后，全部由 get_cmdline_user_args() 获取
	var all_args := OS.get_cmdline_user_args()
	_main_inner(all_args)


func _main_inner(args: Array) -> void:
	print("=== TileSet 配置工具 ===")

	var output_path := ""
	var verbose := false

	# 无参数时输出帮助
	if args.size() == 0:
		_print_help()
		quit(0)
		return

	# 解析参数
	var i := 0
	while i < args.size():
		var arg: String = args[i]
		if arg == "--output" or arg == "-o":
			i += 1
			if i < args.size():
				output_path = args[i]
		elif arg == "--verbose" or arg == "-v":
			verbose = true
		elif arg == "--help" or arg == "-h":
			_print_help()
			quit(0)
			return
		else:
			print("未知参数: ", arg)
			_print_help()
			quit(0)
			return
		i += 1

	if output_path.is_empty():
		print("错误: 必须指定 --output 参数")
		_print_help()
		quit(0)
		return

	# 确保目录存在
	var dir := output_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir):
		DirAccess.make_dir_recursive_absolute(dir)
		print("创建目录: ", dir)

	# 创建 TileSet
	print("开始配置 TileSet...")
	var ts := _create_board_tileset()
	if ts == null:
		push_error("TileSet 配置失败")
		quit(1)
		return

	# 保存
	var result: int = ResourceSaver.save(ts, output_path)
	if result == OK:
		print("TileSet 保存成功: ", output_path)
	else:
		push_error("保存失败，错误码: " + str(result))
		quit(1)
		return

	# 验证
	_verify_tileset(output_path, verbose)
	quit(0)


func _print_help() -> void:
	print("""
TileSet 配置工具 - 为《昼与夜》棋盘创建 TileSet

用法:
  godot --headless --path "$PWD" -s res://tools/configure_tileset.gd \\
    --output res://path/to/output.tres -- --verbose

参数（放在 -s 之后，-- 之前或之后均可）:
  --output <path>, -o <path>   输出 .tres 文件路径（必需）
  --verbose, -v                  打印详细配置信息
  --help, -h                    显示此帮助信息

说明:
  参数可放在 -- 前后，OS.get_cmdline_args() 和 get_cmdline_user_args()
  分别获取两部分参数并合并。

示例:
  G:/Godot/Godot_v4.6-stable_win64.exe \\
    --headless --path "g:/ClaudeCode/day-and-night" \\
    -s res://tools/configure_tileset.gd \\
    --output res://assets/tilesets/board_tileset.tres -- --verbose
""")


# ============================================================================
# TileSet 构建核心
# ============================================================================

## 创建棋盘 TileSet
## 返回值: TileSet 或 null（失败时）
func _create_board_tileset() -> TileSet:
	var ts := TileSet.new()
	ts.tile_size = TILE_SIZE

	# -------------------------------------------------------------------------
	# TerrainSet 0: 棋盘底格 (mode=2, MATCH_CORNERS_AND_SIDES)
	# -------------------------------------------------------------------------
	_add_terrain_set_board(ts)
	print("  TerrainSet 0: 棋盘底格 (mode=MATCH_CORNERS_AND_SIDES=2)")

	# -------------------------------------------------------------------------
	# TerrainSet 1: 高亮覆盖层（4 个 terrain）
	# -------------------------------------------------------------------------
	_add_terrain_set_highlight(ts)
	print("  TerrainSet 1: 高亮覆盖层 (4 terrain: 蓝/绿/黄/红)")

	# -------------------------------------------------------------------------
	# Source 0: 棋盘底格
	# -------------------------------------------------------------------------
	var src0_id: int = _add_source_board(ts)
	print("  Source 0: 棋盘底格 texture (source_id=", src0_id, ")")

	# -------------------------------------------------------------------------
	# Source 1: 高亮 atlas（TerrainSet 1）
	# -------------------------------------------------------------------------
	var src1_id: int = _add_source_highlight(ts)
	print("  Source 1: 高亮 atlas (source_id=", src1_id, ", TerrainSet 1)")

	return ts


## 添加 TerrainSet 0: 棋盘底格
## mode: 0=CORNERS, 1=MATCH_CORNERS, 2=MATCH_SIDES, 3=MATCH_CORNERS_AND_SIDES
func _add_terrain_set_board(ts: TileSet) -> void:
	ts.add_terrain_set()
	ts.set_terrain_set_mode(0, 2)  # 2 = MATCH_CORNERS_AND_SIDES
	ts.add_terrain(0)  # terrain 0
	ts.set_terrain_color(0, 0, BOARD_COLOR)


## 添加 TerrainSet 1: 高亮覆盖层（4 个 terrain）
func _add_terrain_set_highlight(ts: TileSet) -> void:
	ts.add_terrain_set()  # TerrainSet 1
	ts.set_terrain_set_mode(1, 2)  # 2 = MATCH_CORNERS_AND_SIDES

	# 添加 4 个 terrain: 蓝(0)/绿(1)/黄(2)/红(3)
	for i in range(4):
		ts.add_terrain(1)
		ts.set_terrain_color(1, i, HIGHLIGHT_COLORS[i])


## 添加 Source 0: 棋盘底格（单张 64x64 PNG）
## board_renderer.gd 调用: grid_cells.set_cell(pos, 0, Vector2i(x, y))
## atlas_coords=(x,y) 是格子的地图坐标，texture 中 region 的位置应为 (0,0)
func _add_source_board(ts: TileSet) -> int:
	var texture_exists := FileAccess.file_exists(BOARD_BG_TEXTURE)

	var src: TileSetAtlasSource = TileSetAtlasSource.new()
	src.texture_region_size = TILE_SIZE

	if texture_exists:
		src.texture = load(BOARD_BG_TEXTURE)
		src.create_tile(Vector2i(0, 0))
		# 设置 terrain
		var td: TileData = src.get_tile_data(Vector2i(0, 0), 0)
		if td:
			td.set("terrain_set", 0)
			td.set("terrain", 0)
		print("    board_bg texture: ", BOARD_BG_TEXTURE)
	else:
		push_warning("    警告: board_bg texture 不存在: " + BOARD_BG_TEXTURE)
		src.create_tile(Vector2i(0, 0))

	# source_id = 0 固定给棋盘底格
	ts.add_source(src, 0)
	return 0


## 添加 Source 1: 高亮 atlas
## 策略: 使用一张 256x64 atlas 图（4 列×1 行）
## atlas 布局: (0,0)=蓝, (1,0)=绿, (2,0)=黄, (3,0)=红
## board_renderer.gd: highlight_layer.set_cell(pos, 1, Vector2i(terrain, 0))
## ⚠️ board_renderer.gd 目前 highlight_layer 用 source_id=0，需要改为 1
func _add_source_highlight(ts: TileSet) -> int:
	# 尝试加载 atlas（正式版合并后的 256x64 图）
	var atlas_path := "res://assets/tilesets/placeholder_highlight_atlas.png"
	var use_atlas := FileAccess.file_exists(atlas_path) and _can_load_texture(atlas_path)

	var src: TileSetAtlasSource = TileSetAtlasSource.new()
	src.texture_region_size = TILE_SIZE

	# 设置 texture（优先加载文件，否则程序化生成）
	if use_atlas:
		src.texture = load(atlas_path)
		print("    使用 atlas: ", atlas_path)
	else:
		# 程序化生成实色 atlas（无外部文件依赖）
		var colors: Array[Color] = [
			Color("#2196F3"),  # 蓝
			Color("#4CAF50"),  # 绿
			Color("#FFC107"),  # 黄
			Color("#F44336"),  # 红
		]
		var atlas_img: Image = _create_solid_atlas(256, 64, colors)
		var atlas_tex := ImageTexture.create_from_image(atlas_img)
		src.texture = atlas_tex
		print("    程序化生成实色 atlas (256x64, 4 colors)")

	# Atlas: 4 tiles 在一行，atlas_coords = (0..3, 0)
	for i in range(4):
		src.create_tile(Vector2i(i, 0))
		var td: TileData = src.get_tile_data(Vector2i(i, 0), 0)
		if td:
			td.set("terrain_set", 1)
			td.set("terrain", i)  # terrain 0-3
		else:
			push_warning("    警告: get_tile_data 返回 null for atlas_coords=", Vector2i(i, 0))

	ts.add_source(src, 1)
	print("    Source 1 高亮 atlas 已配置 (source_id=1)")
	print("    ⚠️ board_renderer.gd 高亮层:")
	print("       highlight_layer.set_cell 的 source_id 改为 1")
	print("       atlas_coords 改为 Vector2i(terrain, 0) 其中 terrain=0-3")
	return 1


## 检查 Godot 是否能加载纹理（PNG 需要已导入）
func _can_load_texture(path: String) -> bool:
	var tex = load(path)
	if tex == null:
		return false
	return tex is ImageTexture or tex is AtlasTexture or tex is Image


## 创建实色 atlas Image（程序化生成，无外部文件依赖）
func _create_solid_atlas(w: int, h: int, colors: Array[Color]) -> Image:
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for i in range(colors.size()):
		var x0 := i * (w / colors.size())
		var x1 := (i + 1) * (w / colors.size())
		for x in range(x0, x1):
			for y in range(h):
				img.set_pixel(x, y, colors[i])
	return img


## 验证 TileSet 文件
func _verify_tileset(path: String, verbose: bool) -> void:
	print("\n--- 验证 TileSet ---")
	if not FileAccess.file_exists(path):
		push_error("文件不存在: " + path)
		return

	var ts: TileSet = load(path) as TileSet
	if ts == null:
		push_error("文件不是有效的 TileSet: " + path)
		return

	print("  Tile size: ", ts.tile_size)
	print("  Source count: ", ts.get_source_count())
	print("  TerrainSet count: ", ts.get_terrain_sets_count())

	for i in range(ts.get_terrain_sets_count()):
		var mode: int = ts.get_terrain_set_mode(i)
		var tc: int = ts.get_terrains_count(i)
		print("  TerrainSet ", i, ": mode=", mode, " terrains_count=", tc)

	for sid_idx in range(ts.get_source_count()):
		var sid: int = ts.get_source_id(sid_idx)
		var src = ts.get_source(sid)
		if src is TileSetAtlasSource:
			var tex_path := ""
			if src.texture:
				tex_path = src.texture.resource_path
			var tile_count: int = src.get_tiles_count()
			print("  Source ", sid, ": texture=", tex_path, " tiles=", tile_count)

	print("\n  配置完成！")
	print("  下一步:")
	print("    1. 将 ", path)
	print("       分配给 GridCells 和 HighlightLayer 的 Tile Set 属性")
	print("    2. 修改 board_renderer.gd:")
	print("       highlight_layer.set_cell 的 source_id 改为 1")
	print("       atlas_coords 改为 Vector2i(terrain, 0) 其中 terrain=0-3")
