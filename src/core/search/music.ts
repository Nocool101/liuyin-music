import searchMusicState, { type Source } from '@/store/search/music/state'
import searchMusicActions, { type SearchResult } from '@/store/search/music/action'
import { lxApi } from '@/plugins/lxserver'
import { LIST_IDS } from '@/config/constant'
import { getListMusicSync } from '@/utils/listManage'

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

// 服务端搜索结果 → 客户端歌曲对象（音质数据映射真实可用项，与收藏/歌单对齐）
const toMusicInfo = (item: any, sourceId: LX.OnlineSource): LX.Music.MusicInfoOnline => {
  const qualitys: Record<string, boolean> = {}
  for (const t of (item.types ?? [])) {
    const q = typeof t === 'string' ? t : t?.type
    if (typeof q === 'string' && q) qualitys[q] = true
  }
  for (const [q, v] of Object.entries(item._types ?? {})) {
    if (v) qualitys[q] = true
  }
  return {
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
    _types: Object.keys(qualitys).length ? qualitys : (item._types ?? {}),
    typeUrl: item.typeUrl ?? {},
    meta: {
      songId: item.songmid,
      albumName: item.albumName ?? '',
      picUrl: item.img ?? '',
      _qualitys: qualitys,
    },
  } as unknown as LX.Music.MusicInfoOnline
}

// 聚合搜索（"聚合大会"）：客户端并行请求各音源，避免服务端聚合接口被最慢音源拖住。
// 每源限时，结果渐进回调（onPartial）——先到的先展示，慢源/坏源超时丢弃，不拖整体。
const AGG_SOURCES: Source[] = ['kw', 'wy', 'mg', 'kg', 'tx']
const AGG_PER_SOURCE_LIMIT = 15
const AGG_PER_SOURCE_TIMEOUT = 2_500

const searchAggregate = async(
  text: string,
  page: number,
  onPartial?: (songs: LX.Music.MusicInfoOnline[]) => void,
): Promise<{ songs: LX.Music.MusicInfoOnline[], hasMore: boolean }> => {
  const seen = new Set<string>()
  const merged: LX.Music.MusicInfoOnline[] = []
  const emit = (source: Source, items: any[]) => {
    for (const item of items) {
      if (!item?.songmid) continue
      const id = `${source}_${item.songmid}`
      if (seen.has(id)) continue
      seen.add(id)
      merged.push(toMusicInfo(item, source as LX.OnlineSource))
    }
    onPartial?.([...merged])
  }

  // 本地（收藏/默认列表）匹配结果置顶，立即回调
  const query = text.toLowerCase()
  if (query) {
    const localSongs = ([...getListMusicSync(LIST_IDS.LOVE), ...getListMusicSync(LIST_IDS.DEFAULT)]
      .filter(m => m.source != 'local' && (
        m.name.toLowerCase().includes(query) || m.singer.toLowerCase().includes(query)
      ))
      .slice(0, 10)) as LX.Music.MusicInfoOnline[]
    for (const m of localSongs) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      merged.push(m)
    }
    onPartial?.([...merged])
  }

  const sourceLists = await Promise.all(AGG_SOURCES.map(async source => {
    try {
      const items = await lxApi.searchRaw(source, text, page, AGG_PER_SOURCE_LIMIT, AGG_PER_SOURCE_TIMEOUT)
      emit(source, items)
      return items
    } catch {
      return []
    }
  }))

  // 任一音源返回满页说明还有下一页，允许继续加载更多
  return { songs: merged, hasMore: sourceLists.some(items => items.length >= AGG_PER_SOURCE_LIMIT) }
}

export const search = async(text: string, page: number, sourceId: Source, onPartial?: (songs: LX.Music.MusicInfoOnline[]) => void): Promise<LX.Music.MusicInfoOnline[]> => {
  const listInfo = searchMusicState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${text}`

  if (sourceId == 'all') {
    listInfo.key = key
    try {
      const { songs, hasMore } = await searchAggregate(text, page, onPartial)

      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo({ list: songs, total: songs.length, limit: 30, page, source: 'all', allPage: hasMore ? page + 1 : page }, page, text)
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
      const songs = result.list.map((item: any) => toMusicInfo(item, sourceId as LX.OnlineSource))

      if (key != listInfo.key) return []
      return setListInfo({ list: songs, total: result.total, limit: result.limit, page, source: sourceId, allPage: Math.ceil(result.total / (result.limit || 1)) || 1 }, page, text)
    } catch (err: any) {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    }
  }
}
