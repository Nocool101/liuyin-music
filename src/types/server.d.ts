declare namespace LX {
  interface ServerConfig {
    id: string
    name: string
    baseUrl: string
    username: string
    password: string
    token: string
    createdAt: number
  }

  interface ServerState {
    configs: ServerConfig[]
    activeConfigId: string | null
    activeConfig: ServerConfig | null
    isConnected: boolean
    isConnecting: boolean
    error: string | null
  }
}
