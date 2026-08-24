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
      // 拉取监听器注册前原生排队中的锁屏命令，避免事件丢失
      try {
        MediaBridge.drainMediaCommands().then((cmds: { command: string, position: number }[]) => {
          for (const cmd of cmds ?? []) handleCommand(cmd)
        }).catch((err: any) => console.log('drainMediaCommands failed:', err))
      } catch (err) {
        console.log('drainMediaCommands error:', err)
      }
    }
  } catch (err) {
    console.log('initMediaBridge failed:', err)
  }
}
