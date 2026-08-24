import { NativeModules } from 'react-native'

const { CacheModule } = NativeModules

export const getAppCacheSize = async(): Promise<number> => {
  if (CacheModule?.getAppCacheSize) {
    try {
      return Math.trunc(await CacheModule.getAppCacheSize() ?? 0)
    } catch {
      return 0
    }
  }
  return 0
}
export const clearAppCache = CacheModule?.clearAppCache ?? (() => Promise.resolve())
