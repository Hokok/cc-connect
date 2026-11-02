# CC Connect 桌面壳 (Tauri)

把 `cc-connect` 二进制作为 sidecar 内嵌进 Tauri 2 桌面应用:

- 启动时拉起引擎(`cc-connect --config <app数据目录>/config.toml --force`),配置不存在则由壳写入合法的默认配置(acp 占位 agent + cloud_web 占位平台 + management 启用)
- 引擎 web UI 就绪后,主窗口打开 `http://127.0.0.1:{management.port}/login?token={management.token}`
- 菜单栏 "Config Editor / 配置编辑" 打开配置编辑窗口:
  - **连接的 Agent CLI 选择器**:选 Claude Code / Codex / Gemini / Cursor 等 13 种 CLI,`check_cli` 显示是否在 PATH 找到,应用后用 `toml_edit` 原位改 first project 的 agent(保留注释格式)并重启引擎
  - 原生 TOML 文本编辑:保存前用 `toml` crate 校验,坏 TOML 直接报行号不落盘;保存后可一键重启服务
- 退出清理:窗口关闭/菜单退出/atexit reaper 均会 kill 引擎;SIGKILL 场景靠引擎 `--force` per-config 锁在下一次启动时收割孤儿进程

## 构建

```bash
# 需要 rust (cargo) 和 pnpm
make app       # 产出 .dmg / .app,位于 desktop/src-tauri/target/release/bundle/
make app-dev   # 开发模式
```

`make build` 的产物(默认全部 agent/platform 插件、内嵌 web UI)会被拷到
`desktop/src-tauri/binaries/cc-connect-<target-triple>` (Tauri externalBin 约定)。

其他平台打包:在对应系统上运行 `make app`(Windows 需编辑
`tauri.conf.json` 的 bundle targets 为 `["app","msi"]`,Linux 用 `["app","deb"]`;
默认配置里 acp 占位 `cmd = "/usr/bin/true"` 也要按平台换)。

## 注意

- GUI 进程 PATH 不含 homebrew/nvm 用户 rc 注入的目录,壳启动与 CLI 检测均通过 `/bin/zsh -lc` 取用户真实 PATH
- 引擎日志写应用数据目录 `engine.log`(追加,不自动轮转,shortcut)
- 版本号 `tauri.conf.json` 与 root `Makefile` VERSION 需手动同步(shortcut)
- 引擎 CLI 缺失时会启动失败,编辑窗口初载会带出错误 banner;可点"应用并重启"换已安装的 CLI 或手填绝对路径
