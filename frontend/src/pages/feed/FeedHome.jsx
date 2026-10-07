import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Col, Empty, Grid, Row, Segmented, Select, Skeleton } from 'antd'
import {
  AppstoreOutlined, FireOutlined, GithubOutlined, LikeOutlined, LineChartOutlined, MessageOutlined, ReloadOutlined, RightOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { feedApi } from '../../api/feed'
import { searchApi } from '../../api/search'
import { topicApi } from '../../api/topic'
import { assetUrl } from '../../config/origin'
import { useAuth } from '../../auth/AuthContext'
import PostCard from '../../components/PostCard'
import PullRefreshIndicator from '../../components/PullRefreshIndicator'
import useIsMobile from '../../hooks/useIsMobile'
import usePullToRefresh from '../../hooks/usePullToRefresh'
import { getAnonId } from '../../utils/anonId'
import { clamp } from '../../utils/postText'
import { trackClick, trackImpression } from '../../utils/feedEvents'

/**
 * 首页：跨专题的帖子推荐流（2026-10-07。规划见 vault《79》，实现见《82》）。
 *
 * 三个标签：For you（算法排的，后端 FeedService + FeedRanker）、Latest（时间倒序）、
 * Following（关注的人，登录才有）。访客额外看到一条介绍横幅。
 * 桌面端右栏两张卡：推荐专题、热帖榜（2026-10-08 加，手机上不显示）。
 *
 * 列表状态按「谁 + 标签 + 专题」缓存在模块里 10 分钟：点进帖子再退回来，接着原来的列表，
 * 不重新拉、翻到的位置也还在。后端的「为你推荐」快照能活 30 分钟，所以缓存里的游标接着用没问题。
 * 换标签、换专题、下拉刷新时，内层列表按 key 整个重建。
 */

const PAGE = 10
const BRAND = '#4096ff'
const MEDAL = ['#f5222d', '#fa8c16', '#faad14']
const GITHUB_URL = 'https://github.com/Epochzzz-Leo/dream-everything'
const TABS = ['foryou', 'latest', 'following']
const SOURCE = { foryou: 'feed_for_you', latest: 'feed_latest', following: 'feed_following' }
const CACHE_MS = 10 * 60 * 1000
const cache = new Map()
/** 最近一次拿到的专题筛选项：换标签时先用着，免得下拉框一闪变空 */
let lastTopics = []

export default function FeedHome() {
  const { user, loading: authLoading } = useAuth()
  const isMobile = useIsMobile()
  // 右栏只在 lg（≥992px）以上渲染：窄屏连组件都不挂，免得手机上白发两个请求
  const wide = Grid.useBreakpoint().lg
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
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <PullRefreshIndicator pull={pull} refreshing={refreshing} threshold={threshold} />

      {/* 只有访客看得到：从简历点进来的人第一眼要知道这是什么站 */}
      {!authLoading && !user && (
        <div className="banner-light" style={{ borderRadius: 16, marginBottom: 16, padding: isMobile ? '16px 14px' : '22px 26px' }}>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800 }}>Dream Everything</div>
          <div style={{ color: '#595959', marginTop: 6, fontSize: 13.5 }}>
            A forum and 50 seasons of NBA stats, built and run by one person.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<LineChartOutlined />} onClick={() => navigate('/league')}>
              Explore NBA stats
            </Button>
            <Button icon={<GithubOutlined />} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </Button>
          </div>
        </div>
      )}

      <Row gutter={isMobile ? [0, 16] : [16, 16]}>
        <Col xs={24} lg={16} xl={17}>
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
        </Col>

        {/* 右栏：推荐专题 + 热帖榜。跟着页面滚动时停在顶栏下面 */}
        {wide && (
          <Col lg={8} xl={7}>
            <div style={{ position: 'sticky', top: 76, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TopicsRail />
              <HotPostsRail />
            </div>
          </Col>
        )}
      </Row>
    </div>
  )
}

/** 右栏：推荐专题。公开且没下架的专题，帖子多的在前，最多 6 个；私密专题从侧栏和 Topics 进 */
function TopicsRail() {
  const [topics, setTopics] = useState(null)
  // 992 到 1199 宽时右栏只有两百多像素，完整标题会被截成「Recommended t…」，换成短的
  const xl = Grid.useBreakpoint().xl
  useEffect(() => {
    let alive = true
    topicApi.list()
      .then((r) => {
        if (!alive) return
        const list = (Array.isArray(r) ? r : r?.records || [])
          .filter((t) => t.visibility !== 'private' && t.listed !== false)
          .sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0) || String(a.name).localeCompare(String(b.name)))
        setTopics(list.slice(0, 6))
      })
      .catch(() => { if (alive) setTopics([]) })
    return () => { alive = false }
  }, [])
  return (
    <Card
      title={<span><AppstoreOutlined style={{ color: BRAND, marginRight: 6 }} />{xl ? 'Recommended topics' : 'Topics'}</span>}
      extra={<Link to="/news" style={{ fontSize: 13, color: '#888' }}>All <RightOutlined style={{ fontSize: 10 }} /></Link>}
      loading={topics === null}
      style={{ borderRadius: 14 }}
      styles={{ body: { padding: '6px 18px 10px' } }}
    >
      {topics?.length ? topics.map((t, i) => (
        <Link
          key={t.topicId}
          to={`/news/topic/${t.topicId}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', color: 'inherit',
            borderBottom: i === topics.length - 1 ? 'none' : '1px solid #f5f5f5',
          }}
        >
          {t.banner ? (
            <img src={assetUrl(t.banner)} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#f5f5f5' }} />
          ) : (
            <span
              style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', background: '#e6f4ff', color: BRAND, fontWeight: 800,
              }}
            >
              {String(t.name || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, ...clamp(1) }}>{t.name}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2, ...clamp(1) }}>{t.description || 'No description yet'}</div>
          </div>
          <span style={{ fontSize: 12, color: '#bbb', flexShrink: 0 }}>{`${t.postCount ?? 0} posts`}</span>
        </Link>
      )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No topics yet" />}
    </Card>
  )
}

/** 右栏：热帖榜。全站公开专题的帖子按「点赞×2 + 评论×3」排（后端 /search/hotPosts，和搜索页的热榜同一份） */
function HotPostsRail() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    searchApi.hotPosts(8)
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [])
  return (
    <Card
      title={<span><FireOutlined style={{ color: '#f5222d', marginRight: 6 }} />Hot posts</span>}
      loading={rows === null}
      style={{ borderRadius: 14 }}
      styles={{ body: { padding: '6px 18px 10px' } }}
    >
      {rows?.length ? rows.map((p, i) => (
        <Link
          key={p.newsId}
          to={`/news/${p.newsId}`}
          onClick={() => trackClick({ newsId: p.newsId, source: 'hot', position: i })}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', color: 'inherit',
            borderBottom: i === rows.length - 1 ? 'none' : '1px solid #f5f5f5',
          }}
        >
          <span style={{ width: 18, textAlign: 'center', fontStyle: 'italic', fontWeight: 800, color: i < 3 ? MEDAL[i] : '#c8c8c8' }}>
            {i + 1}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: i < 3 ? 600 : 400, ...clamp(1) }}>{p.title || '(untitled)'}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2, ...clamp(1) }}>
              {p.topicName ? `${p.topicName} · ` : ''}<LikeOutlined /> {p.goodNum ?? 0} · <MessageOutlined /> {p.commentNum ?? 0}
            </div>
          </div>
        </Link>
      )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here yet" />}
    </Card>
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
