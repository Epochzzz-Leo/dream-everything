/**
 * 浏览器里的匿名编号：推荐流靠它认出「还是同一个访客」，比如把他点开过的帖子往后放。
 *
 * 只是一串随机字符，不含任何个人信息；存在 localStorage，清掉浏览器数据就没了。
 * localStorage 用不了（无痕模式、被禁用）时退回内存里的一个，只在这次打开页面期间有效。
 * 登录用户也带着它：以后要把「登录前看过的」和「登录后看的」接起来。
 */
const KEY = 'dream:anon'
const VALID = /^[A-Za-z0-9-]{8,64}$/
let memo = null

const randomId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // 非 https 的页面没有 randomUUID，走下面的退路
  }
  return `a${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function getAnonId() {
  if (memo) return memo
  try {
    const saved = window.localStorage.getItem(KEY)
    if (saved && VALID.test(saved)) memo = saved
  } catch {
    // 读不了就当没有
  }
  if (!memo) {
    memo = randomId()
    try {
      window.localStorage.setItem(KEY, memo)
    } catch {
      // 存不了就只在内存里，这次打开页面期间有效
    }
  }
  return memo
}
