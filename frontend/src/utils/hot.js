// 帖子热度的分数由后端给：列表接口每条帖子带 hotScore（算法在后端 HotScore 里，全站只有那一份）。
// 前端不再自己算「点赞×2 + 评论×3」，只负责下面这一个比较规则：热度高的在前，同分时新的在前。
import dayjs from 'dayjs'

export const hotOf = (p) => p?.hotScore ?? 0

export const byHotThenNewest = (a, b) =>
  hotOf(b) - hotOf(a) || dayjs(b.publishDate).valueOf() - dayjs(a.publishDate).valueOf()
