import { memo, useCallback, useEffect, useRef } from 'react'
import { type LayoutChangeEvent, StyleSheet, View, StatusBar, Dimensions, DeviceEventEmitter, PixelRatio } from 'react-native'
import commonState from '@/store/common/state'
import settingState from '@/store/setting/state'
import { setStatusbarHeight, setNavbarHeight } from '@/core/common'
import { windowSizeTools, getWindowSize } from '@/utils/windowSizeTools'
import { getStatusBarReserve } from '@/utils/nativeModules/utils'

const getStatusbarHeight = (winHeight: number, layoutHeight: number) => {
  const currentHeight = StatusBar.currentHeight ?? 0
  // When the layout height exceeds the window height, it means the layout
  // extends under the status bar (e.g. on notched devices), so we must reserve
  // the status bar height to avoid content being covered.
  if (parseFloat(layoutHeight.toFixed(2)) > parseFloat(winHeight.toFixed(2)) + 1) {
    return currentHeight
  }
  if (!settingState.setting['common.alwaysKeepStatusbarHeight']) {
    return 0
  }
  return currentHeight
}

export default memo(() => {
  const currentHeightRef = useRef(commonState.statusbarHeight)
  const sizeRef = useRef([0, 0])
  const dimensionsChangedRef = useRef(true)
  // 原生权威测量的系统栏预留（任意机型自适应，见 MainActivity.measureAndNotify）
  const nativeReserveRef = useRef(0)
  const nativeReadyRef = useRef(false)
  const navbarRef = useRef(commonState.navbarHeight)
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const applyHeight = useCallback((winHeight: number, layoutHeight: number) => {
    if (!layoutHeight) return
    let height: number
    if (nativeReadyRef.current) {
      // 原生实测可用后以它为准（启发式只是原生就绪前的兜底，叠加会双重预留）
      height = nativeReserveRef.current
      if (settingState.setting['common.alwaysKeepStatusbarHeight']) {
        height = Math.max(height, StatusBar.currentHeight ?? 0)
      }
    } else {
      height = getStatusbarHeight(winHeight, layoutHeight)
    }
    if (currentHeightRef.current != height) {
      currentHeightRef.current = height
      setStatusbarHeight(height)
    }
  }, [])
  const handleLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent | { nativeEvent: { layout: { width: number, height: number } } }) => {
    // console.log('handleLayout')
    if (!dimensionsChangedRef.current) return
    void getWindowSize().then(size => {
      dimensionsChangedRef.current = false
      // console.log(layout, size)
      sizeRef.current = [size.height, layout.height]
      const winHeight = Dimensions.get('window').height

      applyHeight(winHeight, layout.height)
      // console.log(layout, size)
      const currentSize = windowSizeTools.getSize()
      if (currentSize.width != layout.width || currentSize.height != layout.height) {
        windowSizeTools.setWindowSize(layout.width, layout.height)
      }
    })
  }, [applyHeight])
  useEffect(() => {
    // let timeout: NodeJS.Timeout | null = null
    const subscription = Dimensions.addEventListener('change', () => {
      dimensionsChangedRef.current = true
      // 旋转后主动拉取原生测量结果：原生在旋转后 500/1300ms 复测，
      // 这里延时拉取两次兜底，防止旋转期间 emit 因桥忙被吞导致数值卡在过渡态
      timeoutsRef.current.push(setTimeout(() => { void getStatusBarReserve().then(applyNative) }, 800))
      timeoutsRef.current.push(setTimeout(() => { void getStatusBarReserve().then(applyNative) }, 1800))
    })

    // 原生测量：内容被系统栏遮挡（部分 ROM 忽略 decorFits）时按实测差值预留，
    // 任意机型自适应。原生传回物理像素，RN 按 dp 解释，必须先除以 PixelRatio，
    // 否则高密度屏（如荣耀 3.5x）padding 会被放大 3.5 倍
    const applyNative = (reserve: { top: number, bottom: number }) => {
      nativeReadyRef.current = true
      nativeReserveRef.current = (reserve.top ?? 0) / PixelRatio.get()
      applyHeight(Dimensions.get('window').height, sizeRef.current[1])
      const navbar = (reserve.bottom ?? 0) / PixelRatio.get()
      if (navbarRef.current != navbar) {
        navbarRef.current = navbar
        setNavbarHeight(navbar)
      }
    }
    const insetSub = DeviceEventEmitter.addListener('liuyin_statusbar_inset', (params: { top: number, bottom: number }) => {
      applyNative({ top: params?.top ?? 0, bottom: params?.bottom ?? 0 })
    })
    // 冷启动时 RN 未就绪可能错过事件，主动拉取一次
    void getStatusBarReserve().then(applyNative)

    const handleSettingUpdate = (keys: Array<keyof LX.AppSetting>) => {
      if (!keys.includes('common.alwaysKeepStatusbarHeight') || !sizeRef.current[1]) return
      applyHeight(sizeRef.current[0], sizeRef.current[1])
    }
    global.state_event.on('configUpdated', handleSettingUpdate)

    return () => {
      subscription.remove()
      insetSub.remove()
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      global.state_event.off('configUpdated', handleSettingUpdate)
    }
  }, [applyHeight])
  return (<View style={StyleSheet.absoluteFill} onLayout={handleLayout} />)
}, () => true)

