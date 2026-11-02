# 配置采用「结构化 API + 文件编辑」两轨写回

Web UI 表单需要写回 config.toml，但 BurntSushi/toml 序列化会丢注释与格式；桌面壳的 TOML 编辑器已经直写文件。若新增整文件 PATCH 端点，两处 UI 会各自写同一文件且互相覆盖风险更高；若做注释保留的字段级文本替换，Go 侧实现复杂、边界 bug 多。

决定：配置写回分两轨，都落在同一个 config.toml（唯一真相源）：

1. **表单轨**：只走 Management API 结构化端点（settings/projects/providers 等已可写，缺的补齐），保存由引擎读文件→改字段→序列化回写，**接受该路径丢注释**；保存前做 mtime 冲突门控（文件晚于表单加载时间则拒绝并提示刷新）。
2. **文件轨**：整文件编辑只保留桌面壳的 TOML 编辑器（写前 TOML 校验，直接写文件），保留注释。

## Considered Options

- 整文件 PATCH API + Web UI TOML 编辑器：丢注释且两个 TOML 编辑入口重复，拒绝
- 注释保留的字段级文本写回：实现复杂度不成比例，拒绝

## Consequences

- 注释的文档价值由 `config.example.toml` 与 Web UI 表单提示承担，不在用户配置文件里维持
- 两轨并发修改由 mtime 门控拦截，不做内容级合并
