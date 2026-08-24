import { useState, useEffect, useCallback } from 'react'
import { View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Text } from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { subsonic, type SubsonicAlbum, type SubsonicSong } from '@/plugins/subsonic'
import { subsonicSongToMusicInfo } from '@/utils/songConvert'
import { playList } from '@/core/player/player'
import { setTempList } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'

interface Props {
  albumId: string
}

export default ({ albumId }: Props) => {
  const [album, setAlbum] = useState<SubsonicAlbum | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAlbum = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await subsonic.getAlbum(albumId)
        setAlbum(data)
      } catch (err: any) {
        setError(err.message ?? 'Failed to load album')
      } finally {
        setLoading(false)
      }
    }

    void loadAlbum()
  }, [albumId])

  const playAlbum = useCallback((index: number) => {
    if (!album?.song?.length) return
    const songs = album.song.map(subsonicSongToMusicInfo)
    // 专辑歌曲先写入临时列表再播放（与排行榜一致），否则播完无法切到专辑内下一首
    void setTempList(`alb__${albumId}`, songs).then(() => {
      void playList(LIST_IDS.TEMP, index)
    })
  }, [album, albumId])

  const handlePlaySong = useCallback((index: number) => {
    playAlbum(index)
  }, [playAlbum])

  const handlePlayAll = useCallback(() => {
    playAlbum(0)
  }, [playAlbum])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Icon name="minus-box" size={48} color="#F44336" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    )
  }

  if (!album) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>专辑不存在</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.albumInfo}>
          <Text style={styles.albumName}>{album.name}</Text>
          <Text style={styles.albumArtist}>{album.artist}</Text>
          {album.year ? <Text style={styles.albumYear}>{album.year}年</Text> : null}
          <Text style={styles.albumSongs}>{album.songCount}首歌曲</Text>
        </View>
        <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll}>
          <Icon name="play" size={20} color="#fff" />
          <Text style={styles.playAllText}>播放全部</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={album.song ?? []}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={styles.songItem} onPress={() => handlePlaySong(index)}>
            <View style={styles.songIndex}>
              <Text style={styles.songIndexText}>{index + 1}</Text>
            </View>
            <View style={styles.songInfo}>
              <Text style={styles.songName} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
            </View>
            <Text style={styles.songDuration}>
              {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  errorText: {
    marginTop: 12,
    color: '#F44336',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  albumInfo: {
    marginBottom: 12,
  },
  albumName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  albumArtist: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  albumYear: {
    fontSize: 14,
    color: '#999',
    marginBottom: 2,
  },
  albumSongs: {
    fontSize: 14,
    color: '#999',
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
  },
  playAllText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 16,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  songIndex: {
    width: 30,
    alignItems: 'center',
  },
  songIndexText: {
    fontSize: 14,
    color: '#999',
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
  },
  songName: {
    fontSize: 16,
    marginBottom: 2,
  },
  songArtist: {
    fontSize: 14,
    color: '#666',
  },
  songDuration: {
    fontSize: 14,
    color: '#999',
    marginLeft: 12,
  },
})
