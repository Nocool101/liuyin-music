import { langS2T } from '@/utils'
import settingState from '@/store/setting/state'

export const existTimeExp = /\[\d{1,2}:.*\d{1,4}\]/

export const buildLyricInfo = async(lyricInfo: MakeOptional<LX.Player.LyricInfo, 'rawlrcInfo'>): Promise<LX.Player.LyricInfo> => {
  if (!settingState.setting['player.isS2t']) {
    // @ts-expect-error
    if (lyricInfo.rawlrcInfo) return lyricInfo
    return { ...lyricInfo, rawlrcInfo: { ...lyricInfo } }
  }

  if (settingState.setting['player.isS2t']) {
    const tasks = [
      lyricInfo.lyric ? langS2T(lyricInfo.lyric) : Promise.resolve(''),
      lyricInfo.tlyric ? langS2T(lyricInfo.tlyric) : Promise.resolve(''),
      lyricInfo.rlyric ? langS2T(lyricInfo.rlyric) : Promise.resolve(''),
      lyricInfo.lxlyric ? langS2T(lyricInfo.lxlyric) : Promise.resolve(''),
    ]
    if (lyricInfo.rawlrcInfo) {
      tasks.push(lyricInfo.lyric ? langS2T(lyricInfo.lyric) : Promise.resolve(''))
      tasks.push(lyricInfo.tlyric ? langS2T(lyricInfo.tlyric) : Promise.resolve(''))
      tasks.push(lyricInfo.rlyric ? langS2T(lyricInfo.rlyric) : Promise.resolve(''))
      tasks.push(lyricInfo.lxlyric ? langS2T(lyricInfo.lxlyric) : Promise.resolve(''))
    }
    return Promise.all(tasks).then(([lyric, tlyric, rlyric, lxlyric, lyric_raw, tlyric_raw, rlyric_raw, lxlyric_raw]) => {
      const rawlrcInfo = lyric_raw ? {
        lyric: lyric_raw,
        tlyric: tlyric_raw,
        rlyric: rlyric_raw,
        lxlyric: lxlyric_raw,
      } : {
        lyric,
        tlyric,
        rlyric,
        lxlyric,
      }
      return {
        lyric,
        tlyric,
        rlyric,
        lxlyric,
        rawlrcInfo,
      }
    })
  }

  // @ts-expect-error
  return lyricInfo.rawlrcInfo ? lyricInfo : { ...lyricInfo, rawlrcInfo: { ...lyricInfo } }
}

export const getCachedLyricInfo = async(musicInfo: LX.Music.MusicInfo): Promise<LX.Player.LyricInfo | null> => {
  const { getPlayerLyric: getStoreLyric } = await import('@/utils/data')
  let lrcInfo = await getStoreLyric(musicInfo)
  if (existTimeExp.test(lrcInfo.lyric) && lrcInfo.tlyric != null) {
    if (lrcInfo.rlyric == null) {
      if (!['wy', 'kg'].includes(musicInfo.source)) return lrcInfo
    } else return lrcInfo
  }
  return null
}

export const TRY_QUALITYS_LIST = ['flac24bit', 'flac', '320k'] as const
type TryQualityType = typeof TRY_QUALITYS_LIST[number]
export const getPlayQuality = (highQuality: LX.Quality, musicInfo: LX.Music.MusicInfoOnline): LX.Quality => {
  let type: LX.Quality = '128k'
  if (TRY_QUALITYS_LIST.includes(highQuality as TryQualityType)) {
    let list = global.lx.qualityList[musicInfo.source]

    let t = TRY_QUALITYS_LIST
      .slice(TRY_QUALITYS_LIST.indexOf(highQuality as TryQualityType))
      .find(q => musicInfo.meta._qualitys[q] && list?.includes(q))

    if (t) type = t
  }
  return type
}

/**
 * 媒体资源缓存 key
 *
 * Media3 的 SimpleCache 默认以 DataSpec.key（即播放 URL）为缓存键，而 CDN 直链
 * 普遍带时效签名，链接一轮换缓存就作废——缓存里的音频文件变成孤儿，每次播放
 * 都要重新下载一遍（即使同一首歌的音频已经完整躺在缓存里）。
 *
 * 改用「歌曲ID + 音质」作为稳定 key：同一首歌同一音质，无论解析多少次、
 * 直连还是走服务器代理，都命中同一条缓存。
 *
 * 与歌曲 URL 缓存（utils/data.ts 的 `${musicInfo.id}_${type}`）保持同一套
 * 音质口径，避免「URL 缓存命中但资源缓存落空」这类错位。
 */
export const getMediaCacheKey = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem): string => {
  const onlineInfo = 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
  // 本地文件直接读盘，不经过网络资源缓存
  if (onlineInfo.source == 'local') return ''
  const quality = getPlayQuality(settingState.setting['player.playQuality'], onlineInfo as LX.Music.MusicInfoOnline)
  return `ly_${onlineInfo.id}_${quality}`
}
