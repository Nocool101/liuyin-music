import { memo, useCallback, useRef, useEffect } from 'react'
import { type LayoutChangeEvent, StyleSheet, View, StatusBar, Dimensions, AppState } from 'react-native'
import commonState from '@/store/common/state'
import settingState from '@/store/setting/state'
import { setStatusbarHeight, setNavBarHeight } from '@/core/common'
import { windowSizeTools, getWindowSize } from '@/utils/windowSizeTools'
import { getSystemInsets } from '@/utils/nativeModules/utils'

import { isHorizontalMode } from '@/utils/tools'

const getStatusbarHeight = (layoutWidth: number, layoutHeight: number) => {
  const currentHeight = StatusBar.currentHeight ?? 0
  const isHorizontal = isHorizontalMode(layoutWidth, layoutHeight)
  // 横屏全屏沉浸隐藏状态栏，不保留间距
  if (isHorizontal) {
    return 0
  }
  // 竖屏状态下，系统状态栏为半透明悬浮，无论手机还是平板大屏，均自适应使用系统真实的 StatusBar.currentHeight
  return currentHeight
}

export default memo(() => {
  const currentHeightRef = useRef(commonState.statusbarHeight)
  const sizeRef = useRef([0, 0])
  const dimensionsChangedRef = useRef(true)
  const handleLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent | { nativeEvent: { layout: { width: number, height: number } } }) => {
    const currentSize = windowSizeTools.getSize()
    if (!dimensionsChangedRef.current && currentSize.width == layout.width && currentSize.height == layout.height) return
    void getWindowSize().then(size => {
      dimensionsChangedRef.current = false
      sizeRef.current = [size.height, layout.height]
      const height = getStatusbarHeight(layout.width, layout.height)

      if (currentHeightRef.current != height) {
        currentHeightRef.current = height
        setStatusbarHeight(height)
      }
      if (currentSize.width != layout.width || currentSize.height != layout.height) {
        windowSizeTools.setWindowSize(layout.width, layout.height)
      }
      void getSystemInsets().then(insets => {
        setNavBarHeight(Math.round(insets.bottom))
      })
    })
  }, [])
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      dimensionsChangedRef.current = true
    })

    const updateInsets = () => {
      void getSystemInsets().then(insets => {
        setNavBarHeight(Math.round(insets.bottom))
      })
    }
    updateInsets()
    const timer = setTimeout(updateInsets, 500)
    const appStateSub = AppState.addEventListener('change', state => {
      if (state == 'active') updateInsets()
    })

    const handleSettingUpdate = (keys: Array<keyof LX.AppSetting>) => {
      if (!keys.includes('common.alwaysKeepStatusbarHeight')) return
      const currentSize = windowSizeTools.getSize()
      const height = getStatusbarHeight(currentSize.width, currentSize.height)

      if (currentHeightRef.current != height) {
        currentHeightRef.current = height
        setStatusbarHeight(height)
      }
    }
    global.state_event.on('configUpdated', handleSettingUpdate)

    return () => {
      subscription.remove()
      clearTimeout(timer)
      appStateSub.remove()
      global.state_event.off('configUpdated', handleSettingUpdate)
    }
  }, [])
  return (<View style={StyleSheet.absoluteFill} onLayout={handleLayout} />)
}, () => true)

