import { useEffect, useState } from 'react'
import { Card, Col, Empty, Row, Segmented, Spin, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { playerApi } from '../../api/player'
import { fmtNum, fmtPct, displayName, seasonYears } from './rankConfig'
import { compactColumns, sumColWidth } from './statColumns'
import { TeamNames } from '../../components/TeamLogo'
import useIsMobile from '../../hooks/useIsMobile'

/**
 * 历史荣誉：某个奖项从 1946-47 至今的逐季获奖者，外加"谁拿得最多"。
 *
 * 两类奖项的来源完全不同：
 *  · **评选类**（MVP/DPOY/FMVP/最佳新秀/第六人/进步奖）是官方投票结果，只能靠抓取。
 *    老赛季没抓到的年份就是空的——不猜、不用数据倒推，那样会造出official 从没颁过的奖。
 *  · **统计王**（得分王、篮板王…）是可以算的：当季过资格线的人里该项第一名。所以这一类
 *    80 个赛季全都有，1947 年的得分王也算得出来。
 */

// since 只存年份，整句「官方评选结果，{{year}} 起评选。…」在渲染处是一个 key：
// 原来存的是「1955-56 起评选」这个短语、再原样塞进句子里，没翻，英文句子中间夹着中文
const VOTED = [
  { key: 'mvp', label: 'MVP', since: '1955-56' },
  { key: 'dpoy', label: 'Defensive Player of the Year', since: '1982-83' },
  { key: 'fmvp', label: 'Finals MVP', since: '1968-69' },
  { key: 'roy', label: 'Rookie of the Year', since: '1952-53' },
  { key: 'smoy', label: 'Sixth Man of the Year', since: '1982-83' },
  { key: 'mip', label: 'Most Improved Player', since: '1985-86' },
]

// col 是数值那一列的表头，每项单独写。原来是从中文 label 里把「王」字剥掉现算的（「命中王」→「命中」），
// 剥出来的几个词双语词典里没有，英文界面上表头一直是中文
const CROWNS = [
  { key: 'playerAvgScore', label: 'Scoring Leader', col: 'PTS' },
  { key: 'playerAvgReb', label: 'Rebounding Leader', col: 'REB' },
  { key: 'playerAvgAss', label: 'Assists Leader', col: 'AST' },
  { key: 'playerAvgSteal', label: 'Steals Leader', col: 'STL' },
  { key: 'playerAvgBlock', label: 'Blocks Leader', col: 'BLK' },
  { key: 'playerAvgTpm', label: '3-Pointers Leader', col: '3P' },
  { key: 'playerAvgFgm', label: 'Field Goals Leader', col: 'FGM' },
  { key: 'playingTime', label: 'Minutes Leader', col: 'MIN' },
  { key: 'playerAccuracy', label: 'FG% Leader', col: 'FG%', pct: true },
  { key: 'playerThreeAccuracy', label: '3P% Leader', col: '3P%', pct: true },
  { key: 'playerFreethrowAccuracy', label: 'FT% Leader', col: 'FT%', pct: true },
]

const ALL = [...VOTED, ...CROWNS]
const MEDAL = ['#f5b301', '#9aa0a6', '#b87333']

export default function AwardHistory() {
  const isMobile = useIsMobile()
  const [award, setAward] = useState('mvp')
  const [rows, setRows] = useState(null)
  const stat = ALL.find((a) => a.key === award) || ALL[0]
  const isCrown = CROWNS.some((c) => c.key === award)

  useEffect(() => {
    let alive = true
    setRows(null)
    playerApi.awardHistory(award)
      .then((r) => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [award])

  // 拿得最多的人：同一赛季并列算各拿一次（统计王有并列，评选类不会）
  const tally = (rows || []).reduce((acc, r) => {
    const k = r.playerId || r.playerName
    if (!k) return acc
    // nameEn 一起带上：下面 displayName(p) 先取英文原名
    acc[k] = acc[k] || { playerId: r.playerId, playerName: r.playerName, nameEn: r.nameEn, n: 0, seasons: [] }
    acc[k].n += 1
    acc[k].seasons.push(r.seasonNum)
    return acc
  }, {})
  const top = Object.values(tally).sort((a, b) => b.n - a.n || b.seasons[0] - a.seasons[0]).slice(0, 10)

  const fmtVal = (v) => (v == null ? '-' : stat.pct ? fmtPct(v) : fmtNum(v))

  const columns = [
    {
      title: 'Season', dataIndex: 'seasonNum', width: 96, fixed: 'left',
      render: (n) => seasonYears(n),
    },
    {
      // 名字走 displayName（英文原名优先），原来直接显示 playerName
      title: 'Player', dataIndex: 'playerName', width: 130,
      render: (_, r) => (r.playerId
        ? <Link to={`/players/${r.playerId}?seasonNum=${r.seasonNum}`}>{displayName(r)}</Link>
        : displayName(r) || '-'),
    },
    { title: 'Team', dataIndex: 'playerTeam', width: 84, render: (v) => <TeamNames value={v} /> },
    { title: 'GP', dataIndex: 'games', width: 56 },
    ...(isCrown
      ? [{ title: stat.col, dataIndex: 'val', width: 76, render: (v) => <b style={{ color: '#fa541c' }}>{fmtVal(v)}</b> }]
      : [
          { title: 'PTS', dataIndex: 'pts', width: 56, render: (v) => fmtNum(v) },
          { title: 'REB', dataIndex: 'reb', width: 56, render: (v) => fmtNum(v) },
          { title: 'AST', dataIndex: 'ast', width: 56, render: (v) => fmtNum(v) },
        ]),
    // 最佳防守球员多给三列：光看得分篮板助攻，看不出这个人凭什么拿防守奖。
    // 防守效率是 DRtg（对手每 100 回合得分），越低越好，所以标题里点一下方向
    ...(award === 'dpoy'
      ? [
          { title: 'BLK', dataIndex: 'blk', width: 56, render: (v) => fmtNum(v) },
          { title: 'STL', dataIndex: 'stl', width: 56, render: (v) => fmtNum(v) },
          { title: 'DRtg', dataIndex: 'defEff', width: 84, render: (v) => (v == null ? '-' : fmtNum(v, 0)) },
        ]
      : []),
  ]
  const cols = isMobile ? compactColumns(columns) : columns

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={award}
          onChange={setAward}
          options={[
            ...VOTED.map((a) => ({ label: a.label, value: a.key })),
            ...CROWNS.map((a) => ({ label: a.label, value: a.key })),
          ]}
          style={{ maxWidth: '100%', overflowX: 'auto' }}
        />
      </div>
      <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
        {isCrown
          ? 'Statistical leaders are the top qualified player in each category that season (qualification = 70% of team games), so every season since 1946-47 has one; ties are all kept.'
          : `Official award results, awarded since ${stat.since}. Earlier years, and years before the award existed, are not listed.`}
        {/* 原来的说明带着 Markdown 的 **…**，这里没有任何地方解析 Markdown，星号原样显示了出来
            （「**Finals round only**」），现在去掉了 */}
        {award === 'fmvp' && 'Stats are per-game averages for the Finals round only, not the regular season or the whole playoffs. Round-by-round data goes back to 1976-77; the 8 earlier winners have the award only, with no stats.'}
        {award === 'dpoy' && 'Defensive rating is DRtg (opponent points per 100 possessions while on court); lower is better.'}
      </div>

      {rows === null ? <Spin style={{ display: 'block', margin: '60px auto' }} /> : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card title={`${stat.label} · Most wins`} styles={{ body: { padding: '8px 16px' } }}>
              {top.length ? top.map((p, i) => (
                <div
                  key={p.playerId || p.playerName}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '8px 0',
                    borderBottom: i === top.length - 1 ? 'none' : '1px solid #f5f5f5',
                  }}
                >
                  <span style={{ width: 26, fontWeight: 700, fontStyle: 'italic', color: i < 3 ? MEDAL[i] : '#bbb' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {p.playerId ? <Link to={`/players/${p.playerId}?seasonNum=99`}>{displayName(p)}</Link> : displayName(p)}
                  </span>
                  <Tag color={i < 3 ? 'gold' : 'default'} style={{ marginInlineEnd: 0 }}>×{p.n}</Tag>
                </div>
              )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />}
            </Card>
          </Col>
          <Col xs={24} lg={16}>
            <Card title={`${stat.label} · By season`} extra={<span style={{ color: '#bbb', fontSize: 12 }}>{((rows.length) === 1 ? `${rows.length} season` : `${rows.length} seasons`)}</span>} styles={{ body: { padding: 0 } }}>
              {rows.length ? (
                <Table
                  className="clean-table stat-compact"
                  bordered
                  rowKey={(r) => `${r.seasonNum}-${r.playerId || r.playerName}`}
                  dataSource={rows}
                  columns={cols}
                  size="middle"
                  /* 跟历史总榜同一套：页面自己滚（不套内层滚动区），分页控住 DOM 行数 */
                  pagination={{ pageSize: 50, showSizeChanger: false, size: 'small', showLessItems: isMobile }}
                  scroll={{ x: sumColWidth(cols) }}
                />
              ) : <Empty description="No history for this award yet" style={{ padding: 40 }} />}
            </Card>
          </Col>
        </Row>
      )}
    </>
  )
}
