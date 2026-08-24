import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@server_configs'
const ACTIVE_ID_KEY = '@active_server_id'

export const loadServerConfigs = async(): Promise<LX.ServerConfig[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const saveServerConfigs = async(configs: LX.ServerConfig[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

export const loadActiveServerId = async(): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ACTIVE_ID_KEY)
  } catch {
    return null
  }
}

export const saveActiveServerId = async(id: string | null): Promise<void> => {
  if (id) {
    await AsyncStorage.setItem(ACTIVE_ID_KEY, id)
  } else {
    await AsyncStorage.removeItem(ACTIVE_ID_KEY)
  }
}
