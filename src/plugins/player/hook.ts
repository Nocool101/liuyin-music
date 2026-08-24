import { useEffect, useState, useRef } from 'react'
import {
  addLiuyinPlayerListener,
  liuyinGetDuration,
  liuyinGetPosition,
  liuyinGetState,
  initLiuyinPlayer,
} from './liuyinPlayer'

/** Get current playback state and subsequent updatates */
export const usePlaybackState = () => {
  const [state, setState] = useState('idle')

  useEffect(() => {
    initLiuyinPlayer()
    void liuyinGetState().then(s => setState(s === 'playing' ? 'playing' : 'paused'))
    const unsub = addLiuyinPlayerListener(data => {
      if (data.type !== 'STATE') return
      setState(data.data === 'playing' ? 'playing' : 'paused')
    })
    return unsub
  }, [])

  return state
}

const pollTrackPlayerStates = ['playing', 'buffering'] as const
/**
 * Poll for track progress for the given interval (in miliseconds)
 * @param updateInterval - ms interval
 */
export function useProgress(updateInterval: number) {
  const [state, setState] = useState({ position: 0, duration: 0, buffered: 0 })
  const playerState = usePlaybackState()
  const stateRef = useRef(state)
  const isUnmountedRef = useRef(true)
  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const getProgress = async() => {
    const [position, duration] = await Promise.all([
      liuyinGetPosition(),
      liuyinGetDuration(),
    ])
    // After the asynchronous code is executed, if the component has been uninstalled, do not update the status
    if (isUnmountedRef.current) return

    if (
      position === stateRef.current.position &&
      duration === stateRef.current.duration
    ) return

    const state = { position, duration, buffered: 0 }
    stateRef.current = state
    setState(state)
  }

  useEffect(() => {
    // @ts-expect-error
    if (!pollTrackPlayerStates.includes(playerState)) return

    void getProgress()

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const poll = setInterval(getProgress, updateInterval || 1000)
    return () => { clearInterval(poll) }
  }, [playerState, updateInterval])

  return state
}

export function useBufferProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    initLiuyinPlayer()
    const unsub = addLiuyinPlayerListener(data => {
      if (data.type !== 'STATE') return
      if (data.data === 'buffering') {
        setProgress(0.5)
      } else if (data.data === 'ready' || data.data === 'playing') {
        setProgress(1)
      }
    })
    return unsub
  }, [])

  return progress
}
