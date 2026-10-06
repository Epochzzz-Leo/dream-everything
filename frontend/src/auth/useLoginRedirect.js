import { useLocation, useNavigate } from 'react-router-dom'

/**
 * 去登录页，并记住是从哪一页来的：登录成功后 Login 页按 state.from 跳回来。
 *
 * 以前各处直接 navigate('/login')。访客在帖子、投票、NBA 比赛页上点了要登录的按钮，
 * 登录完被送回首页，得自己再找回去。2026-10-05 用访客身份走查时记下了这个问题
 * （见 vault《79-推荐首页规划》第二章），NBA 对访客公开以后这种情况会更多。
 *
 * 不能在组件外用（要读当前路由）。拦截器里那种不在组件里的场合用 loginPathFrom。
 */
export default function useLoginRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => navigate('/login', { state: { from: location.pathname + location.search } })
}

/** 组件外用的版本：带上来源的登录页地址，比如 /login?from=%2Fgames%2F123 */
export const loginPathFrom = (from) => `/login?from=${encodeURIComponent(from)}`

/**
 * 登录成功后要跳去哪：只接受站内路径。
 * 「//evil.com」「https://…」这类会被浏览器当成站外地址，一律不认，退回首页，防止被人拿来做跳转钓鱼；
 * 也不跳回登录页和注册页本身。
 */
export const safeFrom = (from) => {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null
  if (from === '/login' || from.startsWith('/login?') || from === '/register' || from.startsWith('/register?')) return null
  return from
}
