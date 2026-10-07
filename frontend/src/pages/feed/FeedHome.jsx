import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Empty, Popover, Segmented, Select, Skeleton } from 'antd'
import { GithubOutlined, LineChartOutlined, QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { feedApi } from '../../api/feed'
import { useAuth } from '../../auth/AuthContext'
import PostCard from '../../components/PostCard'
import PullRefreshIndicator from '../../components/PullRefreshIndicator'
import useIsMobile from '../../hooks/useIsMobile'
import usePullToRefresh from '../../hooks/usePullToRefresh'
import { getAnonId } from '../../utils/anonId'
import { trackClick, trackImpression } from '../../utils/feedEvents'

/**
 * 首页：跨专题的帖子推荐流（2026-10-07。规划见 vault《79》，实现见《82》）。
 *
 * 三个标签：For you（算法排的，后端 FeedService + FeedRanker）、Latest（时间倒序）、
 * Following（关注的人，登录才有）。访客额外看到一条介绍横幅。
 *
 * 列表状态按「谁 + 标签 + 专题」缓存在模块里 10 分钟：点进帖子再退回来，接着原来的列表，
 * 不重新拉、翻到的位置也还在。后端的「为你推荐」快照能活 30 分钟，所以缓存里的游标接着用没问题。
 * 换标签、换专题、下拉刷新时，内层列表按 key 整个重建。
 */

const PAGE = 10
const GITHUB_URL = 'https://github.com/Epochzzz-Leo/dream-everything'
const TABS = ['foryou', 'latest', 'following']
const SOURCE = { foryou: 'feed_for_you', latest: 'feed_latest', following: 'feed_following' }
const CACHE_MS = 10 * 60 * 1000
const cache = new Map()
/** 最近一次拿到的专题筛选项：换标签时先用着，免得下拉框一闪变空 */
let lastTopics = []

const HOW_IT_WORKS = (
  <div style={{ maxWidth: 300, fontSize: 13, lineHeight: 1.6 }}>
    For you mixes four sources: the newest posts, hot posts (likes × 2 + comments × 3, halving every 7 days),
    posts a topic owner has commented on, and people you follow. Posts from one topic are spread out so no
    single topic takes over, and posts you have already opened move down. Each card says why it is here.
  </div>
)

export default function FeedHome() {
  const { user, loading: authLoading } = useAuth()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab = TABS.includes(rawTab) && (rawTab !== 'following' || user) ? rawTab : 'foryou'
  const topicId = params.get('topic') || ''
  const [topics, setTopics] = useState(lastTopics)
  const [refreshTick, setRefreshTick] = useState(0)
  const cacheKey = `${user?.userId || 'guest'}|${tab}|${topicId}`

  const setParam = (k, v, fallback) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    if (v && v !== fallback) p.set(k, v)
    else p.delete(k)
    return p
  }, { replace: true })

  const onTopics = useCallback((list) => {
    lastTopics = list
    setTopics(list)
  }, [])

  const refresh = () => {
    cache.delete(cacheKey)
    setRefreshTick((n) => n + 1)
    return Promise.resolve()
  }
  const { pull, refreshing, threshold } = usePullToRefresh(refresh, isMobile)

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <PullRefreshIndicator pull={pull} refreshing={refreshing} threshold={threshold} />

      {/* 只有访客看得到：从简历点进来的人第一眼要知道这是什么站 */}
      {!authLoading && !user && (
        <div
          style={{
            borderRadius: 16, color: '#fff', marginBottom: 16, padding: isMobile ? '16px 14px' : '22px 26px',
            background: 'linear-gradient(120deg, #fa541c 0%, #d4380d 60%, #ad2102 100%)',
          }}
        >
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800 }}>Dream Everything</div>
          <div style={{ opacity: 0.9, marginTop: 6, fontSize: 13.5 }}>
            A forum and 50 seasons of NBA stats, built and run by one person.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Button className="banner-btn" icon={<LineChartOutlined />} onClick={() => navigate('/league')}>
              Explore NBA stats
            </Button>
            <Button className="banner-btn" icon={<GithubOutlined />} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Segmented
          value={tab}
          onChange={(v) => setParam('tab', v, 'foryou')}
          options={[
            { label: 'For you', value: 'foryou' },
            { label: 'Latest', value: 'latest' },
            ...(user ? [{ label: 'Following', value: 'following' }] : []),
          ]}
        />
        <Popover content={HOW_IT_WORKS} title="How For you is ranked" trigger={isMobile ? 'click' : 'hover'}>
          <QuestionCircleOutlined style={{ color: '#999', cursor: 'pointer' }} />
        </Popover>
        <span style={{ flex: 1 }} />
        <Select
          allowClear
          placeholder="All topics"
          value={topicId || undefined}
          onChange={(v) => setParam('topic', v || '', '')}
          options={topics.map((t) => ({ value: t.topicId, label: t.name }))}
          style={{ minWidth: isMobile ? 130 : 180 }}
        />
        {!isMobile && <Button icon={<ReloadOutlined />} onClick={refresh} title="Refresh" />}
      </div>

      {authLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <FeedList
          key={`${cacheKey}|${refreshTick}`}
          cacheKey={cacheKey}
          tab={tab}
          topicId={topicId}
          onTopics={onTopics}
          onRetry={refresh}
        />
      )}
    </div>
  )
}

/** 一个标签、一个专题筛选下的列表。换标签/专题/刷新时按 key 整个重建，所以这里只管「接着往下翻」。 */
function FeedList({ cacheKey, tab, topicId, onTopics, onRetry }) {
  const [state, setState] = useState(() => {
    const c = cache.get(cacheKey)
    return c && Date.now() - c.at < CACHE_MS ? c : { items: [], cursor: null, done: false, error: false }
  })
  const [loadingMore, setLoadingMore] = useState(false)
  const listRef = useRef(null)
  const sentinelRef = useRef(null)
  const source = SOURCE[tab]

  const query = useCallback(
    (cursor) => feedApi.list({ tab, cursor: cursor || undefined, limit: PAGE, topicId: topicId || undefined, anonId: getAnonId() }),
    [tab, topicId],
  )
  const save = useCallback((next) => {
    cache.set(cacheKey, { ...next, at: Date.now() })
    setState(next)
  }, [cacheKey])

  // 第一页：缓存里有就不拉
  useEffect(() => {
    if (state.items.length || state.done) return undefined
    let alive = true
    query(null)
      .then((r) => {
        if (!alive) return
        if (r?.topics) onTopics(r.topics)
        save({ items: r?.items || [], cursor: r?.nextCursor || null, done: !r?.nextCursor, error: false })
      })
      .catch(() => { if (alive) setState((s) => ({ ...s, error: true })) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 只在挂载时拉第一页，换条件时整个组件会重建

  const loadMore = useCallback(() => {
    if (!state.cursor || loadingMore) return
    setLoadingMore(true)
    query(state.cursor)
      .then((r) => {
        // 快照过期、后端重算时可能有一两篇和前面重复，这里去掉
        const have = new Set(state.items.map((x) => x.newsId))
        const more = (r?.items || []).filter((x) => !have.has(x.newsId))
        save({ items: [...state.items, ...more], cursor: r?.nextCursor || null, done: !r?.nextCursor, error: false })
      })
      .catch(() => setState((s) => ({ ...s, error: true })))
      .finally(() => setLoadingMore(false))
  }, [state, loadingMore, query, save])

  // 往下滑到底之前 600px 就开始拉下一页
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !state.cursor || state.error || loadingMore || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [state.cursor, state.error, loadingMore, loadMore])

  // 展示上报：卡片露出一半以上记一次（同一篇在同一个标签里只报一次，见 feedEvents）
  useEffect(() => {
    const box = listRef.current
    if (!box || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const d = e.target.dataset
        trackImpression({ newsId: d.id, source, position: Number(d.pos), reason: d.reason })
        obs.unobserve(e.target)
      })
    }, { threshold: 0.5 })
    box.querySelectorAll('[data-feed-card]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [source, state.items.length])

  if (!state.items.length && !state.done && !state.error) {
    return <Skeleton active avatar paragraph={{ rows: 3 }} />
  }
  if (!state.items.length && state.error) {
    return (
      <Empty description="Couldn't load the feed">
        <Button onClick={onRetry}>Try again</Button>
      </Empty>
    )
  }
  if (!state.items.length) {
    return <Empty description={tab === 'following' ? 'Posts from people you follow will show up here' : 'No posts yet'} />
  }
  return (
    <>
      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.items.map((it, i) => (
          <div key={it.newsId} data-feed-card="" data-id={it.newsId} data-pos={i} data-reason={it.reason || ''}>
            <PostCard
              post={it}
              topicName={it.topicName}
              reason={tab === 'foryou' ? it.reasonLabel : null}
              onOpen={() => trackClick({ newsId: it.newsId, source, position: i, reason: it.reason })}
            />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} />
      <div style={{ textAlign: 'center', padding: '16px 0 8px', color: '#bbb', fontSize: 12 }}>
        {loadingMore && <Skeleton active avatar paragraph={{ rows: 2 }} />}
        {!loadingMore && state.error && (
          <Button onClick={() => { setState((s) => ({ ...s, error: false })) }}>Try again</Button>
        )}
        {!loadingMore && !state.error && state.cursor && <Button onClick={loadMore}>Load more</Button>}
        {state.done && "You're all caught up"}
      </div>
    </>
  )
}
