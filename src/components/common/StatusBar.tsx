import { useTheme } from '@/store/theme/hook'
import { StatusBar as RNStatusBar } from 'react-native'
import { useHorizontalMode } from '@/utils/hooks'

const StatusBar = function() {
  const theme = useTheme()
  const isHorizontalMode = useHorizontalMode()
  const statusBarStyle = theme.isDark ? 'light-content' : 'dark-content'
  return (
    <RNStatusBar
      backgroundColor="rgba(0,0,0,0)"
      barStyle={statusBarStyle}
      translucent={true}
      hidden={isHorizontalMode}
    />
  )
}

StatusBar.currentHeight = RNStatusBar.currentHeight ?? 0
StatusBar.setBarStyle = RNStatusBar.setBarStyle
StatusBar.setHidden = RNStatusBar.setHidden

export default StatusBar
