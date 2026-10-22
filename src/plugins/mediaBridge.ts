import { NativeModules, NativeEventEmitter } from 'react-native'
import { play, pause, playNext, playPrev, stop, togglePlay } from '@/core/player/player'
import { setCurrentTime } from '@/plugins/player'

const { MediaBridge, LiuyinPlayer } = NativeModules

let initialized = false

const handleCommand = (data: { command: string, position: number }) => {
  console.log('MediaBridgeCommand:', data.command, data.position)
  switch (data.command) {
    case 'play':
      play()
      break
    case 'pause':
      void pause()
      break
    case 'playpause':
      togglePlay()
      break
    case 'stop':
      void stop()
      break
    case 'next':
      void playNext()
      break
    case 'prev':
      void playPrev()
      break
    case 'seekTo':
      setCurrentTime(data.position / 1000)
      break
  }
}

/**
 * 启动 Media3 MediaSessionService（锁屏媒体控件/系统媒体应用识别/通知栏媒体卡片）。
 * 元数据与播放状态由 Media3 基于播放器自动同步，无需手动。
 * 锁屏/通知栏的上一曲/下一曲由 LiuyinMediaService 转发到这里处理。
 */
export const initMediaBridge = () => {
  if (initialized) return
  initialized = true
  try {
    // 连接 MediaSessionService（触发前台服务 + 媒体通知，Media3 标准流程）
    if (LiuyinPlayer) {
      try { LiuyinPlayer.connect() } catch (err) { console.log('LiuyinPlayer.connect failed:', err) }
    }
    if (MediaBridge) {
      MediaBridge.start()
      const emitter = new NativeEventEmitter(MediaBridge)
      emitter.addListener('MediaBridgeCommand', handleCommand)
      // 告知原生「JS 已就绪」并原子地取回此前排队的命令。
      // 原生在此之前不会直接派发（事件会排队），避免监听器注册前的事件被静默丢弃；
      // 由原生在同一次调用里完成「标记就绪 + 排空」，保证不丢也不重复。
      try {
        MediaBridge.setJsReady().then((cmds: { command: string, position: number }[]) => {
          for (const cmd of cmds ?? []) handleCommand(cmd)
        }).catch((err: any) => console.log('setJsReady failed:', err))
      } catch (err) {
        console.log('setJsReady error:', err)
      }
    }
  } catch (err) {
    console.log('initMediaBridge failed:', err)
  }
}
