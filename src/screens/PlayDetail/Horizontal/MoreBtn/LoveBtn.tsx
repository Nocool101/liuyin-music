import { useState, useEffect, useRef } from 'react'
import { usePlayMusicInfo } from '@/store/player/hook'
import { isFavorite, toggleFavorite } from '@/core/favorites'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import { useI18n } from '@/lang'
import Btn from './Btn'


export default () => {
  const t = useI18n()
  const playMusicInfo = usePlayMusicInfo()
  const musicInfo = playMusicInfo?.musicInfo
  const [fav, setFav] = useState(false)
  const confirmAlertRef = useRef<ConfirmAlertType>(null)

  useEffect(() => {
    if (!musicInfo) return
    setFav(isFavorite(musicInfo.id))
    // 简单轮询监听 favoriteIds 变化
    const timer = setInterval(() => {
      setFav(isFavorite(musicInfo.id))
    }, 500)
    return () => clearInterval(timer)
  }, [musicInfo?.id])

  const handleConfirm = () => {
    confirmAlertRef.current?.setVisible(false)
    if (!musicInfo) return
    void toggleFavorite(musicInfo as LX.Music.MusicInfoOnline).then(() => {
      setFav(isFavorite(musicInfo.id))
    }).catch(() => {
      setFav(isFavorite(musicInfo.id))
    })
  }

  const handlePress = () => {
    if (!musicInfo) return
    confirmAlertRef.current?.setVisible(true)
  }

  return (
    <>
      <Btn icon={fav ? 'love-solid' : 'add-music'} color={fav ? '#F44336' : undefined} onPress={handlePress} />
      <ConfirmAlert
        ref={confirmAlertRef}
        text={fav ? t('love_confirm_remove', { name: musicInfo?.name ?? '' }) : t('love_confirm_add', { name: musicInfo?.name ?? '' })}
        cancelText={t('love_btn_back')}
        confirmText={fav ? t('love_btn_remove') : t('love_btn_add')}
        onConfirm={handleConfirm}
      />
    </>
  )
}
