import { lxApi } from '@/plugins/lxserver'
import { musicInfoToLxServerJson } from '@/utils/songConvert'
import { overwriteListMusics, addListMusics, removeListMusics } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import serverState from '@/store/server/state'
import { getListMusics } from '@/utils/listManage'
import { AppState } from 'react-native'

interface FavoriteState {
  favoriteIds: Set<string>
  isLoading: boolean
  error: string | null
}

const state: FavoriteState = {
  favoriteIds: new Set(),
  isLoading: false,
  error: null,
}

// ---- 服务器收藏/列表同步（照抄 Web 播放器 refreshUserListData 的思路）----
let syncTimer: ReturnType<typeof setInterval> | null = null
let appStateSub: any = null
let isSyncing = false
let lastLocalWriteAt = 0

/** 本地刚写入过收藏（乐观更新），短时间内不让轮询结果覆盖 */
export const markLocalFavoriteWrite = () => {
  lastLocalWriteAt = Date.now()
}

const listsEqual = (a: LX.Music.MusicInfo[], b: LX.Music.MusicInfo[]) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
  }
  return true
}

/** 从服务器拉取收藏/默认歌单，有变化才覆盖本地（避免无意义刷新 UI） */
export const syncFavorites = async(): Promise<void> => {
  const config = serverState.activeConfig
  if (!config || !config.baseUrl) return
  if (isSyncing) return
  if (Date.now() - lastLocalWriteAt < 5000) return
  isSyncing = true
  const syncStartedAt = Date.now()
  try {
    const { loveList, defaultList } = await lxApi.getUserList()

    const loveSongs = loveList.map(lxServerJsonToMusicInfo)
    const currentLove = await getListMusics(LIST_IDS.LOVE)
    if (!listsEqual(currentLove, loveSongs)) {
      if (lastLocalWriteAt > syncStartedAt) return
      state.favoriteIds = new Set(loveSongs.map(s => s.id))
      // 服务器同步覆盖：标记 isRemote，避免播放器把"当前歌被覆盖移除"误判为用户删歌而自动跳歌
      await overwriteListMusics(LIST_IDS.LOVE, loveSongs, true)
    }

    const defaultSongs = defaultList.map(lxServerJsonToMusicInfo)
    const currentDefault = await getListMusics(LIST_IDS.DEFAULT)
    if (!listsEqual(currentDefault, defaultSongs)) {
      if (lastLocalWriteAt > syncStartedAt) return
      await overwriteListMusics(LIST_IDS.DEFAULT, defaultSongs, true)
    }
  } catch (err: any) {
    console.error('Failed to sync server lists:', err)
  } finally {
    isSyncing = false
  }
}

/** 启动收藏同步：60 秒轮询 + 回到前台立即同步 */
export const startFavoritesSync = () => {
  if (syncTimer) return
  syncTimer = setInterval(() => { void syncFavorites() }, 60_000)
  appStateSub = AppState.addEventListener('change', (appState) => {
    if (appState === 'active') void syncFavorites()
  })
}

export const loadFavorites = async(): Promise<void> => {
  state.isLoading = true
  state.error = null

  try {
    const { loveList } = await lxApi.getUserList()
    const songs = loveList.map(lxServerJsonToMusicInfo)

    state.favoriteIds = new Set(songs.map(s => s.id))

    // Update the love list in the store（服务器拉取覆盖，标记 isRemote 防误跳歌）
    await overwriteListMusics(LIST_IDS.LOVE, songs, true)
  } catch (err: any) {
    state.error = err.message ?? 'Failed to load favorites'
    console.error('Failed to load favorites:', err)
  } finally {
    state.isLoading = false
  }
}

const lxServerJsonToMusicInfo = (json: any): LX.Music.MusicInfoOnline => {
  const source = json.source || 'kw'
  const songId = json.meta?.songId ?? json.id
  return {
    id: json.id || `${source}_${songId}`,
    name: json.name,
    singer: json.singer,
    source,
    interval: json.interval ?? '',
    songmid: songId,
    albumId: json.meta?.albumId ?? '',
    albumName: json.meta?.albumName ?? '',
    img: json.meta?.picUrl ?? '',
    types: json.meta?.qualitys ?? [],
    _types: json.meta?._qualitys ?? {},
    typeUrl: {},
    meta: {
      songId,
      albumName: json.meta?.albumName ?? '',
      picUrl: json.meta?.picUrl ?? '',
      _qualitys: json.meta?._qualitys ?? {},
    },
  }
}

export const isFavorite = (songId: string): boolean => {
  return state.favoriteIds.has(songId)
}

export const toggleFavorite = async(musicInfo: LX.Music.MusicInfoOnline): Promise<boolean> => {
  const songId = musicInfo.id
  const wasFavorite = state.favoriteIds.has(songId)
  markLocalFavoriteWrite()

  // Optimistic update
  if (wasFavorite) {
    state.favoriteIds.delete(songId)
  } else {
    state.favoriteIds.add(songId)
  }

  try {
    if (wasFavorite) {
      // Remove from favorites
      await lxApi.userListRemove(LIST_IDS.LOVE, [songId])
      await removeListMusics(LIST_IDS.LOVE, [songId])
    } else {
      // Add to favorites
      const songJson = musicInfoToLxServerJson(musicInfo)
      await lxApi.userListAdd(LIST_IDS.LOVE, [songJson])
      await addListMusics(LIST_IDS.LOVE, [musicInfo], 'bottom')
    }

    return !wasFavorite
  } catch (err: any) {
    // Rollback on failure
    if (wasFavorite) {
      state.favoriteIds.add(songId)
    } else {
      state.favoriteIds.delete(songId)
    }

    state.error = err.message ?? 'Failed to toggle favorite'
    console.error('Failed to toggle favorite:', err)
    throw err
  }
}

export const getFavoriteIds = (): Set<string> => {
  return state.favoriteIds
}

export const getFavoriteState = (): FavoriteState => {
  return state
}
