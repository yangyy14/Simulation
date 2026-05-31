import type { Strategy } from './strategy'

function toBase64Url(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64: string): string {
  let base64 = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return decodeURIComponent(escape(atob(base64)))
}

export function encodeStrategy(strategy: Strategy): string {
  const json = JSON.stringify(strategy)
  const encoded = toBase64Url(json)
  const url = new URL(window.location.href)
  url.searchParams.set('s', encoded)
  return url.toString()
}

export function decodeStrategy(): Strategy | null {
  const params = new URLSearchParams(window.location.search)
  const encoded = params.get('s')
  if (!encoded) return null
  try {
    const json = fromBase64Url(encoded)
    return JSON.parse(json) as Strategy
  } catch {
    return null
  }
}

export function hasStrategyInURL(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('s')
}
