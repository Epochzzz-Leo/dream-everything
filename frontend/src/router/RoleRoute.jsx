import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth } from '../auth/AuthContext'

/**
 * 角色路由：在"已登录"之上再要求某角色。role = 'superManager' | 'manager'。
 * 角色标识来自后端 /user/current（isSuperManager / isManagerOrOver），与后端
 * @RequiresRole 同源（前端只控制"看得见/进得去"，后端接口仍强制校验，双保险）。
 */
export default function RoleRoute({ role, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spin style={{ display: 'block', marginTop: 120 }} />
  // 和 ProtectedRoute 一样记住来路，登录后直接回到这一页
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  const allowed =
    role === 'superManager' ? user.isSuperManager
      : role === 'manager' ? user.isManagerOrOver
        : true
  if (!allowed) return <Navigate to="/403" replace />
  return children
}
