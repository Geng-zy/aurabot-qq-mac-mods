#!/usr/bin/env node
// 把 modules/<id>/ 打成 ZIP，更新 registry/index.json。
// 依赖系统 zip；发布时把 dist/*.zip 上传到 GitHub Release。
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const modulesDir = join(root, 'modules')
const distDir = join(root, 'dist')
const registryDir = join(root, 'registry')
const base = process.env.AURABOT_MODULE_ASSETS_BASE || 'https://github.com/Geng-zy/aurabot-qq-mac-mods/releases/download/v1/'

mkdirSync(distDir, { recursive: true })
mkdirSync(registryDir, { recursive: true })
const modules = []
for (const id of readdirSync(modulesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name)) {
  const dir = join(modulesDir, id)
  const manifestPath = join(dir, 'module.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.id !== id) throw new Error(`${id}: module.json id 不一致`)
  if (!existsSync(join(dir, 'index.mjs'))) throw new Error(`${id}: 缺 index.mjs`)
  const file = `${id}-${manifest.version}.zip`
  const out = join(distDir, file)
  rmSync(out, { force: true })
  execFileSync('zip', ['-qr', out, '.'], { cwd: dir })
  const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex')
  modules.push({
    id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description || '',
    category: manifest.category || 'tool', tags: manifest.tags || [], author: manifest.author || '', license: manifest.license || '',
    api: Number(manifest.api) || 1, minPluginVersion: manifest.minPluginVersion || '1.5.10',
    requires: manifest.requires || [], capabilities: manifest.capabilities || [],
    path: file, sha256,
  })
  console.log(`packed ${file}`)
}
const index = { schema: 1, generatedAt: new Date().toISOString(), assetsBase: base, modules, revoked: [] }
writeFileSync(join(registryDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`registry/index.json: ${modules.length} module(s)`)
