import { NativeModules, NativeEventEmitter } from 'react-native'

const { LyricModule } = NativeModules

const getAlpha = (num: number) => num / 100
const getTextSize = (num: number) => num / 10

export const setSendLyricTextEvent = async(isSend: boolean) => {
  return LyricModule?.setSendLyricTextEvent?.(isSend)
}

export const showDesktopLyricView = async(props: any): Promise<void> => {
  return LyricModule?.showDesktopLyric?.(props)
}

export const hideDesktopLyricView = async(): Promise<void> => {
  return LyricModule?.hideDesktopLyric?.()
}

export const play = async(time: number): Promise<void> => {
  return LyricModule?.play?.(time)
}

export const pause = async(): Promise<void> => {
  return LyricModule?.pause?.()
}

export const setLyric = async(lyric: string, translation: string, romalrc: string): Promise<void> => {
  return LyricModule?.setLyric?.(lyric, translation || '', romalrc || '')
}

export const setPlaybackRate = async(rate: number): Promise<void> => {
  return LyricModule?.setPlaybackRate?.(rate)
}

export const toggleTranslation = async(isShowTranslation: boolean): Promise<void> => {
  return LyricModule?.toggleTranslation?.(isShowTranslation)
}

export const toggleRoma = async(isShowRoma: boolean): Promise<void> => {
  return LyricModule?.toggleRoma?.(isShowRoma)
}

export const toggleLock = async(isLock: boolean): Promise<void> => {
  return LyricModule?.toggleLock?.(isLock)
}

export const setColor = async(unplayColor: string, playedColor: string, shadowColor: string): Promise<void> => {
  return LyricModule?.setColor?.(unplayColor, playedColor, shadowColor)
}

export const setAlpha = async(alpha: number): Promise<void> => {
  return LyricModule?.setAlpha?.(getAlpha(alpha))
}

export const setTextSize = async(size: number): Promise<void> => {
  return LyricModule?.setTextSize?.(getTextSize(size))
}

export const setShowToggleAnima = async(isShowToggleAnima: boolean): Promise<void> => {
  return LyricModule?.setShowToggleAnima?.(isShowToggleAnima)
}

export const setSingleLine = async(isSingleLine: boolean): Promise<void> => {
  return LyricModule?.setSingleLine?.(isSingleLine)
}

export const setPosition = async(x: number, y: number): Promise<void> => {
  return LyricModule?.setPosition?.(x, y)
}

export const setMaxLineNum = async(maxLineNum: number): Promise<void> => {
  return LyricModule?.setMaxLineNum?.(maxLineNum)
}

export const setWidth = async(width: number): Promise<void> => {
  return LyricModule?.setWidth?.(width)
}

export const setLyricTextPosition = async(textX: any, textY: any): Promise<void> => {
  return LyricModule?.setLyricTextPosition?.(textX?.toUpperCase?.(), textY?.toUpperCase?.())
}

export const checkOverlayPermission = async(): Promise<void> => {
  return LyricModule?.checkOverlayPermission?.()
}

export const openOverlayPermissionActivity = async(): Promise<void> => {
  return LyricModule?.openOverlayPermissionActivity?.()
}

export const onPositionChange = (handler: (position: { x: number, y: number }) => void): () => void => {
  if (!LyricModule) return () => {}
  const eventEmitter = new NativeEventEmitter(LyricModule)
  const eventListener = eventEmitter.addListener('set-position', event => {
    handler(event as { x: number, y: number })
  })
  return () => { eventListener.remove() }
}

export const onLyricLinePlay = (handler: (lineInfo: { text: string, extendedLyrics: string[] }) => void): () => void => {
  if (!LyricModule) return () => {}
  const eventEmitter = new NativeEventEmitter(LyricModule)
  const eventListener = eventEmitter.addListener('lyric-line-play', event => {
    handler(event as { text: string, extendedLyrics: string[] })
  })
  return () => { eventListener.remove() }
}
