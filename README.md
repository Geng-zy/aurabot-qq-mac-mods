# AuraBot 模块库

AuraBot for macOS 的独立模块库，当前面向 AuraBot `1.5.10`、扩展接口 `v1`、DSH `0.2.2-rc.3` 或更新版本。

这个库不是上游 `dsh-aurabot-qq-mods` 的镜像，也不复用上游模块。这里的模块必须按本分支当前的 `api`、心智接口和面板约定重新编写或审核。

## 目录

```text
modules/<id>/       模块源码
docs/MODULE_SPEC.md 模块清单规范
scripts/pack.mjs    打包并生成 registry/index.json
registry/index.json 面板读取的索引
```

## 模块要求

- 入口 `index.mjs`，`module.json` 里的 `id`、`version`、`api` 必须和入口一致。
- 只用 AuraBot 公开的 `api.*`，不要 import 插件 `src/` 内部路径。
- 需要联网、读写文件、启动程序、动态执行代码或使用插件内部接口时，必须在 `module.json` 的 `capabilities` 里声明。
- 模块和插件在同一进程运行；能力声明不是沙箱。
- 需要长期行动的模块，交给她自己的心智核心 `api.mind.offer`，不要用定时器替她做决定。

## 发布

```bash
node scripts/pack.mjs
```

生成 `dist/<id>-<version>.zip`，并更新 `registry/index.json`。把 ZIP 作为 GitHub Release 附件发布，再提交索引。

面板读取：

```text
https://raw.githubusercontent.com/Geng-zy/aurabot-qq-mac-mods/registry/index.json
```

## 参考

- [AuraBot 主仓库](https://github.com/Geng-zy/aurabot-qq-mac)
- [模块编写教程](https://github.com/Geng-zy/aurabot-qq-mac/blob/main/docs/MODULE-TUTORIAL.md)
- [扩展接口](https://github.com/Geng-zy/aurabot-qq-mac/blob/main/src/modules/API.md)
