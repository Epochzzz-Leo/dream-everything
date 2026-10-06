import { ConfigProvider } from 'antd'
// 从 es/ 导入，不要写成 'antd/locale/en_US'：那个文件是 CommonJS（module.exports = require(...)），
// 而本项目 package.json 是 "type": "module"，Vite 8 按 Node 规则做互操作，default 拿到的是
// { __esModule, default } 这层外壳而不是语言包。外壳的 .locale 是 undefined，
// ProLayout 里的 pro-provider 拿不到语言就把 dayjs 全局设成 zh-cn，月份名会变成中文
// （2026-10-06 查到：页面上出现过「十月 2026」「6月 13, 2026」）。
import enUS from 'antd/es/locale/en_US'
import { themeConfig } from '../theme'

/**
 * antd 自己的文案（日历的「OK」、表格的「No data」、分页……）用英文语言包。
 *
 * dayjs 的全局语言也由这里间接决定：ProLayout 内部的 pro-provider 会按 antd 当前 locale 的
 * `locale` 字段调用 dayjs.locale()（en_US → 'en'），所以月份名、星期名是英文。
 *
 * 网站只有英文（2026-10-06 去掉了中英切换），这里不再跟着语言变。
 * 单独成文件不放在 main.jsx 里：Vite 的 Fast Refresh 要求一个文件要么只导出组件、
 * 要么不导出组件，入口文件里夹一个组件会让整棵树失去热更新。
 */
export default function LocaleProvider({ children }) {
  return (
    <ConfigProvider locale={enUS} theme={themeConfig}>
      {children}
    </ConfigProvider>
  )
}
