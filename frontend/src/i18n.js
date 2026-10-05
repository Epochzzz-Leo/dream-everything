import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

/**
 * 界面文案的中英切换。**中文原文就是 key。**
 *
 * 为什么不另起英文 key 名（`nba.rankings.title` 这种）：全站有一千六百多条文案，
 * 逐条起名本身就是一项工程，而且起完之后代码里只剩 `t('nba.rankings.title')`，
 * 读代码的人得去翻 JSON 才知道这一行显示什么。用原文当 key，代码照样一眼能读，
 * 中文也不需要资源文件——`t('百家说')` 在中文模式下就是原样返回。
 *
 * 由此推出三条：
 *   · 只维护一份 `locales/en.json`：`{ "百家说": "Chat Everything" }`
 *   · **英文缺翻译时回落到中文**（fallbackLng 关掉，key 即中文），漏翻的地方在英文界面上
 *     会直接显示中文，肉眼就能找出来——比静默显示一个 key 名要好得多
 *   · keySeparator / nsSeparator 必须关：中文文案里常有「：」「.」「:」，
 *     不关的话 `t('时薪：$12.5')` 会被当成命名空间和路径切开
 *
 * 语言选择存 localStorage，刷新不丢；没存过的按设备语言来，规则见下面的 pickLang。
 * dayjs 的 locale 这一步**故意没动**：现在的日期都是手写格式串（`M月D日`），
 * 那些格式串本身就是文案、走 t() 就能换；一旦把 dayjs 切成 zh-cn，
 * 中文模式下所有 `dddd`/`MMM` 也会跟着变，那是另一件事。
 */
export const LANG_KEY = 'lang'

const saved = (() => {
  try { return localStorage.getItem(LANG_KEY) } catch { return null }
})()

/**
 * 第一次打开时用哪种语言，按顺序判断：
 *   1. 手动切过的（localStorage 里存着 'zh' / 'en'）→ 照他上次的选择
 *   2. 没切过的 → 看设备的首选语言：是中文就给中文，其余一律英文
 *
 * 为什么兜底是英文：站点是公开的，第一次来的访客大多不读中文；
 * 而用中文手机的老用户靠第 2 条照样落在中文，不会被这次改动打扰。
 *
 * 只看**第一**偏好，不扫整个列表：很常见的设置是系统英文、第二语言中文
 * （比如 ['en-AU', 'zh-Hans-AU']）。这种人自己把英文排在前面，就该给英文；
 * 要是写成「列表里有中文就给中文」，在澳洲的中文用户几乎全会被判成中文。
 *
 * 写成纯函数单独导出，是为了不开浏览器也能把这几种组合逐个测一遍。
 */
export const pickLang = (savedLang, deviceLang) => {
  if (savedLang === 'zh' || savedLang === 'en') return savedLang
  return /^zh/i.test(deviceLang || '') ? 'zh' : 'en'
}

const deviceLang = (() => {
  try { return navigator.language } catch { return '' } // 在 node 里跑测试时可能没有 navigator
})()

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: {} }, // 空包：只为不让 i18next 报「zh 没有资源」
  },
  lng: pickLang(saved, deviceLang),
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React 自己转义，这里再转会把 & 显示成 &amp;
  react: { useSuspense: false },          // 资源是打包进来的，不需要异步等待
  // 同步初始化。资源是内联的，没有任何要异步加载的东西；不写这一条的话 init 会推到下一个
  // tick，而 rankConfig 那类模块在被 import 的那一刻就会调 i18n.t（算表头字段列表），
  // 拿到的会是还没设好语言的实例。这些模块级调用的结果本身不显示，但没必要留一个时序坑。
  initImmediate: false,
})

// <html lang> 跟着当前语言走。浏览器靠它挑字体（同一个汉字，中日韩的字形不一样）、
// 决定要不要弹「翻译此页」；读屏软件靠它选发音。index.html 里写死的是 en，
// 切到中文时不改的话，中文页面会被当成英文页处理。
const syncHtmlLang = (lng) => {
  try { document.documentElement.lang = lng === 'en' ? 'en' : 'zh-CN' } catch { /* 没有 DOM（node 测试） */ }
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

/** 切换语言并记住。组件里用它，不要直接调 i18n.changeLanguage——会忘了存 */
export const setLang = (lang) => {
  const next = lang === 'en' ? 'en' : 'zh'
  try { localStorage.setItem(LANG_KEY, next) } catch { /* 隐私模式等：不存也能用 */ }
  return i18n.changeLanguage(next)
}

export default i18n
