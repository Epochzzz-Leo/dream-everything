import { API_BASE } from '../config/origin'
import { getAnonId } from './anonId'

/**
 * 首页推荐流的行为上报：卡片出现在屏幕上（impression）、点开（click）。后端见 EventController。
 *
 * 攒一批再发：每 5 秒、或者攒够 20 条、或者页面切到后台时发一次；点开那一下立刻发。
 * 发送用 navigator.sendBeacon：页面关掉、跳走的那一刻也发得出去，不等回应，失败了也不弹错——
 * 上报丢几条无所谓，不能打扰人。它只能发 text/plain，后端按原始字节收、自己解析 JSON。
 */
const queue = []
const reported = new Set() // 这次打开页面期间报过的展示：同一个标签里的同一篇只报一次
let timer = null
const FLUSH_MS = 5000
const FLUSH_AT = 20
const BATCH_MAX = 50

function send(events) {
  const body = JSON.stringify({ anonId: getAnonId(), events })
  const url = `${API_BASE}/event/batch`
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return
  } catch {
    // 少数浏览器在页面卸载时会抛错，退回 fetch
  }
  try {
    fetch(url, {
      method: 'POST', body, keepalive: true, credentials: 'include',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }).catch(() => {})
  } catch {
    // 上报失败不影响页面
  }
}

export function flushEvents() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  while (queue.length) send(queue.splice(0, BATCH_MAX))
}

function push(event) {
  queue.push(event)
  if (queue.length >= FLUSH_AT) flushEvents()
  else if (!timer) timer = setTimeout(flushEvents, FLUSH_MS)
}

/** 卡片露出一半以上算一次展示。reason 没有就不带（JSON 里会省掉 undefined） */
export function trackImpression({ newsId, source, position, reason }) {
  const k = `${source}|${newsId}`
  if (reported.has(k)) return
  reported.add(k)
  push({ type: 'impression', newsId, source, position, reason: reason || undefined })
}

export function trackClick({ newsId, source, position, reason }) {
  push({ type: 'click', newsId, source, position, reason: reason || undefined })
  flushEvents()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEvents()
  })
}
