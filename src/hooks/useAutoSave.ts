import { useEffect, useRef } from 'react'
import type { Strategy } from '@/modules/strategy'

const STORAGE_KEY = 'dca-strategy'

export function loadSavedStrategy(): Strategy | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Strategy
  } catch {
    return null
  }
}

export function saveStrategy(strategy: Strategy): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(strategy))
}

export function useAutoSave(strategy: Strategy, enabled: boolean) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!enabled) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      saveStrategy(strategy)
    }, 500)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [strategy, enabled])
}
