# 刷热榜（tophub）

> 这是 [aurabot-qq-mac](https://github.com/Geng-zy/aurabot-qq-mac) 用的版本：从 [aureth-labs/dsh-aurabot-qq-mods](https://github.com/aureth-labs/dsh-aurabot-qq-mods) 里 RookieApe-tao 写的 tophub 0.3.1 改来，改成配合心智核心（什么时候逛由她自己决定、看过的记成她的经历）。原作者的许可和版权声明保留在 `LICENSE`。

让她自己「逛」全网热榜：闲着、无聊了、好奇了就去（**什么时候去由心智核心里她自己的动力决定**，睡着时不逛），像刷 B 站一样看榜、有感想，把主人可能感兴趣的热点私聊分享过来，**每轮逛完都记成她的经历**（之后聊天里能自然接上相关话题）。**纯读**——不评论、不发帖、不需要任何登录。

面板在「平台」组，自带简介卡、手动逛一轮、**巡游记录**（最近 50 轮：逛了哪些榜、当天热点、她的感受、分享了什么）。

## 用法

- 她想逛才逛（0.4.0 起交给心智核心：`api.mind.offer`），两场之间至少隔「两场至少隔」设的小时数；心智核心没起来时才退回按时刻逛（默认每天 `09:30` 和 `21:00`）。分享只发主人私聊，防刷屏有每场限量；同一条不会分享两次。
- 聊天里对鱼说「看看微博热搜」「今天有什么热点」→ 她用 `tophub_hot` 工具看榜；说「XX 今天热吗」→ `tophub_search` 搜全榜。
- 面板里可改两场间隔、要逛的榜、每场逛几个、分享上限；`/run` 手动逛一轮，`/state` 看状态，`/history` 看记录。

## 记忆与记录

- **记忆**：每轮逛完必定用 `api.mind.experience` 写一条她的经历（逛了哪些榜 + 当天热点 + 她的感受），不依赖模型是否给出 `remember` 字段——模型这轮被限流/超时也照样记，因为榜是真拉到了；想主人喜欢什么用 `api.mind.recall` 查她自己的记忆；
- **记录**：`<数据目录>/state.json` 里的 `history`，面板「巡游记录」直接翻，只留最近 50 轮。

## 给其他模块当基础控件

```js
const tophub = api.use('tophub')
await tophub.hot('微博热搜')    // → { ok, source, items: [{ title, url, hot }] }
await tophub.search('某关键词')  // → { ok, hits: [{ node, title, url }] }
tophub.nodes()                  // → 内置榜单目录
await tophub.tour()             // → 手动逛一轮
tophub.history()                // → 巡游记录
```

只依赖这层 API，不要 import 模块内部文件。

## 数据来源与限制

- 一级：直连 [tophub.today](https://tophub.today/) 节点页（站点对脚本访问有 WAF，失败是常态）；
- 二级兜底：[60s 聚合接口](https://github.com/vikiboss/60s)（viki 镜像，`60s-api.viki.moe`），榜单端点给数组、「60秒读懂世界」给 `data.news` 结构，两种都认；
- 结果缓存 30 分钟（存模块数据目录 `cache/`），全局限速 + 单节点失败冷却 10 分钟；
- 个别榜取不到会自动换替补（多备 3 个候选），不会整轮报废。

会访问的网址：`tophub.today`、`60s-api.viki.moe`。

## 本模块不做什么

不登录任何账号、不发言/评论/点赞、不收集或外传任何用户数据（分享只经本机插件发往主人自己的 QQ 私聊）。

## 许可

MIT。代码结构参考了本仓库内置模块 `bili` 的巡游模式（同仓库许可）。

