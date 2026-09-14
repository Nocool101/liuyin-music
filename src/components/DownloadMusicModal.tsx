import { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { View, ScrollView } from 'react-native'

import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { selectManagedFolder } from '@/utils/fs'
import { DOWNLOAD_QUALITYS, DEFAULT_DOWNLOAD_SAVE_PATH, downloadMusics } from '@/core/download'
import settingState from '@/store/setting/state'
import { log } from '@/utils/log'

export interface DownloadMusicInfo {
  musicInfo: LX.Music.MusicInfoOnline
  selectedList: LX.Music.MusicInfoOnline[]
}

interface QualityListProps {
  quality: LX.Quality
  onChange: (quality: LX.Quality) => void
}
const qualityLabels: Record<string, 'download_quality_128k' | 'download_quality_320k' | 'download_quality_flac'> = {
  '128k': 'download_quality_128k',
  '320k': 'download_quality_320k',
  'flac': 'download_quality_flac',
}
const QualityList = ({ quality, onChange }: QualityListProps) => {
  const theme = useTheme()
  const t = useI18n()
  return (
    <View style={styles.qualityList}>
      {DOWNLOAD_QUALITYS.map(item => (
        <Button
          key={item}
          style={{ ...styles.qualityBtn, backgroundColor: quality == item ? theme['c-primary-background'] : theme['c-button-background'] }}
          onPress={() => onChange(item)}
        >
          <Text color={quality == item ? theme['c-primary-font-active'] : theme['c-button-font']}>{t(qualityLabels[item])}</Text>
        </Button>
      ))}
    </View>
  )
}

export interface DownloadMusicModalType {
  show: (info: { musicInfo: LX.Music.MusicInfoOnline, selectedList: LX.Music.MusicInfoOnline[] }) => void
}

export default forwardRef<DownloadMusicModalType, {}>((props, ref) => {
  const theme = useTheme()
  const t = useI18n()
  const alertRef = useRef<ConfirmAlertType>(null)
  const [visible, setVisible] = useState(false)
  const [title, setTitle] = useState('')
  const [quality, setQuality] = useState<LX.Quality>(settingState.setting['download.quality'] ?? '128k')
  const [savePath, setSavePath] = useState<string>(settingState.setting['download.savePath'] || DEFAULT_DOWNLOAD_SAVE_PATH)
  const musicListRef = useRef<LX.Music.MusicInfoOnline[]>([])

  useImperativeHandle(ref, () => ({
    show(info) {
      log.info('download modal show:', info.musicInfo.name, 'selected:', info.selectedList.length)
      musicListRef.current = info.selectedList.length ? info.selectedList : [info.musicInfo]
      setTitle(info.selectedList.length
        ? t('download_music_multi_title', { num: info.selectedList.length })
        : t('download_music_title', { name: info.musicInfo.name }))
      setQuality(settingState.setting['download.quality'] ?? '128k')
      setSavePath(settingState.setting['download.savePath'] || DEFAULT_DOWNLOAD_SAVE_PATH)
      if (visible) alertRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          alertRef.current?.setVisible(true)
        })
      }
    },
  }))

  const handleChooseDir = () => {
    void selectManagedFolder(true).then(dir => {
      if (!dir || !dir.isDirectory) return
      log.info('download dir selected:', dir.path)
      setSavePath(dir.path)
    }).catch(err => {
      log.warn('download dir select failed:', err?.message ?? String(err))
    })
  }

  const handleDownload = () => {
    alertRef.current?.setVisible(false)
    const path = savePath.trim()
    log.info('download confirm:', musicListRef.current.length, 'songs, quality:', quality, 'path:', path)
    if (!path) return
    void downloadMusics(musicListRef.current, quality, path)
  }

  return (
    visible
      ? <ConfirmAlert
          ref={alertRef}
          title={title}
          confirmText={t('download_confirm_btn')}
          onConfirm={handleDownload}
        >
          <View style={styles.content}>
            <Text style={styles.label}>{t('download_quality_label')}</Text>
            <QualityList quality={quality} onChange={setQuality} />
            <Text style={styles.label}>{t('download_save_path_label')}</Text>
            <Button style={{ ...styles.pathBtn, backgroundColor: theme['c-button-background'] }} onPress={handleChooseDir}>
              <Text size={12} color={theme['c-button-font']} numberOfLines={1}>{savePath}</Text>
            </Button>
          </View>
        </ConfirmAlert>
      : null
  )
})

const styles = createStyle({
  content: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
    minWidth: 280,
  },
  label: {
    marginBottom: 6,
  },
  qualityList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  qualityBtn: {
    borderRadius: 4,
    marginRight: 10,
    marginBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  pathBtn: {
    borderRadius: 4,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
})
