import BackgroundTimer from 'react-native-background-timer'
import { playMusic as handlePlayMusic } from './playList'
import { existsFile, moveFile, privateStorageDirectoryPath, temporaryDirectoryPath } from '@/utils/fs'
import { toast } from '@/utils/tools'
import {
  liuyinGetDuration,
  liuyinGetPosition,
  liuyinGetState,
  liuyinPause,
  liuyinPlay,
  liuyinSeekTo,
  liuyinSetRate,
  liuyinGetCacheSize,
  liuyinIsCached,
  liuyinClearCache,
  liuyinSetVolume,
  liuyinStop,
} from './liuyinPlayer'

export { useBufferProgress } from './hook'

const emptyIdRxp = /\/\/default$/
const tempIdRxp = /\/\/default$|\/\/default\/\/restorePlay$/
export const isEmpty = (trackId = global.lx.playerTrackId) => {
  return !trackId || emptyIdRxp.test(trackId)
}
export const isTempId = (trackId = global.lx.playerTrackId) => !trackId || tempIdRxp.test(trackId)

export const setResource = (musicInfo: LX.Player.PlayMusic, url: string, duration?: number) => {
  // 记录当前播放直链：提前结束恢复时需按该 key 清理可能损坏的媒体缓存
  global.lx.playerPlayUrl = url
  handlePlayMusic(musicInfo, url, duration ?? 0)
}

export const setPlay = async() => liuyinPlay()
export const getPosition = async() => liuyinGetPosition()
export const getDuration = async() => liuyinGetDuration()
export const setStop = async() => {
  global.lx.isChangingMusic = true
  BackgroundTimer.setTimeout(() => { global.lx.isChangingMusic = false }, 1500)
  await liuyinStop()
}
export const setLoop = async(loop: boolean) => {
  // Media3 单曲模型：列表循环由 JS 控制，无原生 repeat
}
export const setPause = async() => liuyinPause()
export const setCurrentTime = async(time: number) => liuyinSeekTo(time * 1000)
export const setVolume = async(num: number) => liuyinSetVolume(num)
export const setPlaybackRate = async(num: number) => liuyinSetRate(num)

export const resetPlay = async() => Promise.all([setPause(), setCurrentTime(0)])

export interface NowPlayingTitles {
  title?: string
  artist?: string
  album?: string
  lyric?: string
}
export const updateNowPlayingTitles = async(titles: NowPlayingTitles) => {
  // 通知栏/锁屏由 Media3 自动显示，无需手动更新
}

export const isCached = async(url: string): Promise<boolean> => liuyinIsCached(url)
export const getCacheSize = async(): Promise<number> => liuyinGetCacheSize()
export const clearCache = async() => liuyinClearCache()
export const removeCache = async(url: string): Promise<boolean> => liuyinRemoveCache(url)
export const migratePlayerCache = async() => {
  const newCachePath = privateStorageDirectoryPath + '/TrackPlayer'
  if (await existsFile(newCachePath)) return
  const oldCachePath = temporaryDirectoryPath + '/TrackPlayer'
  if (!await existsFile(oldCachePath)) return
  let timeout: number | null = BackgroundTimer.setTimeout(() => {
    timeout = null
    toast(global.i18n.t('player_cache_migrating'), 'long')
  }, 2_000)
  await moveFile(oldCachePath, newCachePath).finally(() => {
    if (timeout) BackgroundTimer.clearTimeout(timeout)
  })
}

export const destroy = async() => {
  await liuyinStop()
}

type PlayStatus = 'None' | 'Ready' | 'Playing' | 'Paused' | 'Stopped' | 'Buffering' | 'Connecting'

export const onStateChange = async(listener: (state: PlayStatus) => void) => {
  // Media3 播放状态由 service.ts 统一分发，此处保留接口
  return () => {}
}

export const updateOptions = async() => {
  // Media3 无需配置
}

// 通知栏/锁屏元数据由 Media3 在 load 时自动设置，无需手动更新
export const updateMetaData = async() => {}

export { initTrackInfo } from './playList'
