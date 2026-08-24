import state, { type ServerState } from './state'

const emit = () => {
  global.state_event.serverStateUpdated({ ...state })
}

export const setConfigs = (configs: LX.ServerConfig[]) => {
  state.configs = configs
  if (state.activeConfigId && !configs.some(c => c.id === state.activeConfigId)) {
    state.activeConfigId = null
    state.activeConfig = null
    state.isConnected = false
  } else if (state.activeConfigId) {
    state.activeConfig = configs.find(c => c.id === state.activeConfigId) ?? null
  }
  emit()
}

export const addConfig = (config: LX.ServerConfig) => {
  state.configs = [...state.configs, config]
  emit()
}

export const updateConfig = (config: LX.ServerConfig) => {
  state.configs = state.configs.map(c => c.id === config.id ? config : c)
  if (state.activeConfigId === config.id) {
    state.activeConfig = config
  }
  emit()
}

export const removeConfig = (id: string) => {
  state.configs = state.configs.filter(c => c.id !== id)
  if (state.activeConfigId === id) {
    state.activeConfigId = null
    state.activeConfig = null
    state.isConnected = false
  }
  emit()
}

export const setActiveConfig = (id: string | null) => {
  state.activeConfigId = id
  state.activeConfig = id ? state.configs.find(c => c.id === id) ?? null : null
  if (!id) state.isConnected = false
  emit()
}

export const setConnected = (connected: boolean) => {
  state.isConnected = connected
  emit()
}

export const setConnecting = (connecting: boolean) => {
  state.isConnecting = connecting
  emit()
}

export const setError = (error: string | null) => {
  state.error = error
  emit()
}

export type { ServerState }
