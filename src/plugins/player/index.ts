import { setVolume, setPlaybackRate, migratePlayerCache } from './utils'
import { initMediaBridge } from '@/plugins/mediaBridge'
import { liuyinSetRate, liuyinSetVolume, liuyinSetCacheMaxBytes, liuyinSetHandleAudioFocus } from './liuyinPlayer'

const initial = async({ volume, playRate, cacheSize, isHandleAudioFocus, isEnableAudioOffload }: {
  volume: number
  playRate: number
  cacheSize: number
  isHandleAudioFocus: boolean
  isEnableAudioOffload: boolean
}) => {
  if (global.lx.playerStatus.isIniting || global.lx.playerStatus.isInitialized) return
  global.lx.playerStatus.isIniting = true
  console.log('Cache Size', cacheSize * 1024)
  liuyinSetCacheMaxBytes(cacheSize > 0 ? cacheSize * 1024 * 1024 : 0)
  liuyinSetHandleAudioFocus(isHandleAudioFocus)
  await migratePlayerCache()
  // Media3 播放器无需 setupPlayer
  global.lx.playerStatus.isInitialized = true
  global.lx.playerStatus.isIniting = false
  liuyinSetVolume(volume)
  liuyinSetRate(playRate)
  // 启动 Media3 MediaSessionService（系统媒体应用识别/锁屏媒体控件/通知栏）
  initMediaBridge()
}


const isInitialized = () => global.lx.playerStatus.isInitialized


export {
  initial,
  isInitialized,
  setVolume,
  setPlaybackRate,
}

export {
  setResource,
  setPause,
  setPlay,
  setCurrentTime,
  getDuration,
  setStop,
  resetPlay,
  getPosition,
  updateMetaData,
  onStateChange,
  isEmpty,
  useBufferProgress,
  initTrackInfo,
  removeCache,
} from './utils'
