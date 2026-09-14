import { useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { View, Image, ActivityIndicator, useWindowDimensions } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { renderLyricCard, shareImage } from '@/utils/nativeModules/utils'
import { getLyricInfo, getPicPath } from '@/core/music'
import { log } from '@/utils/log'
import { temporaryDirectoryPath, unlink, downloadFile } from '@/utils/fs'

const LAYOUTS = ['square', 'portrait', 'landscape'] as const
type LyricCardLayout = typeof LAYOUTS[number]
const COLOR_THEMES = ['dark', 'light', 'album'] as const
type LyricCardColorTheme = typeof COLOR_THEMES[number]

const LAYOUT_RATIO: Record<LyricCardLayout, number> = {
  square: 1,
  portrait: 1080 / 1920,
  landscape: 1920 / 1080,
}

// 在容器内按卡片比例计算最大显示尺寸
const fitPreviewSize = (availW: number, availH: number, layout: LyricCardLayout): { w: number, h: number } => {
  const ratio = LAYOUT_RATIO[layout]
  let w = availW
  let h = Math.round(w / ratio)
  if (h > availH) {
    h = availH
    w = Math.round(h * ratio)
  }
  return { w: Math.floor(w), h: Math.floor(h) }
}

const parseLyricLines = (lrc: string): Array<{ text: string, active: boolean }> => {
  const lines: Array<{ time: number, text: string }> = []
  const seen = new Set<string>()
  for (const raw of lrc.split(/\r\n|\n|\r/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]/)
    const text = trimmed.replace(/^(\[[\d:.]+\])+/, '').trim()
    if (!text) continue
    // 纯标签行（如 [kuwo:126]、[ver:v1.0]、[ti:xxx]）
    if (/^\[[^[\]]*:[^[\]]*\]$/.test(trimmed)) continue
    // 短长度的元数据行（作词/作曲/编曲等）
    if (text.length < 26 && /^(作词|作曲|编曲|填词|谱曲|制作|混音|录制|和声|吉他|键盘|贝斯|鼓|歌词|歌詞|词|曲|演唱|演奏|作词：|作曲：)/.test(text)) continue
    if (/^(作词|作曲|编曲|填词|谱曲|制作|混音|录制|歌词|歌詞)[:：]/.test(text)) continue
    if (text.length < 26 && /[:：]/.test(text) && /词|曲|编|唱|奏/.test(text.slice(0, 4))) continue
    if (seen.has(text)) continue
    seen.add(text)
    const time = match ? (+match[1]) * 60 + parseFloat(match[2]) : 0
    lines.push({ time, text })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines.slice(0, 5).map((l, idx) => ({ text: l.text, active: idx === 0 }))
}

const downloadCover = async(url: string): Promise<string | null> => {
  if (!url) return null
  const tmpPath = `${temporaryDirectoryPath}/lyric_card_cover.png`
  try {
    const task = downloadFile(url, tmpPath, { connectionTimeout: 10000, readTimeout: 10000 })
    const result = await task.promise
    return result.statusCode === 200 ? tmpPath : null
  } catch (err) {
    void unlink(tmpPath).catch(() => {})
    log.info('lyric card cover download failed:', err?.message ?? String(err))
    return null
  }
}

const resolveCover = async(picUrl: string): Promise<string | null> => {
  if (!picUrl) return null
  if (picUrl.startsWith('subsonic:')) return null
  if (picUrl.startsWith('http://') || picUrl.startsWith('https://')) {
    return await downloadCover(picUrl)
  }
  if (picUrl.startsWith('file://')) {
    return picUrl.replace('file://', '')
  }
  return picUrl
}

export interface LyricCardShareModalType {
  show: (musicInfo: LX.Music.MusicInfoOnline) => void
}

export default forwardRef<LyricCardShareModalType, {}>((props, ref) => {
  const theme = useTheme()
  const t = useI18n()
  const { width: winWidth, height: winHeight } = useWindowDimensions()
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [layout, setLayout] = useState<LyricCardLayout>('square')
  const [colorTheme, setColorTheme] = useState<LyricCardColorTheme>('dark')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [isRendering, setRendering] = useState(false)
  const [isPreparing, setPreparing] = useState(false)
  const musicInfoRef = useRef<LX.Music.MusicInfoOnline | null>(null)
  const coverPathRef = useRef<string | null>(null)
  const lyricLinesRef = useRef<Array<{ text: string, active: boolean }>>([])
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionsRef = useRef({ layout: 'square' as LyricCardLayout, colorTheme: 'dark' as LyricCardColorTheme })

  // 自适应横竖屏与设备：最大可用高宽（留出标题栏约 24dp、选项按钮与分享按钮约 130dp、内边距等共约 165dp）
  const isLandscape = winWidth > winHeight
  const maxAvailW = Math.max(260, Math.floor(winWidth * (isLandscape ? 0.72 : 0.92)) - 16)
  const maxAvailH = Math.max(140, Math.floor(winHeight * 0.82 - 165))
  const fitted = fitPreviewSize(maxAvailW, maxAvailH, layout)

  // 弹窗宽度紧密贴合预览图宽度（加上左右 padding 16dp），左右零留白
  const dialogWidth = Math.max(fitted.w + 16, 260)

  const renderPreview = useCallback(async() => {
    const musicInfo = musicInfoRef.current
    if (!musicInfo) return
    setRendering(true)
    try {
      const filePath = await renderLyricCard({
        title: musicInfo.name,
        artist: musicInfo.singer,
        lyricLines: lyricLinesRef.current,
        coverPath: coverPathRef.current,
        layout: optionsRef.current.layout,
        colorTheme: optionsRef.current.colorTheme,
      })
      setPreviewPath(filePath)
    } catch (err: any) {
      log.warn('lyric card render failed:', err?.message ?? String(err))
    } finally {
      setRendering(false)
    }
  }, [])

  const scheduleRender = useCallback(() => {
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(() => { void renderPreview() }, 120)
  }, [renderPreview])

  useImperativeHandle(ref, () => ({
    show(musicInfo) {
      musicInfoRef.current = musicInfo
      optionsRef.current = { layout: 'square', colorTheme: 'dark' }
      setLayout('square')
      setColorTheme('dark')
      setPreviewPath(null)
      if (visible) dialogRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
      }
      // 异步准备歌词与封面，然后渲染首张预览
      void (async() => {
        setPreparing(true)
        try {
          let lyricLines: Array<{ text: string, active: boolean }> = []
          try {
            const lyricInfo = await getLyricInfo({ musicInfo, isRefresh: false })
            lyricLines = parseLyricLines(lyricInfo.lyric)
          } catch (err) {
            log.info('lyric card get lyric failed:', err?.message ?? String(err))
          }
          lyricLinesRef.current = lyricLines.length ? lyricLines : [{ text: '♪ 暂无歌词', active: true }]
          try {
            const picUrl = await getPicPath({ musicInfo, isRefresh: false })
            coverPathRef.current = await resolveCover(picUrl)
          } catch (err) {
            log.info('lyric card get cover failed:', err?.message ?? String(err))
          }
          void renderPreview()
        } finally {
          setPreparing(false)
        }
      })()
    },
  }))

  const handleLayoutChange = (val: LyricCardLayout) => {
    if (val === layout) return
    setLayout(val)
    optionsRef.current.layout = val
    scheduleRender()
  }
  const handleColorChange = (val: LyricCardColorTheme) => {
    if (val === colorTheme) return
    setColorTheme(val)
    optionsRef.current.colorTheme = val
    scheduleRender()
  }

  const handleShare = () => {
    if (!previewPath) return
    void shareImage(previewPath, t('share_card_title_music', { name: musicInfoRef.current?.name ?? '' }))
  }

  if (!visible) return null

  return (
    <Dialog
      ref={dialogRef}
      title={t('music_source_detail')}
      width={dialogWidth}
      maxWidth="96%"
      maxHeight="90%"
      keyHide={false}
    >
      <View style={styles.content}>
        <View
          style={{
            ...styles.previewBox,
            width: fitted.w,
            height: fitted.h,
            backgroundColor: 'transparent',
          }}
        >
          {
            previewPath
              ? <Image
                  source={{ uri: 'file://' + previewPath }}
                  style={{ width: fitted.w, height: fitted.h, borderRadius: 4 }}
                  resizeMode="contain"
                />
              : <View style={styles.loadingBox}>
                  <ActivityIndicator animating color={theme['c-primary']} size="large" />
                  <Text size={11} color={theme['c-font-label']} style={styles.loadingTip}>{t('lyric_card_preparing')}</Text>
                </View>
          }
          {
            isRendering && previewPath
              ? <View style={styles.refreshing}><ActivityIndicator animating color={theme['c-primary']} size="small" /></View>
              : null
          }
        </View>
        <View style={styles.optionsRow}>
          <Text size={11} color={theme['c-font']} style={styles.label}>{t('lyric_card_layout_label')}</Text>
          <View style={styles.optionBtns}>
            {LAYOUTS.map(item => {
              const active = item === layout
              return (
                <Button
                  key={item}
                  style={optionStyle(active, theme)}
                  onPress={() => { handleLayoutChange(item) }}
                >
                  <Text
                    size={11}
                    color={active ? '#ffffff' : theme['c-button-font']}
                  >
                    {t(`lyric_card_layout_${item}`)}
                  </Text>
                </Button>
              )
            })}
          </View>
        </View>
        <View style={styles.optionsRow}>
          <Text size={11} color={theme['c-font']} style={styles.label}>{t('lyric_card_color_label')}</Text>
          <View style={styles.optionBtns}>
            {COLOR_THEMES.map(item => {
              const active = item === colorTheme
              return (
                <Button
                  key={item}
                  style={optionStyle(active, theme)}
                  onPress={() => { handleColorChange(item) }}
                >
                  <Text
                    size={11}
                    color={active ? '#ffffff' : theme['c-button-font']}
                  >
                    {t(`lyric_card_color_${item}`)}
                  </Text>
                </Button>
              )
            })}
          </View>
        </View>
        <Button
          style={{ ...styles.shareBtn, backgroundColor: theme['c-primary'] }}
          onPress={handleShare}
          disabled={!previewPath || isPreparing}
        >
          <Text size={12} color="#ffffff">{t('lyric_card_generate_btn')}</Text>
        </Button>
      </View>
    </Dialog>
  )
})

const optionStyle = (selected: boolean, theme: any) => ({
  ...styles.optionBtn,
  backgroundColor: selected ? theme['c-primary'] : theme['c-button-background'],
  borderColor: selected ? theme['c-primary'] : theme['c-border-background'],
})

const styles = createStyle({
  content: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingBottom: 8,
  },
  previewBox: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTip: {
    marginTop: 8,
  },
  refreshing: {
    position: 'absolute',
    right: 8,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    padding: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  label: {
    width: 60,
    flexShrink: 0,
  },
  optionBtns: {
    flex: 1,
    flexDirection: 'row',
  },
  optionBtn: {
    flex: 1,
    borderRadius: 4,
    marginRight: 6,
    paddingTop: 6,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  shareBtn: {
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 2,
    paddingTop: 9,
    paddingBottom: 9,
    alignItems: 'center',
  },
})
