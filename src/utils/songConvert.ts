import { type SubsonicSong } from '@/plugins/subsonic/client'

export const subsonicSongToMusicInfo = (song: SubsonicSong): LX.Music.MusicInfoOnline => {
  // Extract source from ID (e.g., "wy_1378492134" -> "wy")
  const parts = song.id.split('_')
  const source = parts.length > 1 ? parts[0] : 'unknown'
  const songmid = parts.length > 1 ? parts.slice(1).join('_') : song.id

  return {
    id: song.id,
    name: song.title,
    singer: song.artist,
    source: source as LX.OnlineSource,
    interval: formatDuration(song.duration),
    songmid,
    albumId: song.albumId ?? '',
    albumName: song.album,
    img: song.coverArt ?? '',
    types: [],
    _types: {
      '128k': true,
      '320k': song.bitRate >= 320,
      'flac': song.suffix === 'flac' || song.suffix === 'wav' || song.suffix === 'ape' || song.suffix === '无损',
    },
    typeUrl: {},
    meta: {
      songId: songmid,
      albumName: song.album,
      picUrl: song.coverArt ? `subsonic:${song.coverArt}` : '',
      _qualitys: {
        '128k': true,
        '320k': song.bitRate >= 320,
        'flac': song.suffix === 'flac' || song.suffix === 'wav' || song.suffix === 'ape' || song.suffix === '无损',
      },
    },
  }
}

export const musicInfoToLxServerJson = (musicInfo: LX.Music.MusicInfoOnline | LX.Music.MusicInfo): any => {
  const source = musicInfo.source
  const songmid = musicInfo.meta.songId ?? musicInfo.id

  return {
    id: musicInfo.id,
    name: musicInfo.name,
    singer: musicInfo.singer,
    source,
    interval: musicInfo.interval ?? '',
    meta: {
      songId: songmid,
      albumName: musicInfo.meta.albumName ?? '',
      picUrl: musicInfo.meta.picUrl ?? '',
    },
  }
}

export const lxServerJsonToMusicInfo = (json: any): LX.Music.MusicInfoOnline => {
  return {
    id: json.id,
    name: json.name,
    singer: json.singer,
    source: json.source,
    interval: json.interval ?? '',
    meta: {
      songId: json.meta?.songId ?? json.id,
      albumName: json.meta?.albumName ?? '',
      picUrl: json.meta?.picUrl ?? '',
      _qualitys: {
        '128k': true,
        '320k': false,
        'flac': false,
      },
    },
  }
}

const formatDuration = (seconds: number): string => {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const getCoverArtUrl = (coverArt: string): string => {
  if (!coverArt) return ''
  if (coverArt.startsWith('subsonic:')) {
    // This is a Subsonic cover art ID, will be resolved by the Subsonic client
    return coverArt
  }
  // This might be a direct URL
  return coverArt
}
