extends SceneTree

func _init() -> void:
	print("=== TileSet API 完整探测 ===")
	var ts := TileSet.new()
	ts.tile_size = Vector2i(64, 64)

	# 1. TerrainMode 枚举 - 用整数测试（避免枚举名称问题）
	print("\n--- TerrainMode enum ---")
	for i in range(4):
		print("  Testing mode ", i)
		ts.add_terrain_set()
		ts.set_terrain_set_mode(i, i)  # 用 i 作为 mode 值
		var retrieved: int = ts.get_terrain_set_mode(i)
		print("    set/get roundtrip: set=", i, " get=", retrieved)
		# 恢复

	# 2. add_terrain_set (注意: 不是 terrain_sets_add!)
	print("\n--- add_terrain_set ---")
	var ts2 := TileSet.new()
	ts2.tile_size = Vector2i(64, 64)
	ts2.add_terrain_set()
	print("add_terrain_set() → terrain_sets_count=", ts2.get_terrain_sets_count())

	# 3. add_terrain - 检查返回类型
	print("\n--- add_terrain 返回值 ---")
	ts2.add_terrain(0)
	print("add_terrain(0) → terrains_count=", ts2.get_terrains_count(0))
	ts2.add_terrain(0)
	print("add_terrain(0) again → terrains_count=", ts2.get_terrains_count(0))

	# 4. set_terrain_color
	print("\n--- set_terrain_color ---")
	ts2.set_terrain_color(0, 0, Color("#37474F"))
	print("set_terrain_color(0, 0, #37474F) ✓")
	var c: Color = ts2.get_terrain_color(0, 0)
	print("get_terrain_color(0, 0) → ", c)

	# 5. TileSetAtlasSource + get_tile_data
	print("\n--- TileSetAtlasSource ---")
	var src: TileSetAtlasSource = TileSetAtlasSource.new()
	src.texture_region_size = Vector2i(64, 64)
	print("texture_region_size = Vector2i(64, 64) ✓")

	if FileAccess.file_exists("res://assets/placeholders/placeholder_board_bg.png"):
		src.texture = load("res://assets/placeholders/placeholder_board_bg.png")
		print("texture loaded ✓")
	else:
		print("texture NOT found (OK for probe)")

	src.create_tile(Vector2i(0, 0))
	print("create_tile(Vector2i(0, 0)) ✓")

	# 6. TileData - 检查 terrain 属性
	print("\n--- TileData terrain 属性 ---")
	var td: TileData = src.get_tile_data(Vector2i(0, 0), 0)
	if td:
		print("td class: ", td.get_class())
		# 检查 TileData 可用属性
		var td_methods := td.get_method_list()
		for m in td_methods:
			var mn: String = m.name
			if "terrain" in mn.to_lower() or "prob" in mn.to_lower():
				print("  terrain/prob method: ", mn)
		# 尝试 set/get terrain_set 和 terrain
		td.set("terrain_set", 0)
		print("  set terrain_set=0 ✓ val=", td.get("terrain_set"))
		td.set("terrain", 0)
		print("  set terrain=0 ✓ val=", td.get("terrain"))
	else:
		print("  td is null!")

	# 7. add_source + 保存
	print("\n--- add_source + 保存 ---")
	ts2.add_source(src, 0)
	print("add_source(src, 0) ✓")
	print("get_source_count()=", ts2.get_source_count())

	DirAccess.make_dir_recursive_absolute("res://assets/tilesets/")
	var save_result: int = ResourceSaver.save(ts2, "res://assets/tilesets/probe_tileset.tres")
	print("ResourceSaver.save() → result=", save_result, " (OK=0)")

	# 8. 验证加载
	print("\n--- 验证加载 ---")
	var ts3: TileSet = load("res://assets/tilesets/probe_tileset.tres") as TileSet
	if ts3:
		print("加载成功: source_count=", ts3.get_source_count(), " tile_size=", ts3.tile_size)
		var src3 = ts3.get_source(0)
		if src3:
			print("  source 0 class: ", src3.get_class())
	else:
		print("加载失败!")

	print("\n=== 探测完成 ===")
	quit(0)
