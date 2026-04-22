extends SceneTree

func _init() -> void:
	print("=== ARGV 探测 v2 ===")
	print("OS.get_cmdline_args():")
	for a in OS.get_cmdline_args():
		print("  '", a, "'")
	print("---get_cmdline_user_args():")
	for a in OS.get_cmdline_user_args():
		print("  '", a, "'")
	print("=== 探测完成 ===")
	quit(0)
