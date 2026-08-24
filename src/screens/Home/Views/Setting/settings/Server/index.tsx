import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { navigations } from '@/navigation'
import { useActiveServer } from '@/store/server/hook'
import commonState from '@/store/common/state'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'

export default memo(() => {
  const theme = useTheme()
  const activeServer = useActiveServer()

  const handlePress = () => {
    const componentId = commonState.componentIds.home
    if (!componentId) return
    navigations.pushServerListScreen(componentId)
  }

  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.4} onPress={handlePress}>
      <View style={[styles.badge, { backgroundColor: theme['c-primary-background'] }]}>
        <Icon name="sd-card" size={20} color={theme['c-primary']} />
      </View>
      <View style={styles.info}>
        <Text style={styles.label} numberOfLines={1}>服务器配置</Text>
        {activeServer ? (
          <Text style={styles.value} color={theme['c-font-label']} numberOfLines={1}>
            {activeServer.name} ({activeServer.baseUrl})
          </Text>
        ) : (
          <Text style={styles.value} color={theme['c-450']} numberOfLines={1}>未配置服务器</Text>
        )}
      </View>
      <Icon name="chevron-right" size={18} color={theme['c-450']} style={styles.chevron} />
    </TouchableOpacity>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 25,
    paddingRight: 10,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    marginBottom: 3,
  },
  value: {
    fontSize: 12,
  },
  chevron: {
    marginLeft: 8,
  },
})
