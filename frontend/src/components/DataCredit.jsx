/**
 * NBA 页面底部的数据来源说明。
 *
 * 2026-10-06 NBA 模块改成对访客公开。Sports Reference（Basketball-Reference 的母公司）的条款
 * 欢迎转用网页上的数据，但要求明确注明他们是来源，见 vault《79-推荐首页规划》第九章。
 * 历史和逐场数据主要来自 Basketball-Reference，当季同步用的是 ESPN。
 *
 * 由 AppLayout 统一挂在 NBA 数据页的内容下面（判断规则见 mobileNav.isNbaDataPath），
 * 不用每个页面各写一遍，也就不会漏。
 */
export default function DataCredit() {
  const link = { color: '#999', textDecoration: 'underline' }
  return (
    <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, lineHeight: 1.6, padding: '18px 8px 4px' }}>
      NBA data from{' '}
      <a href="https://www.basketball-reference.com/" target="_blank" rel="noopener noreferrer" style={link}>Basketball-Reference.com</a>
      {' '}(Sports Reference) and{' '}
      <a href="https://www.espn.com/nba/" target="_blank" rel="noopener noreferrer" style={link}>ESPN</a>
    </div>
  )
}
