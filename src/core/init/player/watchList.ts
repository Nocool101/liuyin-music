import { playNext } from '@/core/player/player'
import { updatePlayIndex } from '@/core/player/playInfo'
import { throttleBackgroundTimer } from '@/utils/tools'
import playerState from '@/store/player/state'

const changedListIds = new Set<string | null>()
// 节流窗口内是否有本地发起的列表变更（远程同步覆盖不触发自动跳歌）
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
      // 远程同步（服务器列表覆盖）把当前歌"移除"不是用户意图，不能自动跳歌：
      // 搜索点歌只写本地默认列表，会被收藏同步的服务器列表覆盖，
      // 若据此切歌，表现为歌曲播放一分钟左右就跳到无关歌曲
      if (!isLocalChange || playerState.playMusicInfo.isTempPlay) return
      // console.log('current music removed')
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
