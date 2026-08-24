import { lxApi } from '@/plugins/lxserver'

const sources = {
  sources: [
    { name: '酷我音乐', id: 'kw' },
    { name: '酷狗音乐', id: 'kg' },
    { name: 'QQ音乐', id: 'tx' },
    { name: '网易音乐', id: 'wy' },
    { name: '咪咕音乐', id: 'mg' },
  ],
}

const createSource = (id) => ({
  id,
  musicSearch: {
    search: async(text, page = 1, limit = 30) => {
      const result = await lxApi.search(id, text, 'song', page, limit)
      return {
        source: id,
        list: result.list,
        total: result.total,
        limit: result.limit,
        page,
        allPage: Math.ceil(result.total / (result.limit || 1)) || 1,
      }
    },
  },
  tipSearch: {
    search: async(keyword) => {
      return lxApi.tipSearch(id, keyword)
    },
  },
  songList: {
    sortList: [
      { name: '最热', id: 'hot', tid: 'hot' },
      { name: '最新', id: 'new', tid: 'new' },
    ],
    getTags: async() => {
      return lxApi.songListTags(id)
    },
    getList: async(sortId, tagId, page = 1) => {
      const result = await lxApi.songListList(id, tagId, sortId, page)
      return {
        ...result,
        page,
        maxPage: Math.ceil(result.total / 30) || 1,
        limit: 30,
        source: id,
      }
    },
    getListDetail: async(listId, page = 1) => {
      const result = await lxApi.songListDetail(id, listId, page)
      return {
        ...result,
        page,
        maxPage: Math.ceil(result.total / 30) || 1,
        limit: 30,
        source: id,
      }
    },
    search: async(text, page = 1) => {
      const result = await lxApi.songListSearch(id, text, page)
      return {
        ...result,
        page,
        maxPage: Math.ceil(result.total / 30) || 1,
        limit: 30,
        source: id,
      }
    },
  },
  leaderboard: {
    getBoards: async() => {
      return lxApi.leaderboardBoards(id)
    },
    getList: async(bangid, page = 1) => {
      const result = await lxApi.leaderboardList(id, bangid, page)
      return {
        ...result,
        page,
        maxPage: Math.ceil(result.total / 30) || 1,
        limit: 30,
        source: id,
      }
    },
  },
  hotSearch: {
    getList: async() => {
      return lxApi.hotSearch(id)
    },
  },
})

const sourceMap = {}
for (const s of sources.sources) {
  sourceMap[s.id] = createSource(s.id)
}

export default {
  ...sources,
  ...sourceMap,
  supportQuality: {
    kw: ['128k', '320k', 'flac'],
    kg: ['128k', '320k', 'flac'],
    tx: ['128k', '320k', 'flac'],
    wy: ['128k', '320k', 'flac'],
    mg: ['128k', '320k', 'flac'],
  },
}

export const init = () => Promise.resolve()

export const searchMusic = async({ name, singer, source: s, limit = 25 }) => {
  try {
    const result = await lxApi.search(s || 'wy', `${name} ${singer || ''}`.trim(), 'song', 1, limit)
    return [{ list: result.list || [], source: s || 'wy' }]
  } catch {
    return []
  }
}

export const findMusic = async(musicInfo) => {
  const { name, singer, source: s } = musicInfo
  const lists = await searchMusic({ name, singer, source: s, limit: 25 })
  return lists.length ? lists[0].list : []
}
