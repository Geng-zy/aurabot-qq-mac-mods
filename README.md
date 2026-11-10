# aurabot-qq-mac 的模块

[aurabot-qq-mac](https://github.com/Geng-zy/aurabot-qq-mac)（Aurabot 的 macOS 分叉，带心智核心）自己的模块库。

- 只有装了 aurabot-qq-mac 的人能在面板「模块市场」里看到这里的模块：插件同时读原项目的模块库（[aureth-labs/dsh-aurabot-qq-mods](https://github.com/aureth-labs/dsh-aurabot-qq-mods)）和这里。
- 这里有和原项目同 id 的模块时，aurabot-qq-mac 里显示这里的版本，原项目那份不显示。装好后检查更新也只看这里。
- 这里的模块都已经配合心智核心：她自己决定什么时候做事（`api.mind.offer`），做过、看过的记成她的经历（`api.mind.experience`）。

## 模块

| id | 名字 | 说明 | 来源 |
|---|---|---|---|
| `tophub` | 刷热榜 | 她闲着、好奇了自己去逛全网热榜，看完记成经历、挑有意思的私聊分享给主人 | 改自原项目里 RookieApe-tao 的 tophub 0.3.1（MIT） |

## 许可

每个模块用它自己文件夹里的 `LICENSE`（改自别人的模块保留原作者的版权声明）。仓库里其余的（脚本、说明）是 MIT，见 `LICENSE`。

## 发一个新版本（维护用）

1. 改 `modules/<id>/`，在 `module.json` 里把版本号加上去。
2. `node scripts/pack.mjs`：打包到 `dist/<id>-v<版本>/<id>-v<版本>.zip`，生成 `dist/index.json`。
3. 用 `gh release create <id>-v<版本> dist/<id>-v<版本>/<id>-v<版本>.zip` 发 Release。
4. 把 `dist/index.json` 提交到 `registry` 分支（插件读的是 `https://raw.githubusercontent.com/Geng-zy/aurabot-qq-mac-mods/registry/index.json`）。

同一个版本号发出去以后不要再改包：插件按 sha256 核对，改了就装不上。要撤回某个版本，写进 `revoked.json` 再生成索引。
