import { BackHandler, Dimensions, NativeEventEmitter, NativeModules } from 'react-native'

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

/** 轮询检查权限状态（系统弹窗/设置页操作期间结果异步变化），超时返回最后一次检查结果 */
const pollPermissionUntil = async(check: () => Promise<boolean>, timeoutMs = 60000, intervalMs = 800): Promise<boolean> => {
  const start = Date.now()
  let result = await check()
  while (!result && Date.now() - start < timeoutMs) {
    await new Promise<void>((r) => setTimeout(r, intervalMs))
    result = await check()
  }
  return result
}

/**
 * 请求通知权限：
 * - Android 13+ 先弹系统运行时权限弹窗（点"允许"直接授权）；
 *   被拒后自动跳转系统应用通知设置页
 * - Android 13 以下直接跳转系统应用通知设置页
 * 返回 true 表示已开启（或需轮询确认），false 表示无法发起请求
 */
export const requestNotificationPermission = async(): Promise<boolean> => {
  if (!UtilsModule || !UtilsModule.openNotificationPermissionActivity) return true
  const started = await UtilsModule.openNotificationPermissionActivity()
  if (!started) return false
  return pollPermissionUntil(() => isNotificationsEnabled())
}

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

/**
 * 请求忽略电池优化：弹系统确认弹窗，用户点"允许"即直接授权，无需进设置
 */
export const requestIgnoreBatteryOptimization = async(): Promise<boolean> => {
  if (!UtilsModule || !UtilsModule.requestIgnoreBatteryOptimization) return true
  const started = await UtilsModule.requestIgnoreBatteryOptimization()
  if (!started) return false
  return pollPermissionUntil(() => isIgnoringBatteryOptimization())
}
