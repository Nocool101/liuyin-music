import serverState from '@/store/server/state'

interface SubsonicResponse {
  'subsonic-response': {
    status: string
    version: string
    error?: {
      code: number
      message: string
    }
    [key: string]: any
  }
}

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

const getAuthParams = (): string => {
  const config = serverState.activeConfig
  if (!config) throw new Error('No active server config')
  const encodedPassword = `enc:${Buffer.from(config.password).toString('hex')}`
  return `u=${encodeURIComponent(config.username)}&p=${encodeURIComponent(encodedPassword)}&v=1.16.1&c=liuyin&f=json`
}

const parseResponse = async<T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data: SubsonicResponse = await response.json()
  if (data['subsonic-response'].status !== 'ok') {
    throw new Error(data['subsonic-response'].error?.message ?? 'Unknown error')
  }

  return data['subsonic-response'] as T
}

export interface SubsonicSong {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  coverArt: string
  bitRate: number
  suffix: string
  track: number
  year: number
  genre: string
}

export interface SubsonicAlbum {
  id: string
  name: string
  artist: string
  artistId: string
  coverArt: string
  songCount: number
  duration: number
  year: number
  genre: string
  song?: SubsonicSong[]
}

export interface SubsonicArtist {
  id: string
  name: string
  coverArt: string
  albumCount: number
  album?: SubsonicAlbum[]
}

export interface SearchResult {
  song: SubsonicSong[]
  album: SubsonicAlbum[]
  artist: SubsonicArtist[]
}

export interface LyricInfo {
  lyric: string
  tlyric: string
  rlyric: string
  lxlyric: string
}

export const search = async(query: string, artistCount = 10, albumCount = 10, songCount = 25): Promise<SearchResult> => {
  const url = `${getBaseUrl()}/rest/search3?${getAuthParams()}&query=${encodeURIComponent(query)}&artistCount=${artistCount}&albumCount=${albumCount}&songCount=${songCount}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)

  return {
    song: data.searchResult3?.song ?? [],
    album: data.searchResult3?.album ?? [],
    artist: data.searchResult3?.artist ?? [],
  }
}

export const getStreamUrl = (songId: string, maxBitRate?: number): string => {
  const params = maxBitRate == null ? '' : `&maxBitRate=${maxBitRate}`
  return `${getBaseUrl()}/rest/stream?${getAuthParams()}&id=${encodeURIComponent(songId)}${params}`
}

export const getCoverArtUrl = (coverArtId: string, size?: number): string => {
  const params = size ? `&size=${size}` : ''
  return `${getBaseUrl()}/rest/getCoverArt?${getAuthParams()}&id=${encodeURIComponent(coverArtId)}${params}`
}

export const getLyrics = async(songId: string): Promise<LyricInfo> => {
  try {
    const url = `${getBaseUrl()}/rest/getLyricsBySongId?${getAuthParams()}&id=${encodeURIComponent(songId)}`
    const response = await fetchWithTimeout(url)
    const data = await parseResponse<any>(response)

    const lyrics = data.lyricsList?.structuredLyrics ?? data.lyricsBySongId?.structuredLyrics ?? []
    let lyric = ''
    let tlyric = ''
    let rlyric = ''
    let lxlyric = ''

    const formatLine = (line: any): string => {
      if (typeof line.start !== 'number' || line.start < 0) return ''
      const minutes = Math.floor(line.start / 60000)
      const seconds = Math.floor((line.start % 60000) / 1000)
      const centis = Math.floor((line.start % 1000) / 10)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `[${pad(minutes)}:${pad(seconds)}.${pad(centis)}]${line.value ?? ''}`
    }

    for (const l of lyrics) {
      if (l.lang === 'zxx' || l.lang === '') {
        // Original lyrics
        lyric = l.line?.map(formatLine).filter((s: string) => s).join('\n') ?? ''
      } else if (l.lang === 'zh') {
        // Chinese translation
        tlyric = l.line?.map(formatLine).filter((s: string) => s).join('\n') ?? ''
      }
    }

    // If no structured lyrics, try to get LRC format
    if (!lyric) {
      const lrcUrl = `${getBaseUrl()}/rest/getLyrics?${getAuthParams()}&id=${encodeURIComponent(songId)}`
      const lrcResponse = await fetchWithTimeout(lrcUrl)
      const lrcData = await parseResponse<any>(lrcResponse)
      lyric = lrcData.lyrics?.value ?? ''
    }

    return { lyric, tlyric, rlyric, lxlyric }
  } catch (err) {
    console.error('Failed to get lyrics:', err)
    return { lyric: '', tlyric: '', rlyric: '', lxlyric: '' }
  }
}

export const getAlbum = async(albumId: string): Promise<SubsonicAlbum> => {
  const url = `${getBaseUrl()}/rest/getAlbum?${getAuthParams()}&id=${encodeURIComponent(albumId)}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)
  return data.album
}

export const getArtist = async(artistId: string): Promise<SubsonicArtist> => {
  const url = `${getBaseUrl()}/rest/getArtist?${getAuthParams()}&id=${encodeURIComponent(artistId)}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)
  return data.artist
}

export const getStarred = async(): Promise<{ song: SubsonicSong[], album: SubsonicAlbum[], artist: SubsonicArtist[] }> => {
  const url = `${getBaseUrl()}/rest/getStarred2?${getAuthParams()}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)

  return {
    song: data.starred2?.song ?? [],
    album: data.starred2?.album ?? [],
    artist: data.starred2?.artist ?? [],
  }
}

export const getRandomSongs = async(size = 50): Promise<SubsonicSong[]> => {
  const url = `${getBaseUrl()}/rest/getRandomSongs?${getAuthParams()}&size=${size}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)
  return data.randomSongs?.song ?? []
}

export const getSong = async(songId: string): Promise<SubsonicSong> => {
  const url = `${getBaseUrl()}/rest/getSong?${getAuthParams()}&id=${encodeURIComponent(songId)}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)
  return data.song
}

export const getPlaylists = async(): Promise<any[]> => {
  const url = `${getBaseUrl()}/rest/getPlaylists?${getAuthParams()}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)
  return data.playlists?.playlist ?? []
}

export const getPlaylist = async(playlistId: string): Promise<any> => {
  const url = `${getBaseUrl()}/rest/getPlaylist?${getAuthParams()}&id=${encodeURIComponent(playlistId)}`
  const response = await fetchWithTimeout(url)
  const data = await parseResponse<any>(response)
  return data.playlist
}
