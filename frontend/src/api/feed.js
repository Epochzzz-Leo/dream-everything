import http from './http'

/**
 * 首页推荐流（公开，访客也能看）。
 * 参数：tab（foryou / latest / following）、cursor（上一页给的 nextCursor）、limit、topicId、anonId。
 * 返回 {tab, items, nextCursor, topics?}；nextCursor 为 null 表示没有下一页，topics 只有第一页带。
 */
export const feedApi = {
  list: (params) => http.get('/feed', { params }),
}
