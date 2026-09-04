import { Platform, PermissionsAndroid } from 'react-native'
import { getData, saveData } from '@/plugins/storage'
import { storageDataPrefix } from '@/config/constant'
import {
  isIgnoringBatteryOptimization,
  isNotificationsEnabled,
  requestIgnoreBatteryOptimization,
  requestNotificationPermission,
} from '@/utils/nativeModules/utils'
import { bootLog } from '@/utils/bootLog'

// Platform.Version 在 Android 上是数字
const sdkVersion = Platform.OS === 'android' ? Number(Platform.Version) : 0

/**
 * 新安装用户首次打开应用时，依次弹出系统权限弹窗：
 * 1. 通知权限（Android 13+ 系统弹窗；13 以下通知默认开启，跳过）
 * 2. 存储权限（Android 12 及以下系统弹窗；13+ 分区存储无需申请）
 * 3. 忽略电池优化（系统弹窗，保障后台播放不被杀）
 * 用户点"允许"即直接授权，无需去系统设置手动开启。
 * 仅在首次启动执行一次，之后不再打扰。
 */
export const requestFirstLaunchPermissions = async() => {
  try {
    const done = await getData(storageDataPrefix.firstLaunchPermissionsDone)
    if (done != null) return
    // 先落标记再请求：保证整个流程只出现一次
    await saveData(storageDataPrefix.firstLaunchPermissionsDone, '1')
    bootLog('First launch permissions: requesting...')

    // 1. 通知权限
    if (sdkVersion >= 33) {
      try {
        const enabled = await isNotificationsEnabled()
        if (!enabled) await requestNotificationPermission()
      } catch (err) {
        bootLog(`First launch permissions: notification error: ${err?.message ?? err}`)
      }
    }

    // 2. 存储权限
    if (sdkVersion <= 32) {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE as never,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE as never,
        ])
      } catch (err) {
        bootLog(`First launch permissions: storage error: ${err?.message ?? err}`)
      }
    }

    // 3. 忽略电池优化
    try {
      const ignoring = await isIgnoringBatteryOptimization()
      if (!ignoring) await requestIgnoreBatteryOptimization()
    } catch (err) {
      bootLog(`First launch permissions: battery error: ${err?.message ?? err}`)
    }

    bootLog('First launch permissions: done.')
  } catch (err) {
    bootLog(`First launch permissions: failed: ${err?.message ?? err}`)
  }
}
