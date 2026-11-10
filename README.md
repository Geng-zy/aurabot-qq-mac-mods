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

## 每天检查原作者的更新

`.github/workflows/check-upstream.yml` 每天北京时间 9 点多跑一次 `scripts/check-upstream.mjs`：

- 每个模块文件夹里的 `upstream.json` 记着它改自原作者的哪一版。原作者出了更新的版本，就：
  1. 下载原作者的旧版和新版（核对 sha256），和我们的版本做三方合并，结果放在 `handoff/merged/<id>-v<原作者新版>/`（`module.json` 按字段合，版本号先改成我们的下一版）；
  2. 检查原作者这次有没有新带进来心智核心下失效的写法（旧记忆模块、旧心情模块、主动搭话、用定时任务替她做事……）；
  3. 按 `handoff/TEMPLATE.md` 生成交接文档 `handoff/reports/<id>-v<原作者新版>.md`，可以整份交给 AI 去改；
  4. 模板跟着更新：把这次的情况累积进「以前跟进时的经验」（常冲突的文件、出现过的失效写法、原作者多久更新一次），心智核心接口换成插件仓库里最新的；
  5. 提交，开一个 issue @ 维护者，正文就是交接文档（GitHub 会发邮件）。
- **没有新版就什么都不做、不通知。** 同一个新版只通知一次（记在 `handoff/state.json`）。
- 原作者的列表一时读不到就当没查，第二天再查，不报错。
- GitHub 会停掉 60 天没有提交的仓库的定时任务，所以 45 天没提交时会悄悄提交一次检查时间。
- 想马上查一次：仓库的 Actions 页 →「每天检查原作者的模块更新」→ Run workflow。

跟进完、发了新版以后，记得把 `modules/<id>/upstream.json` 改成跟进到的原作者版本（交接文档里写着）。

## 发一个新版本（维护用）

1. 改 `modules/<id>/`，在 `module.json` 里把版本号加上去。
2. `node scripts/pack.mjs`：打包到 `dist/<id>-v<版本>/<id>-v<版本>.zip`，生成 `dist/index.json`。
3. 用 `gh release create <id>-v<版本> dist/<id>-v<版本>/<id>-v<版本>.zip` 发 Release。
4. 把 `dist/index.json` 提交到 `registry` 分支（插件读的是 `https://raw.githubusercontent.com/Geng-zy/aurabot-qq-mac-mods/registry/index.json`）。

同一个版本号发出去以后不要再改包：插件按 sha256 核对，改了就装不上。要撤回某个版本，写进 `revoked.json` 再生成索引。
