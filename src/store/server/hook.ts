import { useEffect, useState } from 'react'
import state, { type ServerState } from './state'

export const useServerState = () => {
  const [value, update] = useState<ServerState>({ ...state })

  useEffect(() => {
    global.state_event.on('serverStateUpdated', update)
    return () => {
      global.state_event.off('serverStateUpdated', update)
    }
  }, [])

  return value
}

export const useServerConfigs = () => {
  const serverState = useServerState()
  return serverState.configs
}

export const useActiveServer = () => {
  const serverState = useServerState()
  return serverState.activeConfig
}

export const useIsConnected = () => {
  const serverState = useServerState()
  return serverState.isConnected
}
