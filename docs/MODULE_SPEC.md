# 模块清单规范

`module.json` 必须和入口 `index.mjs` 在同一个模块目录。

```json
{
  "id": "weather",
  "name": "查天气",
  "version": "1.0.0",
  "description": "按城市查天气",
  "category": "tool",
  "tags": ["天气"],
  "author": "你的名字",
  "license": "MIT",
  "api": 1,
  "minPluginVersion": "1.5.10",
  "requires": [],
  "capabilities": ["network"]
}
```

- `id`：小写字母开头，只含小写字母、数字、`-`，2~40 字符。
- `api`：当前为 `1`。
- `category`：`platform`、`social`、`creative`、`desktop`、`manage`、`tool` 之一。
- `capabilities`：`network`、`filesystem`、`process`、`dynamic-code`、`plugin-config`、`plugin-internals`。
- `requires`：依赖的其他模块 id；面板安装前会检查。
- 发布后不能修改同一个版本，必须升 `version`。
