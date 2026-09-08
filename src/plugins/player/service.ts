import BackgroundTimer from 'react-native-background-timer'
import playerState from '@/store/player/state'
import { exitApp } from '@/core/common'
import { playNext, handlePlaybackError, resetPlayErrorCount, verifyPlaybackEnded } from '@/core/player/player'
import { addLiuyinPlayerListener, initLiuyinPlayer, liuyinGetState, liuyinPlay } from './liuyinPlayer'

let isInitialized = false

// 销毁播放器并退出
const handleExitApp = async(reason: string) => {
  global.lx.isPlayedStop = false
  exitApp(reason)
}

// 兜底重试：加载歌曲后若播放器停在缓冲/暂停（未进入 Playing），
// 短暂延迟后重新调用一次 play()（等价于用户手动点播放按钮）
let bufferRetryTimer: ReturnType<typeof setTimeout> | null = null
let bufferRetryRunning = false
const clearBufferRetry = () => {
  if (bufferRetryTimer) {
    clearTimeout(bufferRetryTimer)
    bufferRetryTimer = null
  }
}
const scheduleBufferRetry = () => {
  if (bufferRetryTimer || !global.lx.waitingForPlayback) return
  if (global.lx.bufferRetryCount >= 2) return
  bufferRetryTimer = setTimeout(async() => {
    bufferRetryTimer = null
    if (!global.lx.waitingForPlayback) return
    if (global.lx.isChangingMusic || global.lx.isPlayedStop) return
    global.lx.bufferRetryCount++
    liuyinPlay()
  }, 1200)
}

const registerPlaybackService = async() => {
  if (isInitialized) return

  console.log('reg services...')
  initLiuyinPlayer()

  addLiuyinPlayerListener(data => {
    switch (data.type) {
      case 'STATE':
        if (global.lx.gettingUrlId) return
        switch (data.data) {
          case 'playing':
            global.lx.waitingForPlayback = false
            clearBufferRetry()
            global.lx.bufferRetryCount = 0
            resetPlayErrorCount()
            global.app_event.playerPlaying()
            global.app_event.play()
            break
          case 'paused':
          case 'ready':
            clearBufferRetry()
            if (global.lx.waitingForPlayback) {
              scheduleBufferRetry()
            }
            global.app_event.playerPause()
            global.app_event.pause()
            break
          case 'buffering':
            global.app_event.pause()
            global.app_event.playerWaiting()
            scheduleBufferRetry()
            break
          default:
            break
        }
        break
      case 'ENDED': {
        if (global.lx.isPlayedStop) return handleExitApp('Timeout Exit')
        // 先校验是否真正播完：流被截断的"提前结束"会触发恢复重播（verifyPlaybackEnded
        // 内部已接管），不能在这里直接切歌，否则歌曲没放完就跳到下一首
        const endedSongId = playerState.playMusicInfo.musicInfo?.id
        void verifyPlaybackEnded().then((recovered) => {
          if (recovered) return
          // 校验期间用户已手动切歌/停止：不再自动切歌
          if (playerState.playMusicInfo.musicInfo?.id != endedSongId) return
          global.app_event.playerEnded()
          global.app_event.playerEmptied()
          // 直接触发自动切歌：后台时 Event 的 setImmediate 派发与 JS setTimeout 不可靠，
          // 不能依赖事件链；这里同步调用 playNext，并用 BackgroundTimer 兜底重试。
          void playNext(true)
          BackgroundTimer.setTimeout(() => {
            if (global.lx.isPlayedStop) return
            if (playerState.isPlay) return
            // 已切到下一首（或用户手动点了别的歌）则不再重试，避免双重切歌
            if (playerState.playMusicInfo.musicInfo?.id != endedSongId) return
            void playNext(true)
          }, 10_000)
        })
        break
      }
      case 'ERROR':
        global.app_event.error()
        global.app_event.playerError()
        // 照抄 Web 播放器：播放错误时丢弃坏缓存重新在线解析（多源轮询→降级→跨平台换源），
        // 连续失败自动切歌
        void handlePlaybackError(String(data.data ?? ''))
        break
    }
  })

  isInitialized = true

  // 状态回同步：JS 启动前原生可能已在播放（如蓝牙耳机按键在应用未打开时
  // 冷启动恢复了上次曲目），把真实状态同步给 JS，避免界面显示与实际不符
  void liuyinGetState().then((state) => {
    if (state != 'playing') return
    if (global.lx.gettingUrlId || global.lx.isChangingMusic) return
    global.lx.waitingForPlayback = false
    global.app_event.playerPlaying()
    global.app_event.play()
  })
}


export default () => {
  if (global.lx.playerStatus.isRegisteredService) return
  console.log('handle registerPlaybackService...')
  void registerPlaybackService()
  global.lx.playerStatus.isRegisteredService = true
}
