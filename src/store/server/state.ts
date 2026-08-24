export interface ServerState {
  configs: LX.ServerConfig[]
  activeConfigId: string | null
  activeConfig: LX.ServerConfig | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
}

const state: ServerState = {
  configs: [],
  activeConfigId: null,
  activeConfig: null,
  isConnected: false,
  isConnecting: false,
  error: null,
}

export default state
