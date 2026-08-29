import { AppState, BackHandler, Dimensions, NativeEventEmitter, NativeModules } from 'react-native'

const UtilsModule = NativeModules.UtilsModule || null

export const exitApp = () => {
  BackHandler.exitApp()
}

export const getSupportedAbis = () => {
  if (UtilsModule && UtilsModule.getSupportedAbis) {
    return UtilsModule.getSupportedAbis()
  }
  return Promise.resolve(['unknown'])
}

export const installApk = (filePath: string, fileProviderAuthority: string) => {
  if (UtilsModule && UtilsModule.installApk) return UtilsModule.installApk(filePath, fileProviderAuthority)
}

export const screenkeepAwake = () => {
  if (global.lx.isScreenKeepAwake) return
  global.lx.isScreenKeepAwake = true
  if (UtilsModule && UtilsModule.screenkeepAwake) UtilsModule.screenkeepAwake()
}
export const screenUnkeepAwake = () => {
  if (!global.lx.isScreenKeepAwake) return
  global.lx.isScreenKeepAwake = false
  if (UtilsModule && UtilsModule.screenUnkeepAwake) UtilsModule.screenUnkeepAwake()
}

export const getWIFIIPV4Address = () => {
  if (UtilsModule && UtilsModule.getWIFIIPV4Address) return UtilsModule.getWIFIIPV4Address()
  return Promise.resolve('0.0.0.0')
}

export const getDeviceName = async(): Promise<string> => {
  if (UtilsModule && UtilsModule.getDeviceName) return UtilsModule.getDeviceName().then((deviceName: string) => deviceName || 'Unknown')
  return 'Unknown'
}

export const isNotificationsEnabled = () => {
  if (UtilsModule && UtilsModule.isNotificationsEnabled) return UtilsModule.isNotificationsEnabled()
  return Promise.resolve(true)
}

export const requestNotificationPermission = async() => new Promise<boolean>((resolve) => {
  if (!UtilsModule || !UtilsModule.openNotificationPermissionActivity) {
    resolve(true)
    return
  }
  let subscription = AppState.addEventListener('change', (state) => {
    if (state != 'active') return
    subscription.remove()
    setTimeout(() => {
      void isNotificationsEnabled().then(resolve)
    }, 1000)
  })
  UtilsModule.openNotificationPermissionActivity().then((result: boolean) => {
    if (result) return
    subscription.remove()
    resolve(false)
  })
})

export const shareText = async(shareTitle: string, title: string, text: string): Promise<void> => {
  if (UtilsModule && UtilsModule.shareText) UtilsModule.shareText(shareTitle, title, text)
}

export const getSystemLocales = async(): Promise<string> => {
  if (UtilsModule && UtilsModule.getSystemLocales) return UtilsModule.getSystemLocales()
  return 'zh-CN'
}

export const onScreenStateChange = (handler: (state: 'ON' | 'OFF') => void): () => void => {
  if (!UtilsModule) return () => {}
  const eventEmitter = new NativeEventEmitter(UtilsModule)
  const eventListener = eventEmitter.addListener('screen-state', event => {
    handler(event.state as 'ON' | 'OFF')
  })
  return () => { eventListener.remove() }
}

export const getWindowSize = async(): Promise<{ width: number, height: number }> => {
  if (UtilsModule && UtilsModule.getWindowSize) return UtilsModule.getWindowSize()
  const window = Dimensions.get('window')
  const scale = window.scale
  return {
    width: window.width * scale,
    height: window.height * scale,
  }
}

export const onWindowSizeChange = (handler: (size: { width: number, height: number }) => void): () => void => {
  if (!UtilsModule) return () => {}
  UtilsModule.listenWindowSizeChanged()
  const eventEmitter = new NativeEventEmitter(UtilsModule)
  const eventListener = eventEmitter.addListener('screen-size-changed', event => {
    handler(event as { width: number, height: number })
  })
  return () => { eventListener.remove() }
}

/**
 * 读取原生测量的系统栏预留高度（px）。
 * top：竖屏下部分 ROM 忽略 decorFitsSystemWindows(true)，内容延伸到状态栏下面时需预留的高度；
 * bottom：内容底部被导航栏（手势条）遮挡时需预留的高度。
 * decorFits 生效时均为 0。
 */
export const getStatusBarReserve = async(): Promise<{ top: number, bottom: number }> => {
  if (UtilsModule && UtilsModule.getStatusBarReserve) {
    try {
      const result = await UtilsModule.getStatusBarReserve()
      return {
        top: typeof result?.top === 'number' && result.top > 0 ? result.top : 0,
        bottom: typeof result?.bottom === 'number' && result.bottom > 0 ? result.bottom : 0,
      }
    } catch {
      return { top: 0, bottom: 0 }
    }
  }
  return { top: 0, bottom: 0 }
}

export const isIgnoringBatteryOptimization = async(): Promise<boolean> => {
  if (UtilsModule && UtilsModule.isIgnoringBatteryOptimization) return UtilsModule.isIgnoringBatteryOptimization()
  return true
}

export const requestIgnoreBatteryOptimization = async() => new Promise<boolean>((resolve) => {
  if (!UtilsModule || !UtilsModule.requestIgnoreBatteryOptimization) {
    resolve(true)
    return
  }
  let subscription = AppState.addEventListener('change', (state) => {
    if (state != 'active') return
    subscription.remove()
    setTimeout(() => {
      void isIgnoringBatteryOptimization().then(resolve)
    }, 1000)
  })
  UtilsModule.requestIgnoreBatteryOptimization().then((result: boolean) => {
    if (result) return
    subscription.remove()
    resolve(false)
  })
})
