#!/usr/bin/env node
/**
 * 流音发布门禁（静态检查）
 *
 * 用途：在把代码从「测试区」同步到「发布源码」并准备提交/打 tag 前运行。
 *   阻断项：版本号不一致、仓库内残留签名文件、源码中残留私钥/真实代理/token。
 *   提示项：仅告警，不阻断（既有代码的 lint/tsc 债务另行治理）。
 *
 * 用法：
 *   node scripts/release-gate.mjs
 *
 * 通过标准：
 *   exit 0 = 可进入构建/发布流程
 *   exit 1 = 存在阻断问题，禁止发布
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const problems = [] // 阻断
const warnings = [] // 提示

// ------- 工具 -------
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const rel = (p) => path.relative(root, p).split(path.sep).join('/')

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.gradle', 'build', 'dist', '.idea',
  'ios/Pods', 'coverage', '.cxx',
])
// 生成产物目录（按路径片段跳过）
const SKIP_HAS = new Set(['build', 'dist'])

function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      // android/app/build、android/build 等
      if (SKIP_HAS.has(e.name) && (p.includes(`${path.sep}android${path.sep}`) || p.includes(`${path.sep}ios${path.sep}`))) continue
      walk(p, out)
    } else if (e.isFile()) {
      out.push(p)
    }
  }
  return out
}

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.ttf', '.otf', '.woff', '.woff2', '.mp3', '.wav', '.flac', '.m4a',
  '.jar', '.apk', '.aab', '.keystore', '.jks', '.p12', '.zip', '.bin',
  '.so', '.dat', '.pdf',
])

function isScannable(file) {
  const r = rel(file)
  // 门禁/校验脚本自身含有用于检测的规则样本（如端口、token 正则），跳过以免自引用
  if (r.startsWith('scripts/')) return false
  const ext = path.extname(file).toLowerCase()
  if (BINARY_EXT.has(ext)) return false
  const base = path.basename(file).toLowerCase()
  if (base === 'package-lock.json' || base.endsWith('.lock')) return false // 体量大且多为依赖哈希
  return true
}

// 真实私钥块：BEGIN ... 至少一行 base64 主体 ... END
// 用于避免把 crypto.ts 里的 PEM header 标记常量误判为泄露。
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/
const hasBase64Body = (block) => block.split(/\r?\n/).some(l => /^[A-Za-z0-9+/=]{40,}\s*$/.test(l))

function scanSecrets(files) {
  const hits = []
  const scannable = files.filter(isScannable)

  // 1) 私钥块（按整文件检测，要求 base64 主体）
  for (const file of scannable) {
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const block = text.match(PRIVATE_KEY_BLOCK)
    if (block && hasBase64Body(block[0])) {
      hits.push({ file: rel(file), line: 0, kind: 'PRIVATE KEY', preview: '(检测到完整私钥块)' })
    }
  }

  // 2) 行级规则：token、开发机硬编码代理等
  const lineRules = [
    { kind: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/ },
    { kind: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
    { kind: 'aws-akid', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { kind: 'local-proxy-port', re: /:7897\b/, note: '疑似开发机代理端口 7897，公开源码不应固化本机代理' },
  ]
  for (const file of scannable) {
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const lines = text.split(/\r?\n/)
    for (const r of lineRules) {
      lines.forEach((line, i) => {
        if (r.re.test(line)) {
          hits.push({ file: rel(file), line: i + 1, kind: r.kind, preview: line.trim().slice(0, 120), note: r.note })
        }
      })
    }
  }
  return hits
}

// ------- 1. 版本一致性（阻断） -------
function checkVersions() {
  const pkg = readJson(path.join(root, 'package.json'))
  const lock = readJson(path.join(root, 'package-lock.json'))
  const name = pkg.name || '?'

  if (pkg.version !== lock.packages?.['']?.version) {
    problems.push(`版本不一致：package.json=${pkg.version} 但 package-lock.json 根版本=${lock.packages?.['']?.version}。发布前请执行 npm install 使两者一致。`)
  }
  if (!pkg.versionCode) {
    problems.push(`package.json 缺少 versionCode（Android 需要）。`)
  }
  console.log(`· 版本：${pkg.version}  versionCode=${pkg.versionCode}  name=${name}`)
}

// ------- 2. 禁用文件（阻断） -------
const FORBIDDEN = new Set([
  'keystore.properties', 'signing.properties', '.env', 'local.properties',
])
const FORBIDDEN_EXT = new Set(['.jks', '.keystore', '.pepk', '.p12', '.pem', '.key'])

function checkForbiddenFiles(files) {
  for (const f of files) {
    const base = path.basename(f)
    const ext = path.extname(f).toLowerCase()
    if (FORBIDDEN.has(base)) {
      problems.push(`检出签名/本地配置文件：${rel(f)}。签名相关文件一律不入库。`)
    } else if (FORBIDDEN_EXT.has(ext)) {
      problems.push(`检出疑似签名/私钥文件：${rel(f)}。`)
    }
  }
}

// ------- 3. 敏感内容扫描（阻断） -------
function checkSecrets(files) {
  const hits = scanSecrets(files)
  for (const h of hits) {
    problems.push(`敏感内容 ${h.kind}：${h.file}:${h.line}${h.note ? `（${h.note}）` : ''} → ${h.preview}`)
  }
}

// ------- 4. AndroidManifest 唯一 MEDIA_BUTTON 接收器提示 -------
function checkManifestWarning(files) {
  const manifest = files.find(f => rel(f) === 'android/app/src/main/AndroidManifest.xml')
  if (!manifest) return
  const text = fs.readFileSync(manifest, 'utf8')
  // 仅作提示：Media3 与旧库并存时 MediaButtonReceiver 冲突会启动即崩
  const removeCount = (text.match(/tools:node="remove"/g) || []).length
  if (removeCount === 0) {
    warnings.push('AndroidManifest.xml 未发现 tools:node="remove"；若引入其他媒体库可能造成双 MEDIA_BUTTON 接收器崩溃。')
  }
}

// ------- 运行 -------
console.log('== 流音发布门禁 ==')
console.log(`目录：${root}\n`)

const files = walk(root)
console.log(`扫描文件：${files.length} 个\n`)

checkVersions()
checkForbiddenFiles(files)
checkSecrets(files)
checkManifestWarning(files)

if (warnings.length) {
  console.log('\n-- 提示（不阻断）--')
  for (const w of warnings) console.log('  ⚠ ' + w)
}

if (problems.length) {
  console.log(`\n-- 阻断问题 (${problems.length}) --`)
  for (const p of problems) console.log('  ✗ ' + p)
  console.log('\n结果：未通过。请修复以上阻断项后再进入构建/发布流程。')
  process.exit(1)
} else {
  console.log('\n结果：通过。可以进行构建与 APK 签名校验（scripts/verify-apk.mjs）。')
  process.exit(0)
}
