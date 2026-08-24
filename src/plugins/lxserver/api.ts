import serverState from '@/store/server/state'
import { saveServerConfigs } from './storage'

const TIMEOUT = 30000

const fetchWithTimeout = async(url: string, options: RequestInit = {}, timeout = TIMEOUT): Promise<Response> => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(id)
  }
}

const getBaseUrl = (): string => {
  const config = serverState.activeConfig
  if (!config) throw new Error('No active server config')
  return config.baseUrl.replace(/\/+$/, '')
}

const getToken = (): string => {
  const config = serverState.activeConfig
  if (!config?.token) throw new Error('No active server token')
  return config.token
}

export interface SongListTag {
  id: string
  name: string
  category: string
}

export interface SongListItem {
  id: string
  name: string
  cover: string
  playCount: number
  creator: string
  description: string
}

export interface SongListDetail {
  id: string
  name: string
  cover: string
  creator: string
  description: string
  songs: any[]
}

export interface LeaderboardItem {
  id: string
  name: string
  description: string
}

export interface HotSearchItem {
  keyword: string
  score: number
}

export interface SearchResult {
  list: any[]
  total: number
  limit: number
  page: number
  pages: number
}

// 内部 API 认证头（对应 Web 播放器 getUserAuthHeaders：x-user-name + x-user-token）
const getAuthHeaders = (): Record<string, string> => {
  const config = serverState.activeConfig
  if (!config) return {}
  const headers: Record<string, string> = { 'x-user-name': config.username }
  if (config.token) {
    headers['x-user-token'] = config.token
  } else {
    headers['x-user-password'] = config.password
  }
  return headers
}

export interface MusicUrlResult {
  url: string
  type: string
  sourceName?: string
  error?: string
}

// 音乐链接解析（照抄 Web 播放器 fetchSongUrl 的核心通道）：
// POST /api/music/url，服务端对该平台的所有自定义源逐个尝试（多源轮询），
// 并携带完整 songInfo（meta.strMediaMid/hash/copyrightId 等由服务端展开）。
export const getMusicUrl = async(songInfo: any, quality: string): Promise<MusicUrlResult> => {
  const url = `${getBaseUrl()}/api/music/url`
  const doRequest = async() => {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        songInfo,
        quality,
        enableAutoSwitchApiSource: true,
      }),
    })
    if (!response.ok) {
      // 附带服务器错误详情，便于定位（如音源脚本的具体报错）
      let detail = ''
      try {
        detail = (await response.text()).slice(0, 300)
      } catch { /* ignore */ }
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return response.json()
  }

  let data: any
  try {
    data = await doRequest()
  } catch (err: any) {
    // Token 过期（7 天）时自动重新登录并重试一次（对应 Web 播放器的重新登录逻辑）
    if (err.message?.startsWith('HTTP 401') && serverState.activeConfig?.password) {
      const config = serverState.activeConfig
      try {
        const loginRes = await fetchWithTimeout(`${getBaseUrl()}/api/user/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: config.username, password: config.password }),
        })
        const loginData: any = await loginRes.json()
        if (loginData.success && loginData.token) {
          config.token = loginData.token
          void saveServerConfigs([...serverState.configs]).catch(() => {})
          data = await doRequest()
        } else {
          throw err
        }
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }

  if (!data?.url) throw new Error(data?.error ?? '服务器未返回播放链接')
  return data
}

// URL 可用性探测（照抄 Web 播放器 applyAutoProxy 的 probe：Range 轻量探测）。
// 关键：必须带浏览器 UA——多数音乐 CDN 对非浏览器 UA（RN fetch 的 okhttp 风格）返回 403，
// 不带浏览器 UA 会把"实际可用"的链接误判为不可用。
// 超时 8 秒：服务器代理转发需要时间（服务器→CDN + 返回），3 秒会误判。
export const probeUrl = async(url: string, timeout = 8000): Promise<boolean> => {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Range: 'bytes=0-1',
        },
        signal: controller.signal,
      })
      return res.ok
    } finally {
      clearTimeout(id)
    }
  } catch {
    return false
  }
}

// 服务器代理播放地址（照抄 Web 播放器对受限链接的兜底）：
// 客户端无法直接访问的 CDN 链接（IP 封锁/Referer 校验/运营商限制）经服务器转发，
// 服务器端带浏览器 UA + Referer，支持 Range 透传。
export const getProxiedStreamUrl = (url: string, filename: string): string => {
  return `${getBaseUrl()}/api/music/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&inline=1`
}

// 原始搜索结果（保留 strMediaMid/hash/copyrightId 等关键字段，用于跨平台换源解析）
export const searchRaw = async(source: string, query: string, page = 1, limit = 20, timeout = 8000): Promise<any[]> => {
  const url = `${getBaseUrl()}/api/music/search?name=${encodeURIComponent(query)}&source=${source}&type=song&page=${page}&limit=${limit}`
  const response = await fetchWithTimeout(url, {}, timeout)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: any = await response.json()
  return Array.isArray(data) ? data : (data.list ?? [])
}

// ---- 跨平台换源匹配（照抄 Web 播放器 findOtherSourceMatches + getSongMatchScore）----

const normalizeMatchText = (value: string) => String(value || '')
  .toLowerCase()
  .replace(/[（(].*?[）)]/g, '')
  .replace(/[\s·・,，.。!！?？:：;；'"‘’“”《》<>【】[\]()（）\-_/\\]/g, '')

const timeToSeconds = (timeStr: string | null | undefined): number => {
  if (!timeStr || !timeStr.includes(':')) return 0
  const parts = timeStr.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return 0
}

const isSingerMatch = (sourceSinger: string, targetSinger: string): boolean => {
  const sourceText = normalizeMatchText(sourceSinger)
  const targetText = normalizeMatchText(targetSinger)
  if (!targetText) return true
  if (!sourceText) return false
  if (sourceText.includes(targetText) || targetText.includes(sourceText)) return true
  const split = (v: string) => String(v || '').toLowerCase().split(/[、,/&;；\s]+/).filter(Boolean)
  const sourceSingers = split(sourceText)
  const targetSingers = split(targetText)
  return targetSingers.every(ts => sourceSingers.some(ss => ss.includes(ts) || ts.includes(ss)))
}

const getSongMatchScore = (item: any, song: any): number => {
  const targetName = normalizeMatchText(song.name)
  const itemName = normalizeMatchText(item.name)
  if (!targetName || !itemName) return -1
  if (!itemName.includes(targetName) && !targetName.includes(itemName)) return -1
  if (!isSingerMatch(item.singer, song.singer)) return -1

  const targetDuration = timeToSeconds(song.interval)
  const itemDuration = timeToSeconds(item.interval)
  let durationScore = 0
  if (targetDuration > 0 && itemDuration > 0) {
    const durationDiff = Math.abs(targetDuration - itemDuration)
    if (durationDiff > 8) return -1
    durationScore = 8 - durationDiff
  }

  let nameScore = 0
  if (itemName === targetName) nameScore = 20
  else if (itemName.includes(targetName) || targetName.includes(itemName)) nameScore = 10

  const songAlbum = song.meta?.albumName ?? song.albumName
  const sameAlbum = item.albumName && songAlbum && normalizeMatchText(item.albumName) === normalizeMatchText(songAlbum)
  return nameScore + durationScore + (sameAlbum ? 3 : 0)
}

// 在其它平台搜索同一首歌（优先级：网易、QQ、酷我、酷狗、咪咕，排除当前源），
// 返回匹配度最高的原始搜索项（含 source/songmid/strMediaMid 等完整字段）
export const findOtherSourceMatch = async(song: {
  name: string
  singer: string
  source: string
  interval?: string | null
  meta?: any
}): Promise<any | null> => {
  if (!song.name || !song.singer) return null

  const baseOrder = ['wy', 'tx', 'kw', 'kg', 'mg']
  const searchSources = baseOrder.filter(s => s !== song.source)
  if (!searchSources.length) return null

  const query = `${song.name} ${song.singer}`
  const allResults = await Promise.all(searchSources.map(s =>
    searchRaw(s, query, 1, 20).catch(() => []),
  ))

  const matches: any[] = []
  allResults.forEach((list, i) => {
    const source = searchSources[i]
    for (const item of list) {
      const score = getSongMatchScore(item, song)
      if (score < 0) continue
      matches.push({ ...item, source, _matchScore: score })
    }
  })

  if (!matches.length) return null
  matches.sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0))
  return matches[0]
}

// Search API (public, no auth)
export const search = async(source: string, query: string, type: 'song' | 'singer' | 'album' | 'playlist' = 'song', page = 1, limit = 30): Promise<SearchResult> => {
  const url = `${getBaseUrl()}/api/music/search?name=${encodeURIComponent(query)}&source=${source}&type=${type}&page=${page}&limit=${limit}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: any = await response.json()
  const list = Array.isArray(data) ? data : (data.list ?? [])
  return { list, total: list.length, limit, page, pages: 1 }
}

export const tipSearch = async(source: string, query: string): Promise<string[]> => {
  const url = `${getBaseUrl()}/api/music/tipSearch?name=${encodeURIComponent(query)}&source=${source}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: any = await response.json()
  return Array.isArray(data) ? data : []
}

export const hotSearch = async(source: string = 'mg'): Promise<{ source: string, list: string[] }> => {
  const url = `${getBaseUrl()}/api/music/hotSearch?source=${source}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: any = await response.json()
  return {
    source,
    list: Array.isArray(data) ? data : ((data as any).list ?? []),
  }
}

// Songlist API (public, no auth)
export const songListTags = async(source: string = 'wy'): Promise<any> => {
  const url = `${getBaseUrl()}/api/music/songList/tags?source=${source}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: any = await response.json()
  if (data?.error) throw new Error(data.error)
  return data
}

export const songListList = async(source: string, tagId: string, sortId: string = 'hot', page = 1): Promise<{ list: SongListItem[], total: number }> => {
  const url = `${getBaseUrl()}/api/music/songList/list?source=${source}&tagId=${encodeURIComponent(tagId)}&sortId=${sortId}&page=${page}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const songListDetail = async(source: string, id: string, page = 1): Promise<SongListDetail> => {
  const url = `${getBaseUrl()}/api/music/songList/detail?source=${source}&id=${encodeURIComponent(id)}&page=${page}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const songListSearch = async(source: string, text: string, page = 1): Promise<{ list: SongListItem[], total: number }> => {
  const url = `${getBaseUrl()}/api/music/songList/search?source=${source}&text=${encodeURIComponent(text)}&page=${page}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

// Leaderboard API (public, no auth)
export const leaderboardBoards = async(source: string = 'kg'): Promise<LeaderboardItem[]> => {
  const url = `${getBaseUrl()}/api/music/leaderboard/boards?source=${source}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const leaderboardList = async(source: string, bangid: string, page = 1): Promise<{ list: any[], total: number }> => {
  const url = `${getBaseUrl()}/api/music/leaderboard/list?source=${source}&bangid=${encodeURIComponent(bangid)}&page=${page}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

// User List API (requires token)
export const userListAdd = async(listId: string, musicInfos: any[], location: 'top' | 'bottom' = 'bottom'): Promise<void> => {
  const url = `${getBaseUrl()}/api/music/user/list/add`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': getToken(),
    },
    body: JSON.stringify({ listId, musicInfos, location }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

export const userListRemove = async(listId: string, songIds: string[]): Promise<void> => {
  const url = `${getBaseUrl()}/api/music/user/list/remove`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': getToken(),
    },
    body: JSON.stringify({ listId, songIds }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

// User List Full API (for full read/write)
export const getUserList = async(): Promise<{ defaultList: any[], loveList: any[], userList: any[] }> => {
  const config = serverState.activeConfig
  if (!config) throw new Error('No active server config')

  const url = `${getBaseUrl()}/api/user/list?user=${encodeURIComponent(config.username)}`
  const response = await fetchWithTimeout(url, {
    headers: {
      'x-user-token': getToken(),
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const overwriteUserList = async(data: { defaultList: any[], loveList: any[], userList: any[] }): Promise<void> => {
  const config = serverState.activeConfig
  if (!config) throw new Error('No active server config')

  const url = `${getBaseUrl()}/api/user/list?user=${encodeURIComponent(config.username)}`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': getToken(),
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

// Lyrics API (public, no auth)
export const getLyric = async(source: string, songmid: string, name?: string, singer?: string): Promise<{ lyric: string, tlyric: string, rlyric: string, lxlyric: string }> => {
  const params = new URLSearchParams({ source, songmid })
  if (name) params.set('name', name)
  if (singer) params.set('singer', singer)

  const url = `${getBaseUrl()}/api/music/lyric?${params.toString()}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
