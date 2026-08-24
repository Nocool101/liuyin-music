import { useState, useCallback } from 'react'
import { View, ScrollView, Alert, TextInput } from 'react-native'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { navigations } from '@/navigation'
import { loadServerConfigs, saveServerConfigs, createServerConfig, connectServer } from '@/plugins/lxserver'
import { addConfig, updateConfig } from '@/store/server/action'
import { useStatusbarHeight } from '@/store/common/hook'
import { createStyle } from '@/utils/tools'

interface Props {
  componentId: string
  config: LX.ServerConfig | null
}

export default ({ componentId, config }: Props) => {
  const statusBarHeight = useStatusbarHeight()
  const [name, setName] = useState(config?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '')
  const [username, setUsername] = useState(config?.username ?? '')
  const [password, setPassword] = useState(config?.password ?? '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const isEdit = config !== null

  const handleTest = useCallback(async () => {
    if (!baseUrl || !username || !password) {
      Alert.alert('提示', '请填写完整信息')
      return
    }

    setTesting(true)
    try {
      const testConfig = createServerConfig(name || '测试', baseUrl, username, password)
      const result = await connectServer(testConfig)
      if ('error' in result) {
        Alert.alert('连接失败', result.error)
      } else {
        Alert.alert('连接成功', '服务器连接正常')
      }
    } catch (err: any) {
      Alert.alert('连接失败', err.message ?? '未知错误')
    } finally {
      setTesting(false)
    }
  }, [baseUrl, username, password, name])

  const handleSave = useCallback(async () => {
    if (!name || !baseUrl || !username || !password) {
      Alert.alert('提示', '请填写完整信息')
      return
    }

    setSaving(true)
    try {
      const existingConfigs = await loadServerConfigs()

      if (isEdit) {
        // Update existing
        const updatedConfig = { ...config, name, baseUrl: baseUrl.replace(/\/+$/, ''), username, password }
        const updatedConfigs = existingConfigs.map(c => {
          if (c.id === config.id) {
            return updatedConfig
          }
          return c
        })
        await saveServerConfigs(updatedConfigs)
        updateConfig(updatedConfig)
      } else {
        // Add new
        const newConfig = createServerConfig(name, baseUrl, username, password)
        await saveServerConfigs([...existingConfigs, newConfig])
        addConfig(newConfig)
      }

      global.app_event.serversUpdated()
      navigations.popScreen(componentId)
    } catch (err: any) {
      Alert.alert('保存失败', err.message ?? '未知错误')
    } finally {
      setSaving(false)
    }
  }, [name, baseUrl, username, password, isEdit, config, componentId])

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ ...styles.content, paddingTop: styles.content.paddingTop + statusBarHeight }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{isEdit ? '编辑服务器' : '添加服务器'}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>服务器名称</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="例如：我的服务器"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>服务器地址</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="http://192.168.1.4:9527"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>用户名</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="输入用户名"
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>密码</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="输入密码"
          placeholderTextColor="#999"
          secureTextEntry
        />
      </View>

      <View style={styles.buttons}>
        <Button
          onPress={handleTest}
          disabled={testing || saving}
          style={styles.testBtn}
        >
          <Text style={styles.btnText}>{testing ? '测试中...' : '测试连接'}</Text>
        </Button>
        <Button
          onPress={handleSave}
          disabled={saving || testing}
          style={styles.saveBtn}
        >
          <Text style={styles.btnText}>{saving ? '保存中...' : '保存'}</Text>
        </Button>
      </View>
    </ScrollView>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  field: {
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    color: '#333',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  testBtn: {
    flex: 1,
    marginRight: 10,
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
  },
})
