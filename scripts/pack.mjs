// 打包：modules/<id>/ → dist/<id>-v<版本>/<id>-v<版本>.zip，再生成 dist/index.json（模块索引）。
// 索引格式和 aurabot 插件读的一致（schema 1）：插件按 assetsBase + path 下载，核对 sha256 后安装。
// zip 是确定的：文件按路径排序、时间统一写 1980-01-01，同样的源码每次打出同样的包、同样的 sha256。
//
// 用法：node scripts/pack.mjs        只打包、生成索引
//       node scripts/pack.mjs --check 只检查（模块清单、入口文件），不写文件

import { createHash } from 'node:crypto'
import { deflateRawSync, crc32 } from 'node:zlib'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const REPO = 'Geng-zy/aurabot-qq-mac-mods'
const ASSETS = `https://github.com/${REPO}/releases/download/`
const ID_RE = /^[a-z][a-z0-9-]{1,39}$/
const VER_RE = /^\d+\.\d+\.\d+$/
const check = process.argv.includes('--check')

/** 模块文件夹里要打包的文件（点开头的、node_modules 不要）。 */
function filesOf(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(dir, p).split(sep).join('/'))
    }
  }
  walk(dir)
  return out
}

/** 最朴素的 zip：每个文件 deflate，时间固定。 */
function zip(dir, names) {
  const DATE = (0 << 9) | (1 << 5) | 1 // 1980-01-01
  const local = []
  const central = []
  let offset = 0
  for (const name of names) {
    const data = readFileSync(join(dir, name))
    const comp = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const nameBuf = Buffer.from(name, 'utf8')
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8)
    h.writeUInt16LE(0, 10); h.writeUInt16LE(DATE, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18)
    h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28)
    local.push(h, nameBuf, comp)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10)
    c.writeUInt16LE(0, 12); c.writeUInt16LE(DATE, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36)
    c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42)
    central.push(c, nameBuf)
    offset += 30 + nameBuf.length + comp.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, cd, end])
}

const modules = []
const problems = []
for (const id of readdirSync(join(ROOT, 'modules')).sort()) {
  const dir = join(ROOT, 'modules', id)
  if (!statSync(dir).isDirectory()) continue
  const m = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8'))
  if (m.id !== id || !ID_RE.test(id)) problems.push(`${id}：module.json 里的 id 要和文件夹名一样，只能是小写字母、数字和 -`)
  if (!VER_RE.test(String(m.version))) problems.push(`${id}：版本号要是 x.y.z`)
  if (!existsSync(join(dir, 'index.mjs')) && !existsSync(join(dir, 'index.js'))) problems.push(`${id}：没有入口文件 index.mjs`)
  if (!existsSync(join(dir, 'LICENSE'))) problems.push(`${id}：没有 LICENSE`)
  const names = filesOf(dir)
  if (!names.includes('module.json')) problems.push(`${id}：没有 module.json`)
  modules.push({ id, dir, m, names })
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
if (check) {
  console.log(`检查通过：${modules.map((x) => `${x.id} ${x.m.version}`).join('、')}`)
  process.exit(0)
}

const revoked = existsSync(join(ROOT, 'revoked.json')) ? JSON.parse(readFileSync(join(ROOT, 'revoked.json'), 'utf8')) : []
const entries = []
for (const { id, dir, m, names } of modules) {
  const tag = `${id}-v${m.version}`
  const file = `${tag}.zip`
  const buf = zip(dir, names)
  mkdirSync(join(ROOT, 'dist', tag), { recursive: true })
  writeFileSync(join(ROOT, 'dist', tag, file), buf)
  entries.push({
    id, name: m.name, version: m.version, description: m.description || '', category: m.category || '', tags: m.tags || [],
    author: m.author || '', license: m.license || '', api: m.api ?? 1, minPluginVersion: m.minPluginVersion || '',
    requires: m.requires || [], capabilities: m.capabilities || [], replacesBuiltin: false,
    tag, file, path: `${tag}/${file}`, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
  })
  console.log(`${tag}  ${buf.length} 字节  ${entries.at(-1).sha256}`)
}
const index = { schema: 1, assetsBase: ASSETS, modules: entries, revoked, generatedAt: new Date().toISOString() }
writeFileSync(join(ROOT, 'dist', 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log('写好了 dist/index.json')
