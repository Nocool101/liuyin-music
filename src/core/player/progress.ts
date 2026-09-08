import playerActions from '@/store/player/action'

// 最近一次成功从播放器采样到播放位置的时间戳（毫秒）。
// 用于 ENDED 事件校验时判断 nowPlayTime 是否"新鲜"：
// 进度轮询在屏幕熄灭/暂停时会停止，此时 nowPlayTime 是冻结的旧值，不可信。
let lastProgressSampleAt = 0

export const markProgressSampled = () => {
  lastProgressSampleAt = Date.now()
}

export const getProgressSampleTime = () => lastProgressSampleAt

export const setNowPlayTime = (time: number) => {
  playerActions.setNowPlayTime(time)
}

export const setMaxplayTime = (time: number) => {
  playerActions.setMaxplayTime(time)
}

export const setProgress = (currentTime: number, totalTime: number) => {
  playerActions.setProgress(currentTime, totalTime)
}

