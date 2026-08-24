import { useEffect, useState, useCallback } from 'react'
import { View, FlatList, TouchableOpacity, Alert } from 'react-native'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import { navigations } from '@/navigation'
import { loadServerConfigs, saveServerConfigs, loadActiveServerId, saveActiveServerId, connectServer } from '@/plugins/lxserver'
import { setConfigs, setActiveConfig, setConnected } from '@/store/server/action'
import { syncFavorites, startFavoritesSync } from '@/core/favorites'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'

interface ServerItemProps {
  config: LX.ServerConfig
  isActive: boolean
  onConnect: (config: LX.ServerConfig) => void
  onEdit: (config: LX.ServerConfig) => void
  onDelete: (config: LX.ServerConfig) => void
}

const ServerItem = ({ config, isActive, onConnect, onEdit, onDelete }: ServerItemProps) => {
  const theme = useTheme()

  return (
    <View style={[styles.item, { backgroundColor: theme['c-050'] }, isActive && { borderColor: theme['c-primary-alpha-600'] }]}>
      <TouchableOpacity style={styles.itemContent} activeOpacity={0.6} onPress={() => onConnect(config)}>
        <View style={[styles.badge, { backgroundColor: theme['c-primary-background'] }]}>
          <Icon name="sd-card" size={20} color={theme['c-primary']} />
        </View>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text style={styles.itemName} numberOfLines={1}>{config.name}</Text>
            {isActive && (
              <View style={[styles.activePill, { backgroundColor: theme['c-primary-background'] }]}>
                <Text size={11} color={theme['c-primary']}>当前使用</Text>
              </View>
            )}
          </View>
          <Text style={styles.itemUrl} color={theme['c-600']} numberOfLines={1}>{config.baseUrl}</Text>
          <Text style={styles.itemUser} color={theme['c-font-label']} numberOfLines={1}>用户 {config.username}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} activeOpacity={0.4} onPress={() => onEdit(config)}>
          <Icon name="chevron-right-2" size={20} color={theme['c-600']} />
        </TouchableOpacity>
      </TouchableOpacity>
      <View style={[styles.itemActions, { borderTopColor: theme['c-100'] }]}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]} activeOpacity={0.5} onPress={() => onConnect(config)}>
          <Text style={styles.actionText} color={theme['c-button-font']}>连接</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.5} onPress={() => onDelete(config)}>
          <Text style={styles.actionText} color="#F44336">删除</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default ({ componentId }: { componentId: string }) => {
  const statusBarHeight = useStatusbarHeight()
  const theme = useTheme()
  const [configs, setConfigs] = useState<LX.ServerConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const loadData = useCallback(async () => {
    const [loadedConfigs, loadedActiveId] = await Promise.all([
      loadServerConfigs(),
      loadActiveServerId(),
    ])
    setConfigs(loadedConfigs)
    setActiveId(loadedActiveId)
  }, [])

  useEffect(() => {
    void loadData()
    const handleServersUpdated = () => {
      void loadData()
    }
    global.app_event.on('serversUpdated', handleServersUpdated)
    return () => {
      global.app_event.off('serversUpdated', handleServersUpdated)
    }
  }, [loadData])

  const handleConnect = useCallback(async (config: LX.ServerConfig) => {
    setConnecting(true)
    try {
      const result = await connectServer(config)
      if ('error' in result) {
        Alert.alert('连接失败', result.error)
        return
      }

      // Update token
      const updatedConfig = { ...config, token: result.token }
      const updatedConfigs = configs.map(c => c.id === config.id ? updatedConfig : c)
      await saveServerConfigs(updatedConfigs)
      await saveActiveServerId(config.id)

      setConfigs(updatedConfigs)
      setActiveConfig(config.id)
      setConnected(true)
      setActiveId(config.id)
      // 连接成功后立即拉取服务器收藏/默认歌单并启动轮询同步
      startFavoritesSync()
      void syncFavorites()
      Alert.alert('连接成功', `已连接到 ${config.name}`)
    } catch (err: any) {
      Alert.alert('连接失败', err.message ?? '未知错误')
    } finally {
      setConnecting(false)
    }
  }, [configs])

  const handleEdit = useCallback((config: LX.ServerConfig) => {
    navigations.pushServerEditScreen(componentId, config)
  }, [componentId])

  const handleDelete = useCallback(async (config: LX.ServerConfig) => {
    Alert.alert(
      '删除服务器',
      `确定要删除 "${config.name}" 吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const updatedConfigs = configs.filter(c => c.id !== config.id)
            await saveServerConfigs(updatedConfigs)
            if (activeId === config.id) {
              await saveActiveServerId(null)
              setActiveId(null)
            }
            setConfigs(updatedConfigs)
            if (activeId === config.id) {
              setActiveConfig(null)
              setConnected(false)
            }
          },
        },
      ],
    )
  }, [configs, activeId])

  const handleAdd = useCallback(() => {
    navigations.pushServerEditScreen(componentId, null)
  }, [componentId])

  return (
    <View style={{ ...styles.container, paddingTop: statusBarHeight, backgroundColor: theme['c-content-background'] }}>
      <View style={styles.header}>
        <Text style={styles.title}>服务器配置</Text>
        <Button onPress={handleAdd} style={[styles.addBtn, { backgroundColor: theme['c-button-background'] }]}>
          <Text style={{ ...styles.addBtnText, color: theme['c-button-font'] }}>添加服务器</Text>
        </Button>
      </View>
      {connecting && (
        <View style={[styles.connecting, { backgroundColor: theme['c-primary-background'] }]}>
          <Text style={[styles.connectingText, { color: theme['c-primary'] }]}>连接中...</Text>
        </View>
      )}
      <FlatList
        data={configs}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ServerItem
            config={item}
            isActive={item.id === activeId}
            onConnect={handleConnect}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="sd-card" size={40} color={theme['c-300']} style={styles.emptyIcon} />
            <Text style={styles.emptyText} color={theme['c-600']}>暂无服务器配置</Text>
            <Text style={styles.emptyHint} color={theme['c-font-label']}>点击"添加服务器"开始</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
  },
  addBtnText: {
    fontSize: 14,
  },
  connecting: {
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 15,
    borderRadius: 6,
  },
  connectingText: {
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 20,
  },
  item: {
    marginHorizontal: 15,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  activePill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  itemUrl: {
    fontSize: 13,
    marginBottom: 3,
  },
  itemUser: {
    fontSize: 12,
  },
  editBtn: {
    padding: 4,
    marginLeft: 10,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginLeft: 10,
  },
  actionText: {
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 70,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#7a7a7a',
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    color: '#9b9b9b',
  },
})
