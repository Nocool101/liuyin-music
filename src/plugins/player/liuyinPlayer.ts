import { NativeModules, NativeEventEmitter } from 'react-native'

const { LiuyinPlayer } = NativeModules

export type LiuyinPlayerEventType = 'STATE' | 'ENDED' | 'ERROR'

export interface LiuyinPlayerEventData {
  type: LiuyinPlayerEventType
  data?: string
}

let emitter: NativeEventEmitter | null = null
let initialized = false

const listeners = new Set<(data: LiuyinPlayerEventData) => void>()

/**
 * 初始化 Media3 播放器桥接（注册事件分发）
 */
export const initLiuyinPlayer = () => {
  if (initialized || !LiuyinPlayer) return
  initialized = true
  emitter = new NativeEventEmitter(LiuyinPlayer)
  emitter.addListener('LiuyinPlayerEvent', (data: LiuyinPlayerEventData) => {
    for (const listener of listeners) listener(data)
  })
}

export const addLiuyinPlayerListener = (listener: (data: LiuyinPlayerEventData) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const liuyinLoad = (url: string, title: string, artist: string, album: string, artwork: string, durationMs: number, positionMs: number) => {
  if (!LiuyinPlayer) return
  try {
    LiuyinPlayer.load(url ?? '', title ?? '', artist ?? '', album ?? '', artwork ?? '', durationMs ?? 0, positionMs ?? 0)
  } catch (err) {
    // ignore
  }
}

export const liuyinPlay = () => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.play() } catch (err) { /* ignore */ }
}

export const liuyinPause = () => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.pause() } catch (err) { /* ignore */ }
}

export const liuyinStop = () => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.stop() } catch (err) { /* ignore */ }
}

export const liuyinSeekTo = (positionMs: number) => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.seekTo(positionMs) } catch (err) { /* ignore */ }
}

export const liuyinGetPosition = async(): Promise<number> => {
  if (!LiuyinPlayer) return 0
  try { return (await LiuyinPlayer.getPosition() ?? 0) / 1000 } catch (err) { return 0 }
}

export const liuyinGetDuration = async(): Promise<number> => {
  if (!LiuyinPlayer) return 0
  try { return (await LiuyinPlayer.getDuration() ?? 0) / 1000 } catch (err) { return 0 }
}

export const liuyinSetVolume = (volume: number) => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.setVolume(volume) } catch (err) { /* ignore */ }
}

export const liuyinSetRate = (rate: number) => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.setRate(rate) } catch (err) { /* ignore */ }
}

export const liuyinSetCacheMaxBytes = (bytes: number) => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.setCacheMaxBytes(bytes) } catch (err) { /* ignore */ }
}

export const liuyinSetHandleAudioFocus = (enable: boolean) => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.setHandleAudioFocus(enable) } catch (err) { /* ignore */ }
}

export const liuyinGetCacheSize = async(): Promise<number> => {
  if (!LiuyinPlayer) return 0
  try { return Math.trunc(await LiuyinPlayer.getCacheSize() ?? 0) } catch (err) { return 0 }
}

export const liuyinIsCached = async(key: string): Promise<boolean> => {
  if (!LiuyinPlayer) return false
  try { return await LiuyinPlayer.isCached(key) ?? false } catch (err) { return false }
}

export const liuyinClearCache = async(): Promise<void> => {
  if (!LiuyinPlayer) return
  try { await LiuyinPlayer.clearCache() } catch (err) { /* ignore */ }
}

export const liuyinRemoveCache = async(url: string): Promise<boolean> => {
  if (!LiuyinPlayer || !url) return false
  try { return await LiuyinPlayer.removeCache(url) ?? false } catch (err) { return false }
}

export const liuyinGetState = async(): Promise<string> => {
  if (!LiuyinPlayer) return 'paused'
  try { return await LiuyinPlayer.getState() ?? 'paused' } catch (err) { return 'paused' }
}

/** JS 侧文件日志（写入应用外部目录 liuyin_media.log，logcat 不可用的 ROM 上的唯一诊断通道） */
export const liuyinNativeLog = (msg: string) => {
  if (!LiuyinPlayer) return
  try { LiuyinPlayer.nativeLog(msg) } catch (err) { /* ignore */ }
}
