import { Avatar, Tag } from 'antd'
import {
  BulbOutlined, EditOutlined, EyeInvisibleOutlined, LikeOutlined, LockOutlined, MessageOutlined, StarOutlined,
} from '@ant-design/icons'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { assetUrl } from '../config/origin'
import { SuperAdminBadge, TopicOwnerBadge } from './RoleBadges'
import UserTitles from './UserTitles'
import useIsMobile from '../hooks/useIsMobile'
import { avatarColor, clamp, coverOf, textOf, timeAgo } from '../utils/postText'

const BRAND = '#fa541c'

/**
 * 单条帖子卡：头像 + 标题/摘要/元信息 + 首图缩略图。
 *
 * 专题页和首页推荐流共用这一张卡（2026-10-07 从 NewsList 里搬出来）。推荐流多传三样：
 * - topicName：作者行后面写「in 专题名」，点它进专题（推荐流是跨专题的，得知道这篇来自哪）；
 * - reason：推荐理由的文字，写在卡片左下角（算法看不见，理由让它被看见）；
 * - onOpen：点开卡片时回调（推荐流用它上报「点开」）。点作者名、专题名不算点开。
 */
export default function PostCard({ post, topicOwnerIds, categoryName, topicName, reason, onOpen }) {
  const { dn } = useAuth() // 备注名：我给谁备注过，全站看到的就是备注名
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()
  // 推荐流接口直接给 cover / excerpt（不带正文）；帖子列表接口给的是整篇正文，这里自己抠
  const cover = 'cover' in post ? (post.cover ? assetUrl(post.cover) : null) : coverOf(post.content)
  const excerpt = 'excerpt' in post ? post.excerpt : textOf(post.content)
  // 整卡是跳帖子的 Link；点头像/名字改跳作者主页（拦掉卡片默认跳转）
  const toProfile = post.authorId
    ? (e) => { e.preventDefault(); e.stopPropagation(); navigate(`/users/${post.authorId}`) }
    : undefined
  const toTopic = topicName && post.topicId
    ? (e) => { e.preventDefault(); e.stopPropagation(); navigate(`/news/topic/${post.topicId}`) }
    : undefined
  return (
    <Link
      // 草稿点进去直接是编辑器：继续写、或者在那儿点「发布」
      to={post.draft === '1' ? `/news/edit/${post.newsId}` : `/news/${post.newsId}`}
      // 草稿走编辑器，那就和「发帖」一样浮在这一页上面（见 App.jsx）
      state={post.draft === '1' ? { composerBackground: location } : undefined}
      onClick={onOpen}
      className="post-card"
      style={{
        // 手机上左右内边距和间距都收紧：正文区实测只有 116px 宽（屏 390 减掉
        // 页面内边距、栅格间距、卡片内边距、头像、封面图），两行摘要放不下几个字，
        // 卡片因此又窄又矮。竖直方向反而加大，让卡片本身更"有分量"
        display: 'flex', gap: isMobile ? 10 : 14, alignItems: 'flex-start', color: 'inherit',
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 14,
        padding: isMobile ? '18px 14px' : '16px 18px',
        transition: 'all .2s',
      }}
    >
      <span onClick={toProfile} style={{ cursor: toProfile ? 'pointer' : undefined, flexShrink: 0 }}>
        {post.authorAvatar ? (
          <Avatar size={isMobile ? 38 : 42} src={post.authorAvatar} />
        ) : (
          <Avatar size={isMobile ? 38 : 42} style={{ background: avatarColor(post.author), fontWeight: 700 }}>
            {String(post.author || '?').slice(0, 1).toUpperCase()}
          </Avatar>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 作者行：头像旁对齐——名字 + 身份标识（超管/题主）+ 头衔 + 时间 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#999', flexWrap: 'wrap' }}>
          <span onClick={toProfile} style={{ color: '#333', fontWeight: 600, fontSize: 13, cursor: toProfile ? 'pointer' : undefined }}>{dn(post.authorId, post.author) || 'Anonymous'}</span>
          {post.authorSuperManager && <SuperAdminBadge />}
          {topicOwnerIds?.includes(post.authorId) && <TopicOwnerBadge />}
          <UserTitles titles={post.authorTitles} size="sm" />
          <span style={{ color: '#bbb' }}>{timeAgo(post.publishDate)}</span>
          {topicName && (
            <span onClick={toTopic} style={{ color: '#8c8c8c', cursor: 'pointer' }}>in <b style={{ fontWeight: 600 }}>{topicName}</b></span>
          )}
        </div>
        {/* 标题（含置顶/精华/锁定/隐藏标） */}
        <div className="post-title" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, marginTop: 6, transition: 'color .2s', ...clamp(1) }}>
          {post.top === '1' && <Tag color="red" style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>Pinned</Tag>}
          {post.essence === '1' && <Tag color="volcano" style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>Featured</Tag>}
          {post.locked === '1' && <Tag icon={<LockOutlined />} style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>Locked</Tag>}
          {post.hidden === '1' && <Tag icon={<EyeInvisibleOutlined />} color="purple" style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>Hidden</Tag>}
          {/* 草稿只会出现在作者自己的列表里（后端过滤），所以这里不用再判断身份 */}
          {post.draft === '1' && <Tag icon={<EditOutlined />} color="gold" style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>Draft</Tag>}
          {categoryName && <Tag color="volcano" style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>{categoryName}</Tag>}
          {post.title || '(untitled)'}
        </div>
        {excerpt && (
          <div style={{ fontSize: 13.5, color: '#8c8c8c', marginTop: 6, lineHeight: 1.7, ...clamp(isMobile ? 3 : 2) }}>
            {excerpt}
          </div>
        )}
        {/* 底部：点赞/评论/收藏（标签在列表卡片不再展示——移动端排版反复折腾，进详情页看） */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: reason ? 'space-between' : 'flex-end', gap: 10, marginTop: 10, fontSize: 12, color: '#999' }}>
          {reason && (
            <span style={{ color: BRAND, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <BulbOutlined /> {reason}
            </span>
          )}
          <span style={{ flexShrink: 0, display: 'inline-flex', gap: 10, whiteSpace: 'nowrap' }}>
            <span><LikeOutlined /> {post.goodNum ?? 0}</span>
            <span><MessageOutlined /> {post.commentNum ?? 0}</span>
            <span><StarOutlined /> {post.favoriteCount ?? 0}</span>
          </span>
        </div>
      </div>
      {cover && (
        <img
          src={cover}
          alt=""
          style={{ width: isMobile ? 100 : 128, height: isMobile ? 92 : 88, objectFit: 'cover', borderRadius: 10, flexShrink: 0, background: '#f5f5f5' }}
        />
      )}
    </Link>
  )
}
