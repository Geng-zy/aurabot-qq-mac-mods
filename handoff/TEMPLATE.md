# 交接文档：把原作者的「{{NAME}}」新版跟进到 aurabot-qq-mac 的版本

> 这份文档是 `Geng-zy/aurabot-qq-mac-mods` 的每日检查自动生成的，可以整份交给任何一个 AI（或人）去改。
> 生成时间：{{GENERATED_AT}}

## 一、你要做的事

原作者（[{{UPSTREAM_REPO}}](https://github.com/{{UPSTREAM_REPO}})）的模块 `{{ID}}` 从 **{{BASE_VERSION}}** 升到了 **{{UPSTREAM_VERSION}}**。
我们的仓库（[Geng-zy/aurabot-qq-mac-mods](https://github.com/Geng-zy/aurabot-qq-mac-mods)）里有它的一个改版，现在是 **{{OURS_VERSION}}**，当初改自原作者的 {{BASE_VERSION}}。

请把原作者这次的改动并进我们的版本，同时**保留我们为心智核心做的改动**，然后发布新版本 **{{NEXT_VERSION}}**。

自动三方合并的结果：**{{MERGE_STATUS}}**。合好的（或带冲突标记的）文件已经放在仓库的 `{{MERGED_DIR}}/`，从那里开始改最省事。

## 二、仓库和发布方法

- 模块源码：`modules/{{ID}}/`；`modules/{{ID}}/upstream.json` 记着改自原作者的哪一版。
- 改完以后：
  1. 把 `{{MERGED_DIR}}/` 里改好的文件放回 `modules/{{ID}}/`（`upstream.json` 不在合并结果里，保留原来的）。
  2. `modules/{{ID}}/module.json` 的 `version` 改成 **{{NEXT_VERSION}}**。版本号只比 x.y.z，**必须比我们上一版 {{OURS_VERSION}} 大**，不要照抄原作者的版本号。
  3. `modules/{{ID}}/upstream.json` 的 `version`、`sha256`、`commit` 改成原作者 {{UPSTREAM_VERSION}} 的：sha256 `{{UPSTREAM_SHA256}}`，commit `{{UPSTREAM_COMMIT}}`。
  4. `node scripts/pack.mjs --check`，再 `node scripts/pack.mjs`。
  5. `gh release create {{ID}}-v{{NEXT_VERSION}} dist/{{ID}}-v{{NEXT_VERSION}}/{{ID}}-v{{NEXT_VERSION}}.zip`。
  6. 把 `dist/index.json` 提交到 `registry` 分支（插件读 `https://raw.githubusercontent.com/Geng-zy/aurabot-qq-mac-mods/registry/index.json`）。
  7. 把 `{{MERGED_DIR}}/` 和这份文档留在仓库里当记录就行，不用删。
- 同一个版本号发出去以后不能再改安装包（插件按 sha256 核对）。

## 三、规矩（必须遵守）

- 用中文写说明和注释。
- **这个模块跑在带心智核心的插件里**：她只有一个心智，记忆、情绪、性格都在心智核心里。
  - 她自己会去做的事（逛、刷、写……）**不要用 `api.every` 定时替她做**，用 `api.mind.offer` 交给她，由她决定什么时候做；睡着时不做（`available()` 里判断 `api.mind.awake()`）。
  - 她做过、看过的事用 `api.mind.experience` 记成她的经历；想查她记得的事用 `await api.mind.recall(...)`。
  - **不要**再用旧的记忆模块、心情模块、主动搭话：`api.lazy('memory')`、`api.use('memory')`、`memory.add`、`memory.recall`、`api.use('mood')`、`speakup` 这类在心智核心下已经失效（不会报错，但什么也不做）。
  - 没有心智核心时（`api.mind` 是 `null`）要能退回原来的做法，别报错。
- 保留原作者的 `LICENSE` 和版权声明；`module.json` 的 `author` 保留原作者，注明是我们改的。
- 不要写死某个角色的名字、设定；模块是通用的。
- 要扔掉的文件移到废纸篓，不要直接删。
- 改完要真的跑一遍（至少 `node scripts/pack.mjs --check`，能的话用假的 `api` 跑一遍 `setup` 和主要流程）。

## 四、原作者这次改了什么（{{BASE_VERSION}} → {{UPSTREAM_VERSION}}）

{{UPSTREAM_CHANGES}}

## 五、我们的版本当初改了什么（原作者 {{BASE_VERSION}} → 我们 {{OURS_VERSION}}）

{{OUR_CHANGES}}

## 六、自动合并的结果

{{MERGE_DETAILS}}

## 七、检查：新版里有没有心智核心下失效的写法

{{SCAN}}

## 八、心智核心给模块的接口（`api.mind`）

<!-- 自动更新：心智核心接口 开始 -->
她只有一个心智：记忆、情绪、性格都在心智核心里（`src/mind/`），不在任何模块里。模块**不能**替她做决定、不能改她的人格、不能自己另存一份她的记忆；
模块能做的只有两件事：把她做过、看过的事告诉心智核心，和查她记得的事。都通过 `api.mind`：

| | |
|---|---|
| `api.mind.experience({ text, kind, about, importance, tags, meta, chatId, emotion, effort })` | 她经历了一件事（看了视频、唱了歌、发了空间……）。`emotion` 是她做这件事时的感受 `{ name, intensity }`（名字用常见说法，比如 满足、开心、无聊）；`effort` 是花了她多少精力（0～0.3，唱一首歌大约 0.05）。`kind`：`'event'` 做过的事（默认）、`'seen'` 看过的内容、`'own-post'` 她自己发出去的东西。`about` 是 QQ 号；`meta` 放 `{ title, author, url, platform, id }` 这类出处；`importance` 0～1。记多牢、以后想不想得起来，由心智核心按她当时的状态决定 |
| `await api.mind.recall(线索, { limit })` | 查她记得的事：`[{ at, text, level, kind }]`。`level` 是想起来的清楚程度：`clear` 清楚、`vague` 只记得大概、`tip` 话到嘴边只想起一半。她忘了的就是忘了，查不到 |
| `api.mind.recent({ hours, tag, limit })` | 最近她做过、看过的事，可以按 `tags` 里的标签筛 |
| `api.mind.now()` | 她现在的时间（按她的时区） |
| `api.mind.awake()` | 她醒着没有。睡着时模块别替她做事、别替她看消息 |
| `api.mind.offer({ id, label, needs, effort, delayHours, cooldownMinutes, payoff, keywords, available, run })` | 把一件她能做的事交给她，**由她自己决定什么时候做**（模块不再自己定时去做）。`needs` 是这件事满足哪些基本需要（`fun` 新鲜和乐趣、`curiosity` 好奇、`beauty` 美、`companion` 陪伴、`recognition` 被认可、`meaning` 意义……），0～1；`effort` 多费力（0～1）；`delayHours` 回报要等多久；`available()` 返回 `true` 或者做不了的原因（面板里的开关、每天上限照旧在这里判断）；`run()` 返回 `{ ok, summary, outcome }`，`outcome` 0～1 是她做完有多满意，她会按它学下次还想不想做。模块停了，交出去的事自动撤掉 |
| `api.mind.granted(名字)` | 主人有没有批准她这项权限。她通过 QQ 私聊向主人申请，只有主人本人在私聊里说「同意 #编号」才算 |

看见的内容（`seen`）只是她看过，不是作者对她说的话。真实聊天平台上和人的对话不要用 `experience`，那是她的感知，由聊天中枢交给心智核心。

聊天中枢需要的时候会去找 `stickers`（发表情、偷表情）、`voice`（发语音）。心情、精力、困、饿都在心智核心里，模块不能改，只能通过 `experience` 告诉心智核心她做了什么、花了多少力气。
<!-- 自动更新：心智核心接口 结束 -->

## 九、以前跟进时的经验（每次检查到更新时自动累积）

<!-- 自动更新：经验 开始 -->
（还没有跟进过。）
<!-- 自动更新：经验 结束 -->

## 十、改完前的检查清单

- [ ] 原作者这次的新功能、修的问题都并进来了（对照第四节一条条看）。
- [ ] 我们的改动都还在：什么时候做事交给 `api.mind.offer`、记经历用 `api.mind.experience`、查记忆用 `api.mind.recall`、睡着时不做、没有心智核心时能退回。
- [ ] 第七节列出的失效写法都改掉了。
- [ ] 没有冲突标记（`<<<<<<<`、`=======`、`>>>>>>>`）残留。
- [ ] `module.json` 版本号是 {{NEXT_VERSION}}，`upstream.json` 改成了原作者 {{UPSTREAM_VERSION}}。
- [ ] `node scripts/pack.mjs --check` 通过，真的跑过一遍。
- [ ] 发了 Release，更新了 `registry` 分支的 `index.json`。
