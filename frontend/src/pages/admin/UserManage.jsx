import { useRef } from 'react'
import { ProTable } from '@ant-design/pro-components'
import { Avatar, Tag } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../../api/user'
import { useAuth } from '../../auth/AuthContext'
import UserTitles from '../../components/UserTitles'

/**
 * 全局用户管理（超级管理员）——列表页。
 * 每行是一个用户的小结（身份 + 头衔 + 哪些权限/功能被关），**点击整行进入该用户的管理详情页**
 * （/admin/users/:userId）逐项设置。列表本身不再直接放一堆开关，菜单再多也不挤。
 */

const fmt = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—')
const avatarColor = (name) => {
  let h = 0
  for (const c of String(name || '?')) h = (h * 31 + c.codePointAt(0)) % 360
  return `hsl(${h}, 52%, 52%)`
}

export default function UserManage() {
  const { user, dn } = useAuth()
  const navigate = useNavigate()
  const actionRef = useRef()

  // 权限/功能小结：被关掉的用红标列出；全开=一个绿标。标签文字同时当 React key
  const summary = (r) => {
    const off = []
    if (!r.enabled) off.push('No sign-in')
    if (!r.canBrowse) off.push('No browsing')
    if (!r.canComment) off.push('No commenting')
    if (!r.canPost) off.push('No posting')
    if (!r.featData) off.push('No NBA') // 默认是有的，出现这个标说明被在详情页里关掉了
    if (!r.featNews) off.push('No News')
    if (!r.featForum) off.push('No Chat Everything')
    if (!r.featPm) off.push('No Messages')
    if (!r.featSchedule) off.push('No Schedule')
    if (!off.length) return <Tag color="green" style={{ marginInlineEnd: 0 }}>All enabled</Tag>
    return off.map((label) => <Tag key={label} color="red" style={{ marginInlineEnd: 4 }}>{label}</Tag>)
  }

  const columns = [
    {
      title: 'User', dataIndex: 'userNickname', ellipsis: true,
      render: (_, r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {r.avatar
            ? <Avatar size={28} src={r.avatar} />
            : <Avatar size={28} style={{ background: avatarColor(r.userNickname), fontWeight: 700 }}>{String(r.userNickname || '?')[0].toUpperCase()}</Avatar>}
          <span style={{ fontWeight: 600 }}>{dn(r.userId, r.userNickname)}</span>
          {r.isSuperManager && <Tag color="red">Super admin</Tag>}
          {r.userId === user?.userId && <Tag>Me</Tag>}
          <UserTitles titles={r.titles} size="sm" />
        </span>
      ),
    },
    { title: 'Registered', dataIndex: 'registTime', width: 150, search: false, render: (_, r) => fmt(r.registTime) },
    { title: 'Last sign-in', dataIndex: 'lastLoginTime', width: 150, search: false, render: (_, r) => fmt(r.lastLoginTime) },
    { title: 'Permissions / Features', search: false, render: (_, r) => summary(r) },
    { title: '', width: 40, align: 'center', search: false, render: () => <RightOutlined style={{ color: '#ccc' }} /> },
  ]

  return (
    <ProTable
      actionRef={actionRef}
      rowKey="userId"
      headerTitle="User Admin"
      columns={columns}
      search={{ labelWidth: 'auto' }}
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 20 }}
      onRow={(r) => ({ onClick: () => navigate(`/admin/users/${r.userId}`), style: { cursor: 'pointer' } })}
      request={async (params) => {
        const res = await userApi.adminList({
          page: params.current,
          limit: params.pageSize,
          keyword: params.userNickname || undefined,
        })
        return { data: res.records || [], total: res.total || 0, success: true }
      }}
    />
  )
}
