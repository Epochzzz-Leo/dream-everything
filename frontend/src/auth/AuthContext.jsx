import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api/auth'
import { remarkApi } from '../api/remark'
import { NEWS_MODULE_ENABLED } from '../config/modules'

/**
 * 全局登录态：用 React 自带的 Context 在整棵组件树里共享"当前用户"，
 * 任何组件 const { user, login, logout } = useAuth() 即可取用，无需第三方状态库。
 * 附带"我的备注"映射（userId→备注名）：dn(userId, 真名) 取显示名，
 * 设置备注后派发 window 'remarks-changed' 事件即可全局刷新。
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)     // 当前登录用户(含 isSuperManager 等)，未登录为 null
  const [loading, setLoading] = useState(true) // 首次确认登录态期间为 true（避免闪烁/误跳转）
  const [remarks, setRemarks] = useState({}) // 我的备注映射 {userId: 备注名}

  // 应用启动时问后端"我登录了吗"（靠浏览器已存的 Session Cookie）
  useEffect(() => {
    authApi
      .current()
      .then((u) => setUser(u))
      .catch(() => setUser(null)) // 401 → 视为未登录
      .finally(() => setLoading(false))
  }, [])

  // 备注映射跟随登录态；'remarks-changed'（设置/清除备注后派发）触发重拉
  useEffect(() => {
    if (!user) {
      setRemarks({})
      return
    }
    let alive = true
    const fetchRemarks = () => {
      remarkApi.mine()
        .then((rows) => {
          if (!alive) return
          const map = {}
          ;(Array.isArray(rows) ? rows : []).forEach((r) => { map[r.targetId] = r.remark })
          setRemarks(map)
        })
        .catch(() => {})
    }
    fetchRemarks()
    window.addEventListener('remarks-changed', fetchRemarks)
    return () => {
      alive = false
      window.removeEventListener('remarks-changed', fetchRemarks)
    }
  }, [user])

  const login = async (values) => {
    await authApi.login(values)        // 通过则后端在 session 里记录登录
    const u = await authApi.current()  // 再拉一次拿到昵称/角色
    setUser(u)
    return u
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }

  // 资料（昵称/头像）变更后同步顶栏，不整页刷新
  const refresh = async () => {
    try {
      setUser(await authApi.current())
    } catch {
      /* 未登录时忽略 */
    }
  }

  // 显示名：有备注用备注，否则用真名。全站各处渲染昵称时用它
  const dn = (userId, realName) => (userId && remarks[userId]) || realName

  // 功能模块能不能用。三种语义，别混：
  //  · **默认开**（百家说 / 新闻 / 私信 / 日程 / NBA 数据）：游客可看，超管显式关掉才隐藏；
  //    flag 未定义（老数据、后端没下发）也按可用处理，保证前后兼容。
  //    NBA 数据 2026-10-06 才进这一档（之前要求登录）：后端同一天改成对访客放行，
  //    没登录的请求在后端按 IP 限流，所以前端这边不用再挡。
  //  · **必须登录 + 默认放行 + 可按人封禁**：目前没有模块属于这一档，集合是空的。
  //    要是以后把某个模块收回成「必须登录」，前后端要一起改，否则游客进了路由、
  //    页面一挂载就发请求、后端 401、拦截器把人跳去登录页。
  //  · **要逐个放行**：目前也没有模块属于这一档。留着是因为将来可能还会有真正需要人工审批的功能。
  // 超管一律放行（否则管不了自己关掉的模块）。
  const OPT_IN_FEATURES = new Set([])
  const LOGIN_REQUIRED_FEATURES = new Set([])
  const canUse = (flag) => {
    // 全站关掉的模块，谁都别想用，超管也一样（见 config/modules.js）
    if (flag === 'featNews' && !NEWS_MODULE_ENABLED) {
      return false
    }
    if (OPT_IN_FEATURES.has(flag)) {
      return !!user && (user.isSuperManager || user[flag] === true)
    }
    if (LOGIN_REQUIRED_FEATURES.has(flag)) {
      return !!user && (user.isSuperManager || user[flag] !== false)
    }
    return !user || user.isSuperManager || user[flag] !== false
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, remarks, dn, canUse }}>
      {children}
    </AuthContext.Provider>
  )
}

/** 自定义 Hook：组件里 const { user } = useAuth() */
export function useAuth() {
  return useContext(AuthContext)
}
