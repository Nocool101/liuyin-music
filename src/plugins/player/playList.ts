import BackgroundTimer from 'react-native-background-timer'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import {
  liuyinLoad,
  liuyinPause,
  liuyinPlay,
  liuyinSeekTo,
} from './liuyinPlayer'

const httpRxp = /^(https?:\/\/.+|\/.+)/

export const state = {
  isPlaying: false,
  prevDuration: -1,
}

// 当前播放曲目信息（单曲模型）
let currentMusicInfo: LX.Player.MusicInfo | null = null

const formatMusicInfo = (musicInfo: LX.Player.PlayMusic) => {
  return 'progress' in musicInfo ? {
    id: musicInfo.id,
    pic: musicInfo.metadata.musicInfo.meta.picUrl,
    name: musicInfo.metadata.musicInfo.name,
    singer: musicInfo.metadata.musicInfo.singer,
    album: musicInfo.metadata.musicInfo.meta.albumName,
  } : {
    id: musicInfo.id,
    pic: musicInfo.meta.picUrl,
    name: musicInfo.name,
    singer: musicInfo.singer,
    album: musicInfo.meta.albumName,
  }
}

const getCurrentFullLyric = (targetId: string | null) => {
  return (settingState.setting['player.isShowBluetoothFullLyric'] && targetId &&
      playerState.musicInfo.id == targetId && playerState.musicInfo.lrc)
    ? playerState.musicInfo.lrc
    : undefined
}

export const isTempTrack = (trackId: string) => false

export const getCurrentTrackId = async() => {
  return global.lx.playerTrackId || null
}
export const getCurrentTrack = async() => {
  return currentMusicInfo
}

export const initTrackInfo = async(musicInfo: LX.Player.PlayMusic, mInfo: LX.Player.MusicInfo) => {
  // 恢复播放：不加载音频（等用户点播放），仅记录曲目信息
  currentMusicInfo = mInfo
  global.lx.playerTrackId = ''
  delayUpdateMusicInfo(mInfo)
}

const handlePlayMusic = async(musicInfo: LX.Player.PlayMusic, url: string, time: number) => {
  const mInfo = formatMusicInfo(musicInfo)
  const durationMs = (musicInfo as any).duration ?? 0
  currentMusicInfo = mInfo as LX.Player.MusicInfo
  global.lx.playerTrackId = musicInfo.id
  global.lx.waitingForPlayback = true
  try {
    if (time > 0) {
      liuyinLoad(url, mInfo.name ?? 'Unknow', mInfo.singer ?? 'Unknow', mInfo.album ?? '', mInfo.pic ?? '', durationMs * 1000, time * 1000)
    } else {
      liuyinLoad(url, mInfo.name ?? 'Unknow', mInfo.singer ?? 'Unknow', mInfo.album ?? '', mInfo.pic ?? '', durationMs * 1000, 0)
    }
  } catch (err) {
    console.error(err)
  }
  delayUpdateMusicInfo(mInfo as LX.Player.MusicInfo)
}

let playPromise = Promise.resolve()
let actionId = Math.random()
export const playMusic = (musicInfo: LX.Player.PlayMusic, url: string, time: number) => {
  const id = actionId = Math.random()
  void playPromise.finally(() => {
    if (id != actionId) return
    playPromise = handlePlayMusic(musicInfo, url, time)
  })
}

let prevArtwork: string | undefined
const updateMetaInfo = async(mInfo: LX.Player.MusicInfo) => {
  // 通知栏/锁屏元数据由 Media3 在 load 时自动设置
  if (mInfo.pic) prevArtwork = mInfo.pic
}

const debounceUpdateMetaInfoTools = {
  updateMetaPromise: Promise.resolve(),
  musicInfo: null as LX.Player.MusicInfo | null,
  debounce(fn: (musicInfo: LX.Player.MusicInfo) => void | Promise<void>) {
    let isDelayRun = false
    let timer: number | null = null
    let _musicInfo: LX.Player.MusicInfo | null = null
    return (musicInfo: LX.Player.MusicInfo) => {
      if (timer) {
        BackgroundTimer.clearTimeout(timer)
        timer = null
      }
      if (isDelayRun) {
        _musicInfo = musicInfo
        timer = BackgroundTimer.setTimeout(() => {
          timer = null
          let musicInfo = _musicInfo
          _musicInfo = null
          if (!musicInfo) return
          void fn(musicInfo)
        }, 500)
      } else {
        isDelayRun = true
        void fn(musicInfo)
        BackgroundTimer.setTimeout(() => {
          isDelayRun = false
        }, 500)
      }
    }
  },
  init() {
    return this.debounce(async(musicInfo: LX.Player.MusicInfo) => {
      this.musicInfo = musicInfo
      return this.updateMetaPromise.then(() => {
        if (this.musicInfo?.id === musicInfo.id) {
          this.updateMetaPromise = updateMetaInfo(musicInfo)
        }
      })
    })
  },
}

export const delayUpdateMusicInfo = debounceUpdateMetaInfoTools.init()

export { liuyinPause, liuyinPlay, liuyinSeekTo }
