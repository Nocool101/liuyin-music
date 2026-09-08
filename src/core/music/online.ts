import {
  saveLyric,
  saveMusicUrl,
  getMusicUrl as getStoreMusicUrl,
} from '@/utils/data'
import { updateListMusics } from '@/core/list'
import settingState from '@/store/setting/state'
import { subsonic } from '@/plugins/subsonic'
import { lxApi } from '@/plugins/lxserver'
import { liuyinNativeLog } from '@/plugins/player/liuyinPlayer'

import {
  buildLyricInfo,
  getPlayQuality,
  getCachedLyricInfo,
} from './utils'

// 记录解析结果的 URL 形态（去掉 query，避免把认证参数写入日志）
const logUrlShape = (url: string): string => {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return url.slice(0, 60)
  }
}

// 音质降级链（照抄 Web 播放器 QUALITY_PRIORITY，从目标音质向下降级）
const QUALITY_DEGRADE_CHAIN: LX.Quality[] = ['flac24bit', 'flac', '320k', '192k', '128k']

const getQualityChain = (target: LX.Quality): LX.Quality[] => {
  const index = QUALITY_DEGRADE_CHAIN.indexOf(target)
  if (index === -1) return [target]
  return QUALITY_DEGRADE_CHAIN.slice(index)
}

// 解析出 URL 后探测可用性（照抄 Web 播放器 applyAutoProxy probe 的思路）：
// 直链与服务器代理并行探测，直链可用优先（快、省服务器流量），
// 直链不可达（客户端网络/运营商到 CDN 不通、Referer 校验等）则退回服务器代理，
// 两者都不可用返回 null，让上层继续音质降级/跨平台换源轮询。
const probeResolvedUrl = async(url: string, filename: string): Promise<string | null> => {
  const proxied = lxApi.getProxiedStreamUrl(url, filename)
  const [directOk, proxyOk] = await Promise.all([
    lxApi.probeUrl(url),
    lxApi.probeUrl(proxied),
  ])
  if (directOk) return url
  if (proxyOk) return proxied
  return null
}

export const getMusicUrl = async({ musicInfo, quality, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  const targetQuality = quality ?? getPlayQuality(settingState.setting['player.playQuality'], musicInfo)
  const cachedUrl = await getStoreMusicUrl(musicInfo, targetQuality)
  if (cachedUrl && !isRefresh) return cachedUrl

  liuyinNativeLog(`resolve ${musicInfo.id} q=${targetQuality} refresh=${!!isRefresh} qualitys=${JSON.stringify(musicInfo.meta._qualitys)} setting=${settingState.setting['player.playQuality']}`)

  let lastError: any = null
  const filename = `${musicInfo.singer} - ${musicInfo.name}.mp3`

  // 1. 内部 API 多源轮询（照抄 Web 播放器 fetchSongUrl → POST /api/music/url）。
  //    服务端拿到完整 songInfo 后对该平台所有自定义源逐个尝试（enableAutoSwitchApiSource），
  //    与 Subsonic stream 不同：不依赖歌曲存在于服务器用户列表（findMusicById），
  //    因此搜索结果、歌单广场、排行榜里"不在库中"的歌曲也能解析出直链。
  //    失败时按 Web 播放器的音质降级逻辑逐级重试。
  for (const q of getQualityChain(targetQuality)) {
    try {
      const result = await lxApi.getMusicUrl(musicInfo, q)
      const usableUrl = await probeResolvedUrl(result.url, filename)
      liuyinNativeLog(`resolved ${musicInfo.id} q=${q} direct=${result.url === usableUrl ? 'direct' : 'proxy'} url=${logUrlShape(usableUrl ?? 'null')}${result.type ? ` type=${result.type}` : ''}${result.sourceName ? ` src=${result.sourceName}` : ''}`)
      if (usableUrl) {
        void saveMusicUrl(musicInfo, targetQuality, usableUrl)
        return usableUrl
      }
    } catch (err) {
      lastError = err
      liuyinNativeLog(`resolve failed ${musicInfo.id} q=${q}: ${err?.message ?? err}`)
      console.log(`Internal API music URL failed for ${musicInfo.id} (${q}):`, err?.message ?? err)
    }
  }

  // 2. 跨平台换源（照抄 Web 播放器 findOtherSourceMatch）：
  //    当前平台所有源都解析失败时，用"歌名+歌手"在网易/QQ/酷我/酷狗/咪咕搜索同曲，
  //    按歌名/歌手/时长/专辑匹配度打分，取最优结果重新解析。
  if (allowToggleSource) {
    try {
      const matched = await lxApi.findOtherSourceMatch(musicInfo)
      if (matched) {
        onToggleSource(matched)
        const bestQuality = getBestMatchQuality(matched, targetQuality)
        const result = await lxApi.getMusicUrl(matched, bestQuality)
        const usableUrl = await probeResolvedUrl(result.url, filename)
        if (usableUrl) {
          void saveMusicUrl(musicInfo, targetQuality, usableUrl)
          return usableUrl
        }
      }
    } catch (err) {
      lastError = err
      console.log('Cross-source fallback failed:', err?.message ?? err)
    }
  }

  // 3. Subsonic stream 兜底（仅当歌曲在服务器用户列表内、服务器能查到完整 songInfo 时可用）
  try {
    const maxBitRate = getMaxBitRate(targetQuality)
    const url = subsonic.getStreamUrl(musicInfo.id, maxBitRate)
    void saveMusicUrl(musicInfo, targetQuality, url)
    return url
  } catch (err) {
    lastError = err
    console.log('Subsonic stream failed, trying internal API:', err)
  }

  throw lastError ?? new Error('Failed to get music URL')
}

// 取换源结果可用的最高音质（不超过目标音质）
const getBestMatchQuality = (matched: any, targetQuality: LX.Quality): string => {
  const types = Array.isArray(matched.types) ? matched.types.map((t: any) => t.type ?? t) : []
  const chain = getQualityChain(targetQuality)
  for (const q of chain) {
    if (types.includes(q)) return q
  }
  return targetQuality
}

export const getPicUrl = async({ musicInfo, listId, isRefresh }: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
}): Promise<string> => {
  if (musicInfo.meta.picUrl && !isRefresh && !musicInfo.meta.picUrl.startsWith('subsonic:')) {
    return musicInfo.meta.picUrl
  }

  try {
    const coverArtId = musicInfo.meta.picUrl?.replace('subsonic:', '') ?? musicInfo.meta.songId
    const url = subsonic.getCoverArtUrl(coverArtId, 300)

    if (listId) {
      musicInfo.meta.picUrl = url
      void updateListMusics([{ id: listId, musicInfo }])
    }

    return url
  } catch (err) {
    console.error('Failed to get pic URL:', err)
    return ''
  }
}

export const getLyricInfo = async({ musicInfo, isRefresh }: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  try {
    // Try Subsonic lyrics first
    const lyricInfo = await subsonic.getLyrics(musicInfo.id)
    if (lyricInfo.lyric) {
      void saveLyric(musicInfo, lyricInfo)
      return buildLyricInfo(lyricInfo)
    }
  } catch (err) {
    console.log('Subsonic lyrics failed, trying internal API:', err)
  }

  try {
    // Fallback to internal API
    const lyricInfo = await lxApi.getLyric(
      musicInfo.source,
      musicInfo.meta.songId,
      musicInfo.name,
      musicInfo.singer,
    )
    if (lyricInfo.lyric) {
      void saveLyric(musicInfo, lyricInfo)
      return buildLyricInfo(lyricInfo)
    }
  } catch (err) {
    console.log('Internal API lyrics failed:', err)
  }

  return { lyric: '', tlyric: '', rlyric: '', lxlyric: '', rawlrcInfo: { lyric: '', tlyric: '', rlyric: '', lxlyric: '' } }
}

const getMaxBitRate = (quality: LX.Quality): number => {
  switch (quality) {
    case '128k': return 128
    case '192k': return 192
    case '320k': return 320
    case 'flac':
    case 'flac24bit':
    case 'ape':
    case 'wav':
      // lxserver custom sources commonly expose lossy streams only. Requesting
      // 128k keeps the Subsonic URL resolvable instead of defaulting to FLAC.
      return 128
    default: return 128
  }
}
