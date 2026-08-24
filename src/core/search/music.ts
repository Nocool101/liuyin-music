import searchMusicState, { type Source } from '@/store/search/music/state'
import searchMusicActions, { type SearchResult } from '@/store/search/music/action'
import { subsonic } from '@/plugins/subsonic'
import { lxApi } from '@/plugins/lxserver'
import { subsonicSongToMusicInfo } from '@/utils/songConvert'

export const setSource: typeof searchMusicActions['setSource'] = (source) => {
  searchMusicActions.setSource(source)
}
export const setSearchText: typeof searchMusicActions['setSearchText'] = (text) => {
  searchMusicActions.setSearchText(text)
}
export const setListInfo: typeof searchMusicActions.setListInfo = (result, id, page) => {
  return searchMusicActions.setListInfo(result, id, page)
}

export const clearListInfo: typeof searchMusicActions.clearListInfo = (source) => {
  searchMusicActions.clearListInfo(source)
}


export const search = async(text: string, page: number, sourceId: Source): Promise<LX.Music.MusicInfoOnline[]> => {
  const listInfo = searchMusicState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${text}`

  if (sourceId == 'all') {
    listInfo.key = key
    try {
      // Use Subsonic search for all sources
      const result = await subsonic.search(text, 10, 10, 50)
      const songs = result.song.map(subsonicSongToMusicInfo)

      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo({ list: songs, total: songs.length, limit: 50, page, source: 'all', allPage: Math.ceil(songs.length / 50) || 1 }, page, text)
    } catch (error: any) {
      console.log(error)
      return []
    }
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    listInfo.key = key

    try {
      // Use internal API for specific source search
      const result = await lxApi.search(sourceId, text, 'song', page, listInfo.limit)
      const songs = result.list.map((item: any) => ({
        id: `${sourceId}_${item.songmid}`,
        name: item.name,
        singer: item.singer,
        source: sourceId,
        interval: item.interval ?? '',
        songmid: item.songmid,
        albumId: item.albumId,
        albumName: item.albumName ?? '',
        img: item.img ?? '',
        types: item.types ?? [],
        _types: item._types ?? {},
        typeUrl: item.typeUrl ?? {},
        meta: {
          songId: item.songmid,
          albumName: item.albumName ?? '',
          picUrl: item.img ?? '',
          _qualitys: {
            '128k': true,
            '320k': false,
            'flac': false,
          },
        },
      }))

      if (key != listInfo.key) return []
      return setListInfo({ list: songs, total: result.total, limit: result.limit, page, source: sourceId, allPage: Math.ceil(result.total / (result.limit || 1)) || 1 }, page, text)
    } catch (err: any) {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    }
  }
}

