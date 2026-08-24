import { useState, useEffect, useCallback } from 'react'
import { View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Text } from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { subsonic, type SubsonicArtist, type SubsonicAlbum, type SubsonicSong } from '@/plugins/subsonic'
import { subsonicSongToMusicInfo } from '@/utils/songConvert'
import { playList } from '@/core/player/player'
import { setTempList } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'

interface Props {
  artistId: string
}

export default ({ artistId }: Props) => {
  const [artist, setArtist] = useState<SubsonicArtist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadArtist = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await subsonic.getArtist(artistId)
        setArtist(data)
      } catch (err: any) {
        setError(err.message ?? 'Failed to load artist')
      } finally {
        setLoading(false)
      }
    }

    void loadArtist()
  }, [artistId])

  const handlePlaySong = useCallback((song: SubsonicSong, index: number) => {
    // 热门歌曲写入临时列表再播放，播完可切到下一首热门歌
    const songs = (artist?.album?.[0]?.song ?? [song]).slice(0, 10).map(subsonicSongToMusicInfo)
    void setTempList(`art__${artistId}`, songs).then(() => {
      void playList(LIST_IDS.TEMP, index)
    })
  }, [artist, artistId])

  const handlePlayAlbum = useCallback((album: SubsonicAlbum) => {
    // Navigate to album detail
    // navigations.pushAlbumDetailScreen(album.id)
  }, [])

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

  if (!artist) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>歌手不存在</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.artistName}>{artist.name}</Text>
        <Text style={styles.albumCount}>{artist.albumCount}张专辑</Text>
      </View>

      {artist.album && artist.album.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>专辑</Text>
          <FlatList
            horizontal
            data={artist.album}
            keyExtractor={item => item.id}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.albumItem} onPress={() => handlePlayAlbum(item)}>
                <View style={styles.albumCover}>
                  <Icon name="album" size={40} color="#999" />
                </View>
                <Text style={styles.albumName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.albumYear}>{item.year}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {artist.album?.[0]?.song && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>热门歌曲</Text>
          <FlatList
            data={artist.album[0].song.slice(0, 10)}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <TouchableOpacity style={styles.songItem} onPress={() => handlePlaySong(item, index)}>
                <View style={styles.songIndex}>
                  <Text style={styles.songIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.songInfo}>
                  <Text style={styles.songName} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.songAlbum} numberOfLines={1}>{item.album}</Text>
                </View>
                <Text style={styles.songDuration}>
                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
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
  artistName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  albumCount: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginTop: 16,
    backgroundColor: '#fff',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  albumItem: {
    width: 120,
    marginRight: 12,
  },
  albumCover: {
    width: 120,
    height: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  albumName: {
    fontSize: 14,
    marginBottom: 2,
  },
  albumYear: {
    fontSize: 12,
    color: '#999',
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
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
  songAlbum: {
    fontSize: 14,
    color: '#666',
  },
  songDuration: {
    fontSize: 14,
    color: '#999',
    marginLeft: 12,
  },
})
