interface LoginResponse {
  success: boolean
  token?: string
  error?: string
}

interface SubsonicResponse {
  'subsonic-response': {
    status: string
    version: string
    error?: {
      code: number
      message: string
    }
  }
}

const TIMEOUT = 15000

const fetchWithTimeout = async(url: string, options: RequestInit, timeout = TIMEOUT): Promise<Response> => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(id)
  }
}

export const login = async(baseUrl: string, username: string, password: string): Promise<{ token: string } | { error: string }> => {
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/api/user/login`
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data: LoginResponse = await response.json()
    if (data.success && data.token) {
      return { token: data.token }
    }

    return { error: data.error ?? 'Login failed' }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { error: 'Connection timeout' }
    }
    return { error: err.message ?? 'Unknown error' }
  }
}

export const pingSubsonic = async(baseUrl: string, username: string, password: string): Promise<{ ok: true } | { error: string }> => {
  try {
    const encodedPassword = `enc:${Buffer.from(password).toString('hex')}`
    const url = `${baseUrl.replace(/\/+$/, '')}/rest/ping?u=${encodeURIComponent(username)}&p=${encodeURIComponent(encodedPassword)}&v=1.16.1&c=liuyin&f=json`

    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data: SubsonicResponse = await response.json()
    if (data['subsonic-response'].status === 'ok') {
      return { ok: true }
    }

    return { error: data['subsonic-response'].error?.message ?? 'Ping failed' }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { error: 'Connection timeout' }
    }
    return { error: err.message ?? 'Unknown error' }
  }
}

export const connectServer = async(config: LX.ServerConfig): Promise<{ token: string } | { error: string }> => {
  // First try login to get token
  const loginResult = await login(config.baseUrl, config.username, config.password)
  if ('error' in loginResult) {
    return loginResult
  }

  // Then verify Subsonic connection
  const pingResult = await pingSubsonic(config.baseUrl, config.username, config.password)
  if ('error' in pingResult) {
    return pingResult
  }

  return { token: loginResult.token }
}

export const createServerConfig = (name: string, baseUrl: string, username: string, password: string): LX.ServerConfig => {
  return {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    name,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    username,
    password,
    token: '',
    createdAt: Date.now(),
  }
}
