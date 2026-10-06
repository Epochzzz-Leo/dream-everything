import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Avatar, Button, Card, Divider, Input, InputNumber, Popover, Spin, Switch, Tag, message } from 'antd'
import { ArrowLeftOutlined, CrownFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { userApi } from '../../api/user'
import { useAuth } from '../../auth/AuthContext'
import { parseTitles, TITLE_PALETTE, TITLE_HEX } from '../../utils/titles'

/**
 * 用户管理详情页（超级管理员，/admin/users/:userId）。
 * 逐项管理一个用户：账号/动作权限/功能模块（开关，即改即存）+ **头衔**（可多个、可各自设颜色）。
 * 权限开关对超管和自己锁定；头衔是荣誉标签、非权限，可给任何人（含超管/自己）加。
 */

const fmt = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—')
const avatarColor = (name) => {
  let h = 0
  for (const c of String(name || '?')) h = (h * 31 + c.codePointAt(0)) % 360
  return `hsl(${h}, 52%, 52%)`
}

/** 颜色小圆点选择板 */
function Swatches({ value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: 150 }}>
      {TITLE_PALETTE.map((c) => (
        <span
          key={c}
          title={c}
          onClick={() => onPick(c)}
          style={{
            width: 22, height: 22, borderRadius: '50%', background: TITLE_HEX[c], cursor: 'pointer',
            border: value === c ? '2px solid #333' : '2px solid #fff', boxShadow: '0 0 0 1px #eee',
          }}
        />
      ))}
    </div>
  )
}

export default function UserManageDetail() {
  const { userId } = useParams()
  const { user: me, dn } = useAuth()
  const [data, setData] = useState(null)
  const [titles, setTitles] = useState([]) // [{t,c}]
  const [newT, setNewT] = useState('')
  const [newC, setNewC] = useState('blue')
  const [savedTopicLimit, setSavedTopicLimit] = useState(null) // 已落库的配额，用来判断失焦时值有没有真变

  const load = () => userApi.adminDetail(userId).then(setData).catch(() => setData(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [userId])
  useEffect(() => { setTitles(parseTitles(data?.titles)) }, [data?.titles])
  // 只在换用户时重置基准值；跟随 topicLimit 会把用户正在输入的中间值当成"已保存"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSavedTopicLimit(data?.topicLimit ?? null) }, [data?.userId])

  if (data === null) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />

  const locked = data.isSuperManager || data.userId === me?.userId // 权限开关：超管/自己不可改

  const setPerm = async (field, checked) => {
    setData((d) => ({ ...d, [field]: checked }))
    try {
      await userApi.setUserPerms({ userId, [field]: checked ? '1' : '0' })
      message.success('Saved')
    } catch {
      load()
    }
  }

  const commitTitles = async (arr) => {
    setTitles(arr) // 乐观（颜色来自色板、文字已限长去重，与后端规范化结果一致）
    try {
      await userApi.setUserTitles(userId, JSON.stringify(arr))
      message.success('Titles updated')
    } catch {
      load()
    }
  }
  const addTitle = () => {
    // 头衔数据的格式是 { t: 文字, c: 颜色 }，存进后端的就是它
    const text = newT.trim()
    if (!text) return
    if (titles.some((x) => x.t === text)) { message.info('That title already exists'); return }
    if (titles.length >= 10) { message.info('Up to 10 titles'); return }
    commitTitles([...titles, { t: text, c: newC }])
    setNewT('')
  }
  const removeTitle = (i) => commitTitles(titles.filter((_, idx) => idx !== i))
  const recolor = (i, c) => commitTitles(titles.map((x, idx) => (idx === i ? { ...x, c } : x)))

  /**
   * 专题配额：输入时只改本地，失焦/回车才提交，所以不会每敲一个数字就存一次。
   * 留空提交空串 = 后端清成 NULL = 跟随系统默认。
   */
  const commitTopicLimit = async () => {
    const next = data.topicLimit ?? null
    if (next === savedTopicLimit) return
    try {
      await userApi.setUserPerms({ userId, topicLimit: next === null ? '' : String(next) })
      setSavedTopicLimit(next)
      message.success('Saved')
    } catch {
      load()
    }
  }

  const permRow = (label, field, desc) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {desc && <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>{desc}</span>}
      </div>
      <Switch checked={!!data[field]} disabled={locked} onChange={(c) => setPerm(field, c)} />
    </div>
  )

  return (
    <>
      {/* 身份卡（返回走外层布局的全局返回按钮） */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {data.avatar
            ? <Avatar size={64} src={data.avatar} />
            : <Avatar size={64} style={{ background: avatarColor(data.userNickname), fontWeight: 800, fontSize: 26 }}>{String(data.userNickname || '?')[0].toUpperCase()}</Avatar>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {dn(data.userId, data.userNickname)}
              {data.isSuperManager && <Tag color="red"><CrownFilled /> Super admin</Tag>}
              {data.userId === me?.userId && <Tag>Me</Tag>}
            </div>
            <div style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
              {dn(data.userId, data.userNickname) !== data.userNickname && `Original nickname ${data.userNickname} · `}
              {`Login name ${data.loginName || '—'} · Registered ${fmt(data.registTime)} · Last sign-in ${fmt(data.lastLoginTime)}`}
            </div>
          </div>
        </div>
      </Card>

      {/* 头衔 */}
      <Card title="Titles" style={{ borderRadius: 12, marginBottom: 16 }} extra={<span style={{ color: '#999', fontSize: 12 }}>Several allowed, each with its own color</span>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minHeight: 24 }}>
          {titles.length
            ? titles.map((item, i) => (
                <Popover key={item.t} trigger="click" title="Change color" content={<Swatches value={item.c} onPick={(c) => recolor(i, c)} />}>
                  <Tag
                    color={TITLE_HEX[item.c] || '#1677ff'}
                    closable
                    onClose={(e) => { e.preventDefault(); removeTitle(i) }}
                    style={{ cursor: 'pointer', marginInlineEnd: 0, fontSize: 13, padding: '1px 8px' }}
                  >
                    {item.t}
                  </Tag>
                </Popover>
              ))
            : <span style={{ color: '#bbb' }}>No titles yet</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={newT} onChange={(e) => setNewT(e.target.value)} onPressEnter={addTitle} placeholder="Title text" maxLength={20} style={{ width: 200 }} />
          <Popover trigger="click" title="Pick a color" content={<Swatches value={newC} onPick={setNewC} />}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 10px', border: '1px solid #d9d9d9', borderRadius: 6 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: TITLE_HEX[newC] }} /> Color
            </span>
          </Popover>
          <Button type="primary" ghost onClick={addTitle}>Add</Button>
        </div>
        <div style={{ color: '#bbb', fontSize: 12, marginTop: 8 }}>Click a title to change its color, or × to remove it. Up to 10.</div>
      </Card>

      {/* 账号与动作权限 */}
      <Card title={'Account & Permissions'} style={{ borderRadius: 12, marginBottom: 16 }}>
        {locked && <div style={{ color: '#faad14', fontSize: 12, marginBottom: 4 }}>Permissions of super admins and of your own account can't be changed</div>}
        {permRow('Allow sign-in', 'enabled')}
        <Divider style={{ margin: '2px 0' }} />
        {permRow('Browse forum / news', 'canBrowse')}
        {permRow('Comment', 'canComment')}
        {permRow('Post', 'canPost')}
        {permRow('Create topics', 'canCreateTopic', 'Allowed by default. Whoever creates a topic becomes its owner')}
        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>Topic limit</span>
            <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
              {`Leave blank for the system default (${data.topicLimitDefault ?? 2}). Created so far: ${data.topicOwned ?? 0}`}
            </span>
          </div>
          <InputNumber
            min={0}
            max={99}
            precision={0}
            value={data.topicLimit ?? null}
            placeholder={`Default ${data.topicLimitDefault ?? 2}`}
            disabled={locked}
            style={{ width: 110 }}
            onChange={(v) => setData((d) => ({ ...d, topicLimit: v }))}
            onBlur={commitTopicLimit}
            onPressEnter={commitTopicLimit}
          />
        </div>
      </Card>

      {/* 功能模块 */}
      <Card title="Features" style={{ borderRadius: 12 }} extra={<span style={{ color: '#999', fontSize: 12 }}>When off, it disappears from this user's navigation and direct links stop working too</span>}>
        {/* NBA 和其余几项是同一套语义：默认开放，在这里关掉只是对这个人隐藏。
            2026-10-06 起游客也能看（后端对没登录的请求按 IP 限流），所以这里关掉不是访问控制：
            这个人退出登录照样能看到。 */}
        {permRow('NBA Data', 'featData', 'Open to everyone, including visitors who are not signed in. Turning it off hides it for this user only. Covers League / Stats / League Rankings / History / Compare')}
        {permRow('News', 'featNews')}
        {permRow('Chat Everything', 'featForum')}
        {permRow('Messages', 'featPm')}
        {permRow('Schedule', 'featSchedule')}
      </Card>
    </>
  )
}
