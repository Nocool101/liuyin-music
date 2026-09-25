import { playNext } from '@/core/player/player'
import { updatePlayIndex } from '@/core/player/playInfo'
import { throttleBackgroundTimer } from '@/utils/tools'
import playerState from '@/store/player/state'

const changedListIds = new Set<string | null>()
// 节流窗口内是否发生了本地列表变更；服务器覆盖不应被当作用户删歌。
let hasLocalChange = false

export default () => {
  const throttleListChange = throttleBackgroundTimer(() => {
    // 只关心"当前播放歌曲所属列表"的变更：
    // playerListId 可能已被新播放覆盖（如排行榜点歌先把 temp 列表写入再播放），
    // 若拿它做判断，会把"当前歌不在新列表"误判为歌曲被移除而自动跳歌
    const isSkip = !changedListIds.has(playerState.playMusicInfo.listId)
    const isLocalChange = hasLocalChange
    changedListIds.clear()
    hasLocalChange = false
    if (isSkip) return

    const { playIndex } = updatePlayIndex()
    if (playIndex < 0) { // 歌曲被移除
      // 远程同步覆盖导致的"歌曲消失"不是用户删歌意图，不自动跳歌。
      if (!isLocalChange || playerState.playMusicInfo.isTempPlay) return
      void playNext(true)
    }
  })

  const handleListChange = (listIds: string[], isRemote: boolean = false) => {
    if (!isRemote) hasLocalChange = true
    for (const id of listIds) {
      changedListIds.add(id)
    }
    throttleListChange()
  }

  const handleDownloadListChange = () => {
    handleListChange(['download'])
  }

  global.app_event.on('myListMusicUpdate', handleListChange)
  global.app_event.on('downloadListUpdate', handleDownloadListChange)
}
