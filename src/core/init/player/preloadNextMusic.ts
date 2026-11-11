import { getMusicUrl } from '@/core/music'
import { getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@/core/player/player'
import { checkUrl } from '@/utils/request'
import playerState from '@/store/player/state'
import { isCached } from '@/plugins/player/utils'
import { getMediaCacheKey, getPlayQuality } from '@/core/music/utils'
import { saveMusicUrl } from '@/utils/data'
import settingState from '@/store/setting/state'


const preloadMusicInfo = {
  isLoading: false,
  preProgress: 0,
  info: null as LX.Player.PlayMusicInfo | null,
}
const resetPreloadInfo = () => {
  preloadMusicInfo.preProgress = 0
  preloadMusicInfo.info = null
  preloadMusicInfo.isLoading = false
}
const preloadNextMusicUrl = async(curTime: number) => {
  if (preloadMusicInfo.isLoading || curTime - preloadMusicInfo.preProgress < 3) return
  preloadMusicInfo.isLoading = true
  console.log('preload next music url')
  const info = await getNextPlayMusicInfo()
  if (info) {
    preloadMusicInfo.info = info
    const url = await getMusicUrl({ musicInfo: info.musicInfo }).catch(() => '')
    if (url) {
      console.log('preload url', url)
      // 资源缓存以「歌曲ID+音质」为 key（见 getMediaCacheKey），不是播放 URL：
      // CDN 直链带时效签名，拿 URL 查缓存会把已经缓存好的歌曲误判成未缓存，
      // 白白触发一次重新解析（换新链接 -> 缓存 key 再变一次）。
      const cacheKey = getMediaCacheKey(info.musicInfo as LX.Music.MusicInfo | LX.Download.ListItem)
      const [cached, available] = await Promise.all([
        cacheKey ? isCached(cacheKey) : Promise.resolve(true),
        checkUrl(url).then(() => true).catch(() => false),
      ])
      if (!cached && !available) {
        // 重新解析会跳过 URL 缓存拿到新链接，这里显式写回，
        // 保证稍后正式播放用的是同一条链接（避免「播放用 A、记录是 B」的错位）。
        const newUrl = await getMusicUrl({ musicInfo: info.musicInfo, isRefresh: true }).catch(() => '')
        console.log('preload url refresh', newUrl)
        if (newUrl) {
          const onlineInfo = ('progress' in info.musicInfo
            ? info.musicInfo.metadata.musicInfo
            : info.musicInfo) as LX.Music.MusicInfoOnline
          const quality = getPlayQuality(settingState.setting['player.playQuality'], onlineInfo)
          void saveMusicUrl(onlineInfo, quality, newUrl).catch(() => {})
        }
      }
    }
  }
  preloadMusicInfo.isLoading = false
}

export default () => {
  const setProgress = (time: number) => {
    if (!playerState.musicInfo.id) return
    preloadMusicInfo.preProgress = time
  }

  const handleSetPlayInfo = () => {
    resetPreloadInfo()
  }

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (!keys.includes('player.togglePlayMethod')) return
    if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
    resetRandomNextMusicInfo()
    preloadMusicInfo.info = null
    preloadMusicInfo.preProgress = playerState.progress.nowPlayTime
  }

  const handlePlayProgressChanged: typeof global.state_event.playProgressChanged = (progress) => {
    const duration = progress.maxPlayTime
    // 预取提前量：本地解析链路（服务端逐源轮询 + 探测）可能耗时数秒到十几秒，
    // 上游的“剩余 10s”在自建服务器链路上经常来不及，切歌时会干等解析。
    // 改为剩余 45s 预取（短歌 <60s 不预取），给解析留足时间，切歌直接命中缓存。
    if (duration > 60 && duration - progress.nowPlayTime < 45 && !preloadMusicInfo.info) {
      void preloadNextMusicUrl(progress.nowPlayTime)
    }
  }

  global.app_event.on('setProgress', setProgress)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.state_event.on('playProgressChanged', handlePlayProgressChanged)
}
