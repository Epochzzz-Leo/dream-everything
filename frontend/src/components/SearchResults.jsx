import { Empty, Spin, Tag } from 'antd'
import dayjs from 'dayjs'
import {
  EnterOutlined, FileTextOutlined, FolderOpenOutlined, LockOutlined, ReadOutlined, UserOutlined,
} from '@ant-design/icons'
import { useAuth } from '../auth/AuthContext'
import TeamLogo from './TeamLogo'
import { displayName, teamName } from '../pages/players/rankConfig'

/**
 * 搜索结果的长相。桌面弹窗（GlobalSearch）和整页搜索（pages/search/SearchPage）共用这一份，
 * 输入是 searchModel.flatten() 打平出来的行。
 */

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// 接口给的是 UTC 时间（2026-10-05T09:28:36.000+00:00）。以前直接切前 10 位，
// 当地上午发的帖子会显示成前一天；按浏览器所在时区换算后再取日期
const dateStr = (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '')

const newsRow = (n, icon) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
    {icon}
    <span style={{ flex: 1, ...ellipsis }}>{n.title}</span>
    <span style={{ color: '#bbb', fontSize: 12, flexShrink: 0 }}>{dateStr(n.publishDate)}</span>
  </span>
)

/** 一行结果的内容，按类型分派。dn = 备注名（我给谁备注过，全站看到的就是备注名） */
function RowBody({ type, d, dn }) {
  if (type === 'player') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {/* 传过照片的球员出头像，否则还是球衣号标签 */}
        {d.photo ? (
          <img
            src={d.photo}
            alt=""
            style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', flexShrink: 0, background: '#f0f0f0' }}
          />
        ) : (
          <Tag style={{ marginInlineEnd: 0, flexShrink: 0 }}>#{d.playerNumber ?? '-'}</Tag>
        )}
        {/* 原来名字后面还有个灰色副标题，「永远显示另一种语言的名字」——英文界面上就是一行中文名。
            网站只保留英文之后主名就是英文名，副标题没有可补充的了，整个去掉 */}
        <b style={{ flexShrink: 0 }}>{displayName(d)}</b>
      </span>
    )
  }
  if (type === 'team') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <TeamLogo code={d.code} size={20} />
        <b>{teamName(d.code)}</b>
        <Tag style={{ marginInlineEnd: 0 }}>{d.code}</Tag>
        {d.conf && <span style={{ color: '#bbb', fontSize: 12 }}>{d.conf} · {d.div}</span>}
      </span>
    )
  }
  if (type === 'topic') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <FolderOpenOutlined style={{ color: '#fa8c16' }} />
        <b style={{ flex: 1, ...ellipsis }}>{d.name}</b>
        {d.visibility === 'private' && (
          <LockOutlined title="Private topic" style={{ color: '#bbb', flexShrink: 0 }} />
        )}
      </span>
    )
  }
  if (type === 'news') return newsRow(d, <ReadOutlined style={{ color: '#4096ff' }} />)
  if (type === 'forum') return newsRow(d, <FileTextOutlined style={{ color: '#999' }} />)
  return (
    <span>
      <UserOutlined style={{ marginRight: 8, color: '#999' }} />
      {dn(d.userId, d.userNickname || d.userName)}
      <span style={{ color: '#bbb', fontSize: 12, marginLeft: 8 }}>@{d.userName}</span>
    </span>
  )
}

/**
 * @param rows    searchModel.flatten() 的输出
 * @param active  键盘高亮的行下标；手机上没有键盘导航，传 -1（默认）即可
 */
export function SearchResults({ rows, loading, kw, active = -1, onHover, onPick }) {
  const { dn } = useAuth()
  const hasItem = rows.some((r) => r.kind === 'item')
  return (
    <>
      {loading && <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>}
      {!loading && kw.trim() && !hasItem && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing found" style={{ padding: 24 }} />
      )}
      {!loading && rows.map((r, i) =>
        r.kind === 'group' ? (
          <div key={r.key} style={{ padding: '10px 12px 4px', fontSize: 12, fontWeight: 600, color: '#8c8c8c', letterSpacing: 1 }}>
            {r.label}
          </div>
        ) : (
          <div
            key={r.key}
            onClick={() => onPick(r)}
            onMouseEnter={() => onHover?.(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              borderRadius: 8, cursor: 'pointer', fontSize: 14,
              background: active === i ? '#e6f4ff' : 'transparent',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}><RowBody type={r.type} d={r.d} dn={dn} /></span>
            {active === i && <EnterOutlined style={{ color: '#4096ff' }} />}
          </div>
        ),
      )}
    </>
  )
}

/** 最近搜索的胶囊组。两处共用，点一条就把它填回输入框重搜 */
export function HistoryChips({ history, onPick, onClear }) {
  if (!history.length) return null
  return (
    <div style={{ padding: '4px 4px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 8px' }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#999', letterSpacing: 1 }}>Recent searches</span>
        <a onClick={onClear} style={{ fontSize: 12, color: '#bbb' }}>Clear</a>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 8px' }}>
        {history.map((k) => (
          <Tag
            key={k}
            onClick={() => onPick(k)}
            style={{ margin: 0, cursor: 'pointer', borderRadius: 14, padding: '3px 12px', fontSize: 13, background: '#f5f5f5', border: '1px solid #eee' }}
          >
            {k}
          </Tag>
        ))}
      </div>
    </div>
  )
}
