import http from './http'

/**
 * 开黑战绩（英雄联盟）。
 *
 * **这里没有一个查询会去打 Riot 的接口**——数据由后端定时抓好躺在库里，
 * 页面查的是本地 SQL。这不是优化而是前提：Riot 的个人 key 只有 100 次/2 分钟，
 * 要是翻一页就现场拉一次，几个人同时看榜就能把全站配额打光。
 *
 * 唯一会碰到 Riot 的是 `bind`（把 Riot ID 换成 PUUID），一个号一辈子一次。
 */
const form = (obj) => {
  const body = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, v) })
  return body
}

export const lolApi = {
  /** 我绑过的号（一个人可以有小号，所以是数组） */
  accounts: () => http.get('/lol/accounts'),
  /** riotId 传完整的 `名字#后缀`，后端负责拆 */
  bind: (riotId) => http.post('/lol/bind', form({ riotId })),
  unbind: (accountId) => http.post('/lol/unbind', form({ accountId })),

  /**
   * 战绩流：每场带上这一场里的自己人。
   *
   * `date` 给了就只看那一天，后端会忽略 `days`——「看某一天」和「看最近 N 天」
   * 同时生效只会互相削。`player` 是模糊搜索，站内昵称和游戏 ID 任一命中即可。
   */
  feed: (params) => http.get('/lol/feed', { params }),
  /** 某个月里哪几天有对局，给日历标注用 */
  dates: (month) => http.get('/lol/dates', { params: { month } }),
  /** 搜索框的候选：站内昵称 + 已绑定的游戏 ID */
  searchOptions: () => http.get('/lol/searchOptions'),
  /**
   * 一个人的资料卡：汇总 + 英雄池 + 位置 + 队友 + 绑定的号与段位，一次给全。
   *
   * `puuids` 只看这几个绑定账号，`positions` 只看这几个位置（后者只筛英雄池和战绩，
   * 汇总和位置分布不跟着变——见后端 `LolController.player` 的说明）。两者都是逗号串，空 = 不筛。
   */
  player: (userId, days, puuids, positions) =>
    http.get('/lol/player', { params: { userId, days, puuids, positions } }),
  /** 个人榜 + 概览。queueId 传 0 或省略 = 全部队列 */
  board: (params) => http.get('/lol/board', { params }),
  /** 开黑组合榜 */
  duo: (params) => http.get('/lol/duo', { params }),
  /**
   * 单局详情：这一场十个人的完整数据。
   *
   * 单独一个接口而不是塞进战绩流——战绩流一次返回三十场，每场再挂十个人
   * 会让响应大出一个数量级，而绝大多数场次没人会点开。按需取。
   */
  matchDetail: (matchId) => http.get('/lol/match', { params: { matchId } }),
}

/**
 * 队列编号 → 显示名（Riot 官方英文名）。
 *
 * 只列这个圈子实际会打到的几个，其余原样显示编号——把 Riot 的全部队列表抄进来
 * 有一百多条，绝大多数（各种限时模式、教程、机器人局）这辈子不会出现在榜上，
 * 而抄进来的那一刻它就开始过期了。
 */
export const QUEUE_LABEL = {
  400: 'Normal Draft',
  420: 'Ranked Solo/Duo',
  430: 'Normal Blind',
  440: 'Ranked Flex',
  450: 'ARAM',
  490: 'Quickplay',
  700: 'Clash',
  1700: 'Arena',
  1900: 'URF',
}

export const queueName = (id) => QUEUE_LABEL[id] || `Queue ${id}`

/** 榜单和筛选条共用的一组队列选项（0 = 全部） */
export const QUEUE_OPTIONS = [
  { value: 0, label: 'All Queues' },
  { value: 420, label: 'Ranked Solo/Duo' },
  { value: 440, label: 'Ranked Flex' },
  { value: 400, label: 'Normal Draft' },
  { value: 450, label: 'ARAM' },
]

/** 时间窗选项。默认 30 天：够攒出样本，又不至于把三个月前的手感算进今天 */
export const DAYS_OPTIONS = [
  { value: 7, label: 'Last 7 Days' },
  { value: 30, label: 'Last 30 Days' },
  { value: 90, label: 'Last 90 Days' },
  { value: 365, label: 'Last Year' },
]

/** Riot 的位置代码 → 显示名。teamPosition 可能是空串（大乱斗没有分路） */
export const POSITION_LABEL = {
  TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support',
}

