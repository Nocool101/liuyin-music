import { LIST_IDS } from '@/config/constant'
import { playNext } from '@/core/player/player'
import { setPlayListId } from '@/core/player/playInfo'
import { addTempPlayList, clearTempPlayeList } from '@/core/player/tempPlayList'
import settingState from '@/store/setting/state'
import { confirmDialog, openUrl, shareMusic, toast } from '@/utils/tools'
import { addDislikeInfo, hasDislike } from '@/core/dislikeList'
import playerState from '@/store/player/state'
import musicSdk from '@/utils/musicSdk'
import { toOldMusicInfo } from '@/utils'

// 单曲点播（搜索等入口）：歌曲不写入默认列表，以临时播放立即开播，
// 播放列表指向收藏列表——歌曲播完后自动接收藏列表的下一首。
// 注意：临时播放的 listId 不会自动更新 playInfo.playerListId（只有 setPlayListId 会），
// 必须显式切换，否则播完后 playNext 仍从旧列表取歌
export const handlePlay = (musicInfo: LX.Music.MusicInfoOnline) => {
  setPlayListId(LIST_IDS.LOVE)
  clearTempPlayeList()
  addTempPlayList([{ listId: LIST_IDS.LOVE, musicInfo }])
  // 已有歌在播时 addTempPlayList 只入队不自动开播，需主动切换到点播的歌
  if (playerState.playMusicInfo.musicInfo) void playNext()
}
export const handlePlayLater = (musicInfo: LX.Music.MusicInfoOnline, selectedList: LX.Music.MusicInfoOnline[], onCancelSelect: () => void) => {
  if (selectedList.length) {
    addTempPlayList(selectedList.map(s => ({ listId: '', musicInfo: s })))
    onCancelSelect()
  } else {
    addTempPlayList([{ listId: '', musicInfo }])
  }
}


export const handleShare = (musicInfo: LX.Music.MusicInfoOnline) => {
  shareMusic(settingState.setting['common.shareType'], settingState.setting['download.fileName'], musicInfo)
}

export const handleShowMusicSourceDetail = async(minfo: LX.Music.MusicInfoOnline) => {
  const url = musicSdk[minfo.source as LX.OnlineSource]?.getMusicDetailPageUrl(toOldMusicInfo(minfo))
  if (!url) return
  void openUrl(url)
}


export const handleDislikeMusic = async(musicInfo: LX.Music.MusicInfoOnline) => {
  const confirm = await confirmDialog({
    message: musicInfo.singer ? global.i18n.t('lists_dislike_music_singer_tip', { name: musicInfo.name, singer: musicInfo.singer }) : global.i18n.t('lists_dislike_music_tip', { name: musicInfo.name }),
    cancelButtonText: global.i18n.t('cancel_button_text_2'),
    confirmButtonText: global.i18n.t('confirm_button_text'),
    bgClose: false,
  })
  if (!confirm) return
  await addDislikeInfo([{ name: musicInfo.name, singer: musicInfo.singer }])
  toast(global.i18n.t('lists_dislike_music_add_tip'))
  if (hasDislike(playerState.playMusicInfo.musicInfo)) {
    void playNext(true)
  }
}

