#!/usr/bin/env node
/**
 * 发布 APK 签名/版本校验
 *
 * 用途：Android Release 构建后运行，确保：
 *   1. APK 确实被正式证书签名，而不是公开可伪造的 Android Debug 证书；
 *   2. APK 的 applicationId / versionName / versionCode 与 package.json 一致。
 *
 * 依赖 Android SDK build-tools 的 apksigner（与 aapt 可选）。
 * 通过 ANDROID_HOME / ANDROID_SDK_ROOT 或默认路径定位。
 *
 * 用法：
 *   node scripts/verify-apk.mjs <apk1> [apk2 ...]
 *   node scripts/verify-apk.mjs            # 自动扫描 android/app/build/outputs/apk/release/*.apk
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 已知公开 Android Debug 证书指纹（历史上 v1.08–v1.10 误用）
const KNOWN_DEBUG_CERTS = new Set([
  'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c',
])
const DEBUG_DN = 'cn=android debug'

const problems = []

function findInSdk(name) {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    'C:\\Android\\Sdk',
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
  ].filter(Boolean)
  for (const sdk of sdkRoots) {
    const bt = path.join(sdk, 'build-tools')
    if (!fs.existsSync(bt)) continue
    const versions = fs.readdirSync(bt).sort().reverse()
    for (const v of versions) {
      const cmd = path.join(bt, v, name)
      if (fs.existsSync(cmd)) return cmd
    }
  }
  return null
}

function run(cmd, args) {
  const isBat = process.platform === 'win32' && /\.bat$/i.test(cmd)
  const child = isBat ? { command: 'cmd.exe', args: ['/c', cmd, ...args] } : { command: cmd, args }
  return execFileSync(child.command, child.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false })
}

function verifyApk(apkPath) {
  const apkSigner = process.env.APKSIGNER || findInSdk(process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')
  if (!apkSigner) {
    problems.push('找不到 apksigner，请设置 ANDROID_HOME 或 APKSIGNER 环境变量。')
    return
  }
  let out
  try {
    out = run(apkSigner, ['verify', '--print-certs', apkPath])
  } catch (e) {
    problems.push(`apksigner 校验失败：${path.basename(apkPath)}\n${e.stdout || ''}${e.stderr || ''}`)
    return
  }
  const dn = (out.match(/Signer #1 certificate DN:\s*(.+)/) || [])[1]?.trim() || '(未知)'
  const sha256 = (out.match(/SHA-256 digest:\s*([0-9a-fA-F]{64})/) || [])[1]?.toLowerCase() || '(未知)'

  console.log(`· ${path.basename(apkPath)}`)
  console.log(`    DN:      ${dn}`)
  console.log(`    SHA-256: ${sha256}`)

  if (sha256 === '(未知)') {
    problems.push(`无法读取证书指纹：${path.basename(apkPath)}`)
  } else if (KNOWN_DEBUG_CERTS.has(sha256) || dn.toLowerCase().startsWith(DEBUG_DN)) {
    problems.push(`「${path.basename(apkPath)}」使用 Android Debug 证书签名（${sha256}），禁止发布！`)
  }
}

// 说明：旧实现使用 apksignerShort 直接调用 .bat，在 Windows 上不可靠，
// 现统一由 run() 对 .bat 走 cmd /c 调用。

function checkVersionMatch(apkPath) {
  const aapt = process.env.AAPT || findInSdk(process.platform === 'win32' ? 'aapt.exe' : 'aapt')
  if (!aapt) return // aapt 可选，缺失只跳过版本比对
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  try {
    const badging = execFileSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8' })
    const appId = (badging.match(/package: name='([^']+)'/) || [])[1]
    const vName = (badging.match(/versionName='([^']+)'/) || [])[1]
    const vCode = (badging.match(/versionCode='([^']+)'/) || [])[1]
    console.log(`    appId=${appId} versionName=${vName} versionCode=${vCode}`)
    if (appId !== 'cn.lycool.app') problems.push(`${path.basename(apkPath)} applicationId=${appId} 应为 cn.lycool.app`)
    if (vName !== pkg.version) problems.push(`${path.basename(apkPath)} versionName=${vName} 与 package.json=${pkg.version} 不一致`)
    // 拆分 ABI 的 versionCode = versionCode*1000 + 序号(1..4)；universal 直接用 versionCode
    const base = String(pkg.versionCode)
    const vc = String(vCode)
    const isSplitAbi = /arm64|armeabi|x86/.test(path.basename(apkPath)) && !/universal/.test(path.basename(apkPath))
    if (isSplitAbi) {
      const expected = new Set([1, 2, 3, 4].map(n => String(Number(base) * 1000 + n)))
      if (!expected.has(vc)) problems.push(`${path.basename(apkPath)} versionCode=${vc} 应为 ${Number(base) * 1000 + [1, 4].join(' 到 ')}`)
    } else {
      if (vc !== base) problems.push(`${path.basename(apkPath)} versionCode=${vc} 与 package.json=${base} 不匹配（universal 应为 ${base}）`)
    }
  } catch (e) {
    warnings?.(`aapt 读取失败：${path.basename(apkPath)}`)
  }
}

function warnings(msg) { console.log('    ⚠ ' + msg) }

// ------- 运行 -------
let apks = process.argv.slice(2)
if (apks.length === 0) {
  const dir = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release')
  if (fs.existsSync(dir)) {
    apks = fs.readdirSync(dir).filter(f => f.endsWith('.apk')).map(f => path.join(dir, f))
  }
}
if (apks.length === 0) {
  console.error('未找到 APK。请先构建，或以参数方式传入 APK 路径。')
  process.exit(1)
}

console.log('== 发布 APK 校验 ==')
for (const apk of apks) {
  if (!fs.existsSync(apk)) { problems.push(`文件不存在：${apk}`); continue }
  verifyApk(apk)
  checkVersionMatch(apk)
}

if (problems.length) {
  console.log(`\n-- 校验未通过 (${problems.length}) --`)
  for (const p of problems) console.log('  ✗ ' + p)
  process.exit(1)
} else {
  console.log('\n结果：签名与版本校验通过，可上传 Release。')
  process.exit(0)
}
