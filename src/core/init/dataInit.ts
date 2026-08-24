// import { getPlayInfo } from '@/utils/data'
// import { log } from '@/utils/log'
import { init as musicSdkInit } from '@/utils/musicSdk'
import { getUserLists, setUserList } from '@/core/list'
import { setNavActiveId } from '../common'
import { getViewPrevState } from '@/utils/data'
import { bootLog } from '@/utils/bootLog'
import { getDislikeInfo, setDislikeInfo } from '@/core/dislikeList'
import { unlink } from '@/utils/fs'
import { TEMP_FILE_PATH } from '@/utils/tools'
import { loadServerConfigs, loadActiveServerId } from '@/plugins/lxserver'
import { setConfigs, setActiveConfig, setConnected } from '@/store/server/action'
import { loadFavorites, startFavoritesSync } from '@/core/favorites'
// import { play, playList } from '../player/player'

// const initPrevPlayInfo = async(appSetting: LX.AppSetting) => {
//   const info = await getPlayInfo()
//   global.lx.restorePlayInfo = null
//   if (!info?.listId || info.index < 0) return
//   const list = await getListMusics(info.listId)
//   if (!list[info.index]) return
//   global.lx.restorePlayInfo = info
//   await playList(info.listId, info.index)

//   if (appSetting['player.startupAutoPlay']) setTimeout(play)
// }

export default async(appSetting: LX.AppSetting) => {
  // await Promise.all([
  //   initUserApi(), // 自定义API
  // ]).catch(err => log.error(err))
  void musicSdkInit() // 初始化音乐sdk
  bootLog('User list init...')
  setUserList(await getUserLists()) // 获取用户列表
  setDislikeInfo(await getDislikeInfo()) // 获取不喜欢列表
  bootLog('User list inited.')
  setNavActiveId((await getViewPrevState()).id)
  void unlink(TEMP_FILE_PATH)

  const [configs, activeId] = await Promise.all([
    loadServerConfigs(),
    loadActiveServerId(),
  ])
  if (configs.length) {
    setConfigs(configs)
    if (activeId && configs.some(c => c.id === activeId)) {
      setActiveConfig(activeId)
      setConnected(!!configs.find(c => c.id === activeId)?.token)
      void loadFavorites()
      // 启动服务器收藏同步：60 秒轮询 + 回前台立即刷新
      startFavoritesSync()
    }
  }
  bootLog('Server config inited.')
  // await initPrevPlayInfo(appSetting).catch(err => log.error(err)) // 初始化上次的歌曲播放信息
}
