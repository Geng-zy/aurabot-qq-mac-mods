// 每天检查原作者的同名模块有没有新版（GitHub Actions 里跑，也能本地跑）。
//
// 对每个带 upstream.json 的模块：原作者的版本比 upstream.json 里记的新、而且这个版本还没通知过，就——
//   1. 下载原作者的旧版（我们当初改的那一版）和新版，核对 sha256；
//   2. 三方合并（底：原作者旧版；一边：我们的版本；一边：原作者新版），合好的放进 handoff/merged/<id>-v<新版>/；
//   3. 扫一遍心智核心下失效的写法；
//   4. 按 handoff/TEMPLATE.md 填好交接文档，存到 handoff/reports/<id>-v<新版>.md；
//   5. 更新模板：把这次的经验累积进「以前跟进时的经验」，心智核心接口换成插件仓库里最新的；
//   6. 提交、推送，开一个 issue（正文就是交接文档，@ 你，GitHub 会发邮件）。
// 没有新版就什么都不做、不通知。很久没有提交时只悄悄更新一下 handoff/state.json，免得 GitHub 停掉定时任务。
//
// 环境变量：
//   GITHUB_TOKEN、GITHUB_REPOSITORY  开 issue 用（Actions 里自动有）
//   NOTIFY_USER                       issue 里 @ 谁（默认 Geng-zy）
//   DRY_RUN=1                         只生成文件、打印，不提交、不推送、不开 issue
//   UPSTREAM_REGISTRY                 测试用：换掉原作者的索引地址（可以是 file:// 路径）
//   PLUGIN_API_URL                    测试用：换掉插件仓库 API.md 的地址（可以是 file://；设成 off 就不刷新）

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { inflateRawSync, crc32 } from 'node:zlib'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const DRY = process.env.DRY_RUN === '1'
const NOTIFY = process.env.NOTIFY_USER || 'Geng-zy'
const REPO = process.env.GITHUB_REPOSITORY || 'Geng-zy/aurabot-qq-mac-mods'
const PLUGIN_API = process.env.PLUGIN_API_URL || 'https://raw.githubusercontent.com/Geng-zy/aurabot-qq-mac/main/src/modules/API.md'
const ISSUE_MAX = 60000 // issue 正文上限是 65536 字符，留点余量
const KEEPALIVE_DAYS = 45 // GitHub 对 60 天没有提交的仓库会停掉定时任务
const STATE = join(ROOT, 'handoff', 'state.json')
const TEMPLATE = join(ROOT, 'handoff', 'TEMPLATE.md')

/** 失效写法：心智核心下不再起作用的旧接口。 */
const PATTERNS = [
  { re: /api\.(lazy|use)\(\s*['"]memory['"]\s*\)/, what: '用了旧的记忆模块（已经删了）', fix: '查记忆用 `await api.mind.recall(...)`，记经历用 `api.mind.experience(...)`' },
  { re: /\bmemory\??\.(add|recall|remember|search)\s*\??\.?\(/, what: '往旧的记忆模块里写 / 查', fix: '改成 `api.mind.experience` / `api.mind.recall`' },
  { re: /api\.(lazy|use)\(\s*['"]mood['"]\s*\)|\bmood\??\.(nudge|set|value)\b/, what: '用了旧的心情模块（已经删了）', fix: '心情在心智核心里，模块不能改；做事的感受写在 `experience` 的 `emotion` 里' },
  { re: /api\.(lazy|use)\(\s*['"](speakup|purpose)['"]\s*\)|\bspeakUp\b/, what: '用了旧的主动搭话 / 目的引擎（已经删了）', fix: '想让她主动做事，用 `api.mind.offer` 交给她' },
  { re: /api\.every\(/, what: '定时任务：如果是在替她决定什么时候去做事（逛、刷、写），要改', fix: '她自己会做的事用 `api.mind.offer`；查回复、清缓存这类后台活可以留着 `api.every`' },
  { re: /api\.proactive\b/, what: '用了 api.proactive（原项目的出站账本，这个分叉没有）', fix: '直接 `api.sendText`，或者交给她（`api.mind.offer`）' },
]

const log = (...a) => console.log(...a)
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return d } }
const cmpVer = (a, b) => {
  const x = String(a).split('-')[0].split('.').map(Number)
  const y = String(b).split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1
  return 0
}
const bumpPatch = (v) => { const [a, b, c] = String(v).split('.').map(Number); return `${a}.${b}.${(c || 0) + 1}` }

async function get(url, as = 'text') {
  if (url.startsWith('file://')) { const b = readFileSync(fileURLToPath(url)); return as === 'buffer' ? b : b.toString('utf8') }
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return as === 'buffer' ? Buffer.from(await r.arrayBuffer()) : r.text()
}

/** 解开 zip（只要 stored / deflate）。 */
function unzip(buf) {
  let end = -1
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('不是有效的 zip')
  const files = new Map()
  let p = buf.readUInt32LE(end + 16)
  for (let i = 0, n = buf.readUInt16LE(end + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10); const crc = buf.readUInt32LE(p + 16); const packed = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28); const extraLen = buf.readUInt16LE(p + 30); const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42); const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    if (name.split('/').some((s) => !s || s === '..') || name.startsWith('/')) throw new Error('zip 里有不安全的路径：' + name)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + packed)
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw)
    if (crc32(data) !== crc) throw new Error('zip 校验失败：' + name)
    files.set(name, data)
  }
  return files
}

function readDir(dir, skip = new Set()) {
  const out = new Map()
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const p = join(d, name)
      const rel = relative(dir, p).split(sep).join('/')
      if (skip.has(rel)) continue
      if (statSync(p).isDirectory()) walk(p)
      else out.set(rel, readFileSync(p))
    }
  }
  walk(dir)
  return out
}
function writeDir(dir, files) {
  for (const [name, data] of files) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), data)
  }
}

/** 两个文件夹的差异（git diff --no-index），路径换成好读的。 */
function diffDirs(a, b, la, lb) {
  let out = ''
  try {
    out = execFileSync('git', ['diff', '--no-index', '--no-color', '-U3', a, b], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    out = String(error.stdout || '') // 有差异时 git diff 退出码是 1
  }
  const rel = (x) => x.replace(/\\/g, '/').replace(/^\//, '')
  return out.split(rel(a)).join(la).split(rel(b)).join(lb)
}
function stat(a, b) {
  try { return execFileSync('git', ['diff', '--no-index', '--stat=120', a, b], { encoding: 'utf8' }) } catch (error) { return String(error.stdout || '') }
}
/** 只取冲突那几段（前后各带几行），整个文件太长。 */
function conflictHunks(text, ctx = 8) {
  const lines = String(text).split('\n')
  const keep = new Set()
  lines.forEach((l, i) => {
    if (!l.startsWith('<<<<<<< ')) return
    let j = i
    while (j < lines.length && !lines[j].startsWith('>>>>>>> ')) j++
    for (let k = Math.max(0, i - ctx); k <= Math.min(lines.length - 1, j + ctx); k++) keep.add(k)
  })
  const out = []
  let last = -2
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i !== last + 1) out.push(`…（第 ${i + 1} 行）`)
    out.push(lines[i])
    last = i
  }
  return out.join('\n')
}
const fence = (s, lang = 'diff') => '```' + lang + '\n' + String(s).replace(/```/g, '``​`') + (String(s).endsWith('\n') ? '' : '\n') + '```'

/** 三方合并：返回合并后的文件和冲突列表。 */
function merge3(base, ours, theirs, tmp) {
  const merged = new Map()
  const conflicts = []
  const notes = []
  const names = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])
  const same = (x, y) => x && y && Buffer.compare(x, y) === 0
  for (const name of [...names].sort()) {
    const B = base.get(name); const O = ours.get(name); const T = theirs.get(name)
    if (!B) {
      if (O && T && !same(O, T)) { conflicts.push({ name, why: '两边都新加了这个文件，内容不一样' }); merged.set(name, O); continue }
      merged.set(name, O || T)
      if (T && !O) notes.push(`\`${name}\`：原作者新加的文件，照搬`)
      continue
    }
    if (!T) {
      if (!O) continue
      if (same(O, B)) { notes.push(`\`${name}\`：原作者删了，我们没改过，跟着删`); continue }
      conflicts.push({ name, why: '原作者删了这个文件，但我们改过它（先留着我们的）' })
      merged.set(name, O)
      continue
    }
    if (!O) { if (!same(T, B)) conflicts.push({ name, why: '我们删了这个文件，但原作者改了它（先不加回来）' }); continue }
    if (same(T, B)) { merged.set(name, O); continue }
    if (same(O, B)) { merged.set(name, T); notes.push(`\`${name}\`：只有原作者改了，用原作者的`); continue }
    if (name === 'module.json') {
      // 清单按字段合：版本号、描述、作者以我们的为准（版本号后面会改成下一版），其余原作者改了就用原作者的
      try {
        const [jb, jo, jt] = [B, O, T].map((x) => JSON.parse(String(x)))
        const out = { ...jo }
        const clash = []
        for (const k of new Set([...Object.keys(jb), ...Object.keys(jo), ...Object.keys(jt)])) {
          const vb = JSON.stringify(jb[k]); const vo = JSON.stringify(jo[k]); const vt = JSON.stringify(jt[k])
          if (vt === vb || vt === vo) continue
          if (vo === vb) { if (jt[k] === undefined) delete out[k]; else out[k] = jt[k]; continue }
          if (['version', 'description', 'author'].includes(k)) continue
          clash.push(k)
        }
        merged.set(name, Buffer.from(JSON.stringify(out, null, 2) + '\n'))
        if (clash.length) conflicts.push({ name, why: `这几项两边都改了、改得不一样（先留着我们的）：${clash.join('、')}。原作者的是 ${clash.map((k) => `${k}=${JSON.stringify(jt[k])}`).join('，')}` })
        else notes.push(`\`${name}\`：按字段合好了（版本号、描述、作者用我们的，其余跟原作者）`)
        continue
      } catch {}
    }
    const fo = join(tmp, 'o'); const fb = join(tmp, 'b'); const ft = join(tmp, 't')
    writeFileSync(fo, O); writeFileSync(fb, B); writeFileSync(ft, T)
    let text
    let n = 0
    try {
      text = execFileSync('git', ['merge-file', '-p', '-L', '我们的版本', '-L', '原作者旧版', '-L', '原作者新版', fo, fb, ft], { maxBuffer: 64 * 1024 * 1024 })
    } catch (error) {
      if (typeof error.status !== 'number' || error.status < 0) throw error
      n = error.status
      text = error.stdout
    }
    merged.set(name, text)
    if (n > 0) conflicts.push({ name, why: `两边都改了同一处，${n} 处冲突（文件里有 <<<<<<< 标记）`, text: String(text) })
    else notes.push(`\`${name}\`：两边都改了，但改的地方不重叠，自动合好了`)
  }
  return { merged, conflicts, notes }
}

function scan(files) {
  const hits = []
  for (const [name, data] of files) {
    if (!/\.(m?js|cjs)$/.test(name)) continue
    String(data).split('\n').forEach((line, i) => {
      for (const p of PATTERNS) if (p.re.test(line)) hits.push({ name, line: i + 1, code: line.trim().slice(0, 160), what: p.what, fix: p.fix })
    })
  }
  return hits
}

function fill(template, vars) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
function replaceBlock(text, title, body) {
  const a = `<!-- 自动更新：${title} 开始 -->`
  const b = `<!-- 自动更新：${title} 结束 -->`
  const i = text.indexOf(a); const j = text.indexOf(b)
  if (i < 0 || j < i) return text
  return text.slice(0, i + a.length) + '\n' + body.trim() + '\n' + text.slice(j)
}

/** 模板「以前跟进时的经验」：每次检查到更新都按记录重新整理一遍。 */
function learnedText(updates) {
  if (!updates.length) return '（还没有跟进过。）'
  const lines = []
  const byFile = new Map(); const byPattern = new Map()
  for (const u of updates) {
    for (const f of u.conflicts) byFile.set(`${u.id}/${f}`, (byFile.get(`${u.id}/${f}`) || 0) + 1)
    for (const p of u.patterns) byPattern.set(p, (byPattern.get(p) || 0) + 1)
  }
  lines.push(`- 一共检查到 ${updates.length} 次原作者更新，${updates.filter((u) => !u.conflicts.length).length} 次自动合并没有冲突。`)
  const ids = [...new Set(updates.map((u) => u.id))]
  for (const id of ids) {
    const us = updates.filter((u) => u.id === id).sort((a, b) => a.at.localeCompare(b.at))
    let gap = ''
    if (us.length >= 2) {
      const days = (Date.parse(us.at(-1).at) - Date.parse(us[0].at)) / 86400000 / (us.length - 1)
      gap = `，平均 ${Math.max(1, Math.round(days))} 天一次`
    }
    lines.push(`- \`${id}\`：${us.map((u) => `${u.from}→${u.to}（${u.at.slice(0, 10)}${u.conflicts.length ? `，${u.conflicts.length} 个文件冲突` : '，没冲突'}）`).join('、')}${gap}。`)
  }
  const hot = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (hot.length) lines.push(`- 常冲突的文件（先看这些）：${hot.map(([f, n]) => `\`${f}\`（${n} 次）`).join('、')}。我们在这些文件里改得多，原作者也常改，合并时要特别小心别把我们的心智核心改动丢了。`)
  const pats = [...byPattern].sort((a, b) => b[1] - a[1])
  if (pats.length) lines.push(`- 原作者的新版里出现过的失效写法：${pats.map(([p, n]) => `${p}（${n} 次）`).join('；')}。每次都要检查有没有混回来。`)
  return lines.join('\n')
}

/** 插件仓库 API.md 里最新的「心智核心」一节（拿不到就不动模板）。 */
async function latestMindApi() {
  if (PLUGIN_API === 'off') return ''
  try {
    const md = await get(PLUGIN_API)
    const i = md.indexOf('\n## 心智核心\n')
    if (i < 0) return ''
    const rest = md.slice(i + '\n## 心智核心\n'.length)
    const j = rest.search(/\n## /)
    return (j < 0 ? rest : rest.slice(0, j)).trim()
  } catch (error) {
    log('插件仓库的 API.md 没取到，接口说明先不动：', error.message)
    return ''
  }
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

async function openIssue(title, body) {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('没有 GITHUB_TOKEN，开不了 issue')
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
    body: JSON.stringify({ title, body }),
  })
  if (!r.ok) throw new Error(`开 issue 失败：HTTP ${r.status} ${await r.text()}`)
  return (await r.json()).html_url
}

async function main() {
  // 手动测试通知：只开一个标着「测试」的 issue，看邮件能不能收到；不检查、不提交
  if (process.env.TEST_NOTIFY === '1') {
    const doc = readFileSync(TEMPLATE, 'utf8')
    const url = await openIssue('测试：每日检查的通知（可以关掉）', `@${NOTIFY} 这是一封**测试**通知，不是原作者真的出了新版。收到这封邮件就说明：检查到更新时你会像这样收到邮件，正文是填好的交接文档。\n\n下面是交接文档模板的开头（真的通知里这些占位会填好）：\n\n---\n\n${doc.slice(0, doc.indexOf('## 三、'))}`)
    log('开了测试 issue：', url)
    return
  }
  const state = readJson(STATE, { notified: {}, updates: [], lastCommitAt: '' })
  state.notified ||= {}; state.updates ||= []
  const registries = new Map()
  const found = []
  const now = new Date().toISOString()

  for (const id of readdirSync(join(ROOT, 'modules')).sort()) {
    const dir = join(ROOT, 'modules', id)
    const up = readJson(join(dir, 'upstream.json'), null)
    if (!up) continue
    const url = process.env.UPSTREAM_REGISTRY || up.registry
    if (!registries.has(url)) {
      // 原作者的列表一时读不到（网络）：今天就算了，明天再查，不报错（报错 GitHub 会发「任务失败」的邮件）
      try { registries.set(url, JSON.parse(await get(url))) } catch (error) { log(`原作者的模块列表这次没读到，明天再查：${error.message}`); registries.set(url, null) }
    }
    if (!registries.get(url)) continue
    const reg = registries.get(url)
    const e = (reg.modules || []).find((m) => m.id === (up.id || id))
    if (!e) { log(`${id}：原作者的列表里没有它了（可能下架），这次不通知`); continue }
    if (cmpVer(e.version, up.version) <= 0) { log(`${id}：原作者还是 ${e.version}，没有新版`); continue }
    const key = `${id}@${e.version}`
    if (state.notified[key]) { log(`${id}：原作者的 ${e.version} 已经通知过了`); continue }
    found.push({ id, dir, up, e, reg })
  }

  if (!found.length) {
    log('没有检查到原作者的更新，不通知。')
    // 很久没提交：悄悄写一下检查时间，免得 GitHub 停掉定时任务
    const last = Date.parse(state.lastCommitAt || 0) || 0
    if (!DRY && Date.now() - last > KEEPALIVE_DAYS * 86400000) {
      state.lastCommitAt = now
      writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n')
      git('add', 'handoff/state.json')
      git('commit', '-q', '-m', '每日检查：记一下检查时间（保持定时任务不被 GitHub 停掉）')
      git('push', '-q')
      log('很久没提交了，记了一下检查时间。')
    }
    return
  }

  const template0 = readFileSync(TEMPLATE, 'utf8')
  const reports = []
  for (const { id, dir, up, e, reg } of found) {
    const tmp = mkdtempSync(join(tmpdir(), `check-${id}-`))
    try {
      const assets = String(reg.assetsBase || '')
      const baseUrl = up.zip || `${assets}${id}-v${up.version}/${id}-v${up.version}.zip`
      const baseBuf = await get(baseUrl, 'buffer')
      if (up.sha256 && sha256(baseBuf) !== up.sha256) throw new Error(`${id}：原作者旧版 ${up.version} 的安装包校验不对`)
      const newBuf = await get(assets + e.path, 'buffer')
      if (e.sha256 && sha256(newBuf) !== e.sha256) throw new Error(`${id}：原作者新版 ${e.version} 的安装包校验不对`)
      const base = unzip(baseBuf)
      const theirs = unzip(newBuf)
      const ours = readDir(dir, new Set(['upstream.json']))
      const oursVer = JSON.parse(String(ours.get('module.json') || '{}')).version || '0.0.0'
      const next = bumpPatch(oursVer)
      for (const [n, f] of [['base', base], ['theirs', theirs], ['ours', ours]]) writeDir(join(tmp, n), f)
      const { merged, conflicts, notes } = merge3(base, ours, theirs, tmp)
      const mergedDir = `handoff/merged/${id}-v${e.version}`
      rmSync(join(ROOT, mergedDir), { recursive: true, force: true })
      writeDir(join(ROOT, mergedDir), merged)
      // 合并结果里的 module.json：版本号先改成下一版，免得忘了
      if (merged.has('module.json') && !conflicts.some((c) => c.name === 'module.json')) {
        try {
          const m = JSON.parse(String(merged.get('module.json')))
          m.version = next
          writeFileSync(join(ROOT, mergedDir, 'module.json'), JSON.stringify(m, null, 2) + '\n')
        } catch {}
      }
      const upChanges = diffDirs(join(tmp, 'base'), join(tmp, 'theirs'), `原作者${up.version}`, `原作者${e.version}`)
      const ourChanges = diffDirs(join(tmp, 'base'), join(tmp, 'ours'), `原作者${up.version}`, `我们${oursVer}`)
      // 只报原作者这次新带进来的（旧版里就有、我们已经改掉的不算）
      const known = new Set(scan(base).map((h) => `${h.name}|${h.what}|${h.code}`))
      const hits = scan(theirs).filter((h) => !known.has(`${h.name}|${h.what}|${h.code}`))
      const mergedHits = scan(merged).filter((h) => !scan(ours).some((o) => o.code === h.code && o.what === h.what))
      const status = conflicts.length ? `${conflicts.length} 个文件有冲突，要人来改` : '没有冲突，自动合好了（还是要检查一遍）'
      const details = [
        notes.length ? notes.map((n) => '- ' + n).join('\n') : '',
        conflicts.length ? '**有冲突的文件：**\n' + conflicts.map((c) => `- \`${c.name}\`：${c.why}`).join('\n') : '',
        ...conflicts.filter((c) => c.text).map((c) => `\`${c.name}\` 里冲突的地方（\`<<<<<<< 我们的版本\` 到 \`=======\` 之间是我们的，\`=======\` 到 \`>>>>>>> 原作者新版\` 之间是原作者新版的；整个文件在合并结果的文件夹里）：\n\n${fence(conflictHunks(c.text), (c.name.split('.').pop() || '').replace(/^m?js$/, 'js'))}`),
      ].filter(Boolean).join('\n\n') || '两边都没改到同一个文件。'
      const scanText = [
        hits.length ? '原作者这次新带进来的：\n' + hits.map((h) => `- \`${h.name}:${h.line}\` ${h.what}。改法：${h.fix}\n  \`${h.code}\``).join('\n') : '原作者这次没有新带进来失效写法。',
        mergedHits.length ? '\n合并结果里新出现的（是原作者带进来的，要改掉）：\n' + mergedHits.map((h) => `- \`${h.name}:${h.line}\` ${h.what}`).join('\n') : '',
      ].join('\n')
      const name = JSON.parse(String(theirs.get('module.json') || ours.get('module.json') || '{}')).name || id
      const vars = {
        NAME: name, ID: id, GENERATED_AT: now, UPSTREAM_REPO: up.repo || 'aureth-labs/dsh-aurabot-qq-mods',
        BASE_VERSION: up.version, UPSTREAM_VERSION: e.version, OURS_VERSION: oursVer, NEXT_VERSION: next,
        UPSTREAM_SHA256: e.sha256 || '', UPSTREAM_COMMIT: e.commit || '', MERGE_STATUS: status, MERGED_DIR: mergedDir,
        UPSTREAM_CHANGES: '改了哪些文件：\n\n' + fence(stat(join(tmp, 'base'), join(tmp, 'theirs')) || '（没有改动）', 'text') + '\n\n完整改动：\n\n' + fence(upChanges || '（没有改动）'),
        OUR_CHANGES: '改了哪些文件：\n\n' + fence(stat(join(tmp, 'base'), join(tmp, 'ours')) || '（没有改动）', 'text') + '\n\n完整改动：\n\n' + fence(ourChanges || '（没有改动）'),
        MERGE_DETAILS: details, SCAN: scanText,
      }
      const doc = fill(template0, vars)
      const docPath = `handoff/reports/${id}-v${e.version}.md`
      mkdirSync(join(ROOT, 'handoff', 'reports'), { recursive: true })
      writeFileSync(join(ROOT, docPath), doc)
      state.updates.push({ id, from: up.version, to: e.version, at: now, conflicts: conflicts.map((c) => c.name), patterns: [...new Set(hits.map((h) => h.what))] })
      reports.push({ id, name, from: up.version, to: e.version, ours: oursVer, next, status, doc, docPath, key: `${id}@${e.version}` })
      log(`${id}：原作者 ${up.version} → ${e.version}，${status}；交接文档 ${docPath}`)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  // 模板跟着更新：经验累积、心智核心接口换成最新的
  let template = replaceBlock(template0, '经验', learnedText(state.updates))
  const api = await latestMindApi()
  if (api) template = replaceBlock(template, '心智核心接口', api)
  writeFileSync(TEMPLATE, template)

  if (DRY) {
    for (const r of reports) log(`（试运行）会开 issue：${r.name}（${r.id}）原作者出了 ${r.to}，正文 ${r.doc.length} 字`)
    writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n')
    return
  }

  for (const r of reports) state.notified[r.key] = { at: now }
  state.lastCommitAt = now
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n')
  git('add', 'handoff')
  git('commit', '-q', '-m', `原作者更新：${reports.map((r) => `${r.id} ${r.from}→${r.to}`).join('、')}，生成交接文档`)
  git('push', '-q')

  for (const r of reports) {
    const link = `https://github.com/${REPO}/blob/main/${encodeURI(r.docPath)}`
    const head = `@${NOTIFY} 原作者的「${r.name}」（\`${r.id}\`）从 ${r.from} 升到了 ${r.to}。我们的版本是 ${r.ours}，跟进后发 ${r.next}。自动合并：${r.status}。\n\n下面是交接文档，可以整份交给 AI 去改（仓库里也有一份：[${r.docPath}](${link})）。\n\n---\n\n`
    const body = head.length + r.doc.length <= ISSUE_MAX
      ? head + r.doc
      : head + r.doc.slice(0, r.doc.indexOf('## 四、')) + `\n\n**文档太长，后面的（原作者的完整改动、我们的改动、合并细节、检查结果）在仓库里：[${r.docPath}](${link})**\n`
    const url = await openIssue(`原作者的「${r.name}」（${r.id}）出了 ${r.to}：交接文档`, body)
    log('开了 issue：', url)
  }
}

main().catch((error) => {
  console.error('检查失败：', error.message)
  process.exit(1)
})
