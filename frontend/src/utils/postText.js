import dayjs from 'dayjs'
import { assetUrl } from '../config/origin'

// 帖子卡片用的几个小工具：专题页的列表和首页推荐流共用（2026-10-07 从 NewsList 里搬出来）。

// 封面图是从正文 HTML 里抠出来的第一张图，抠出来的是相对路径 —— 套壳后要补全
// （assetUrl 在网页端是恒等函数）
export const coverOf = (html) => assetUrl(/<img[^>]+src=["']([^"']+)["']/i.exec(html || '')?.[1] || null)
export const textOf = (html) =>
  (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
export const clamp = (n) => ({
  display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden',
})

export const timeAgo = (v) => {
  if (!v) return ''
  const d = dayjs(v)
  const mins = dayjs().diff(d, 'minute')
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = dayjs().diff(d, 'hour')
  if (hrs < 24) return `${hrs} h ago`
  const days = dayjs().diff(d, 'day')
  if (days < 30) return `${days} d ago`
  return d.format('YYYY-MM-DD')
}

// 作者名 → 稳定的头像底色（列表行没有头像字段，用首字母彩底代替）
export const avatarColor = (name) => {
  let h = 0
  for (const c of String(name || '?')) h = (h * 31 + c.codePointAt(0)) % 360
  return `hsl(${h}, 52%, 52%)`
}
