import { Dimensions } from 'react-native'
import { useState, useEffect } from 'react'

export type DeviceType = 'phone' | 'tablet'

/**
 * Android standard: smallest width (sw) >= 600dp is considered a tablet
 */
export const TABLET_SMALLEST_WIDTH_THRESHOLD = 600

export const getDeviceType = (): DeviceType => {
  const { width, height } = Dimensions.get('window')
  const smallestWidth = Math.min(width, height)
  return smallestWidth >= TABLET_SMALLEST_WIDTH_THRESHOLD ? 'tablet' : 'phone'
}

export const isTablet = (): boolean => {
  return getDeviceType() === 'tablet'
}

export const isPhone = (): boolean => {
  return getDeviceType() === 'phone'
}

export const useDeviceType = (): DeviceType => {
  const [deviceType, setDeviceType] = useState<DeviceType>(getDeviceType)

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => {
      setDeviceType(getDeviceType())
    })
    return () => {
      sub.remove()
    }
  }, [])

  return deviceType
}

export const useIsTablet = (): boolean => {
  return useDeviceType() === 'tablet'
}
