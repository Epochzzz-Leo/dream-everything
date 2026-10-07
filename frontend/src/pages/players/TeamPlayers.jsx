import { useEffect, useState } from 'react'
import { Button, Card, Col, Empty, Progress, Row, Segmented, Space, Spin, Table, Tag } from 'antd'
import { DashboardOutlined, HistoryOutlined } from '@ant-design/icons'
import PillTabs from '../../components/PillTabs'
import { TrophyFilled } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import AllPlayerSeasonStats from './AllPlayerSeasonStats'
import { teamApi } from '../../api/team'
import { playerApi } from '../../api/player'
import { LATEST_SEASON, NBA_STRUCTURE, PLAYOFF_TAG, fmtNum, fmtRatio, playoffRecord, seasonShort, seasonYearLabel, teamName, teamRegion } from './rankConfig'
import SeasonPicker from '../../components/SeasonPicker'
import useIsMobile from '../../hooks/useIsMobile'
import useUrlState from '../../hooks/useUrlState'
import { compactColumns, sumColWidth } from './statColumns'
import TeamLogo from '../../components/TeamLogo'

const MEDAL = ['#f5b301', '#9aa0a6', '#b87333']

/* ============ Tab 2：赛季概览 ============ */

// 全队数据卡（失分/失误按"最少"排名；净胜分为派生值，带正负色）
const netOf = (r) => Number(r.pts) - Number(r.ptsAllowed)
const TEAM_STATS = [
  { key: 'pts', label: 'PPG' },
  { key: 'ptsAllowed', label: 'Opp PPG', asc: true, note: 'fewest first' },
  { key: 'net', label: 'Avg margin', get: netOf, signed: true },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TOV', asc: true, note: 'fewest first' },
]

/** 名次胶囊。scope：'league' 联盟第 N（默认）/ 'playoffs' 季后赛第 N，整句 key，不拼「前缀 + 数字」 */
function RankBadge({ rank, scope = 'league' }) {
  const color = rank <= 3 ? MEDAL[rank - 1] : '#999'
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, background: rank <= 3 ? 'rgba(22,119,255,.08)' : '#f5f5f5', padding: '2px 8px', borderRadius: 10 }}>
      {scope === 'playoffs' ? `Playoffs #${rank}` : `League #${rank}`}
    </span>
  )
}

function SeasonOverview({ teamCode, seasonNum }) {
  const [rows, setRows] = useState(null) // 全联盟 30 队（该赛季），用来算名次
  const isMobile = useIsMobile()

  useEffect(() => {
    let alive = true
    setRows(null)
    teamApi.rankings(seasonNum)
      .then((r) => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [seasonNum])

  const me = rows?.find((r) => r.teamCode === teamCode)
  const { conf } = teamRegion(teamCode)

  const rankOf = (stat) => {
    if (!rows || !me) return '-'
    const val = (r) => (stat.get ? stat.get(r) : Number(r[stat.key]))
    return 1 + rows.filter((r) => (stat.asc ? val(r) < val(me) : val(r) > val(me))).length
  }
  const winRankLeague = () => (rows && me ? 1 + rows.filter((r) => r.wins > me.wins).length : '-')
  const winRankConf = () => {
    if (!rows || !me || !conf) return '-'
    const confTeams = rows.filter((r) => teamRegion(r.teamCode).conf === conf)
    return 1 + confTeams.filter((r) => r.wins > me.wins).length
  }

  if (rows === null) return <Card title="Season Summary"><Spin style={{ display: 'block', margin: '40px auto' }} /></Card>
  if (!me) return <Card title="Season Summary"><Empty description="No team data for this season" /></Card>

  const winRate = me.wins + me.losses ? me.wins / (me.wins + me.losses) : 0

  return (
    <>
      <Row gutter={[16, 16]}>
        {/* 战绩卡 */}
        <Col xs={24} lg={9}>
          <Card
            title={`${seasonYearLabel(seasonNum)} Record`}
            styles={{ body: { padding: '20px 24px' } }}
          >
            <Space size={28} align="center" wrap>
              <Progress
                type="circle"
                size={110}
                percent={Math.round(winRate * 100)}
                strokeColor="#1677ff"
                format={(p) => (
                  <div style={{ lineHeight: 1.3 }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{p}%</div>
                    <div style={{ fontSize: 11, color: '#999' }}>Win%</div>
                  </div>
                )}
              />
              <div>
                <div style={{ fontSize: isMobile ? 22 : 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {me.wins} <span style={{ color: '#bbb', fontSize: 20 }}>W</span>{' '}
                  {me.losses} <span style={{ color: '#bbb', fontSize: 20 }}>L</span>
                </div>
                {/* 原来是「西部」+「第」+「 4」拼出来的，英文界面上成了「西部 # 4」。
                    现在 conf 本身就是英文（West），整句写成 West #4 */}
                <Space size={6} wrap style={{ marginTop: 10 }}>
                  <Tag color="orange">{`League #${winRankLeague()}`}</Tag>
                  {conf && <Tag>{`${conf} #${winRankConf()}`}</Tag>}
                </Space>
                <div style={{ marginTop: 10 }}>
                  <span style={{ color: '#888', marginRight: 8 }}>Playoffs</span>
                  <Tag color={PLAYOFF_TAG[me.playoffResult] || 'default'}>
                    {me.playoffResult === 'Champion' && <TrophyFilled style={{ marginRight: 4 }} />}
                    {me.playoffResult ? me.playoffResult : '-'}
                  </Tag>
                </div>
              </div>
            </Space>
          </Card>
        </Col>
        {/* 六项数据卡 */}
        <Col xs={24} lg={15}>
          <Row gutter={[12, 12]}>
            {TEAM_STATS.map((s) => {
              const rank = rankOf(s)
              const val = s.get ? s.get(me) : Number(me[s.key])
              const display = s.signed ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}` : fmtNum(val)
              const color = s.signed ? (val >= 0 ? '#3f8600' : '#cf1322') : '#1677ff'
              return (
                <Col key={s.key} xs={12} sm={6}>
                  <Card styles={{ body: { padding: '14px 16px' } }}>
                    <div style={{ color: '#888', fontSize: 13 }}>
                      {s.label}
                      {s.note && <span style={{ marginLeft: 6, fontSize: 11, color: '#bbb' }}>{s.note}</span>}
                    </div>
                    <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color, margin: '2px 0 6px', fontVariantNumeric: 'tabular-nums' }}>
                      {display}
                    </div>
                    <RankBadge rank={rank} />
                  </Card>
                </Col>
              )
            })}
          </Row>
        </Col>
      </Row>
    </>
  )
}

/* ============ 季后赛：赛季概况 ============ */

const PLAYOFF_STATS = [
  { key: 'pts', label: 'PPG' },
  { key: 'ptsAllowed', label: 'Opp PPG', asc: true, note: 'fewest first' },
  { key: 'net', label: 'Avg margin', get: netOf, signed: true },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TOV', asc: true, note: 'fewest first' },
]

function PlayoffOverview({ teamCode, seasonNum }) {
  const [rows, setRows] = useState(null) // 该季 16 支季后赛球队
  const isMobile = useIsMobile()

  useEffect(() => {
    let alive = true
    setRows(null)
    teamApi.playoffRankings(seasonNum)
      .then((r) => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [seasonNum])

  const me = rows?.find((r) => r.teamCode === teamCode)
  const rankOf = (stat) => {
    if (!rows || !me) return '-'
    const val = (r) => (stat.get ? stat.get(r) : Number(r[stat.key]))
    return 1 + rows.filter((r) => (stat.asc ? val(r) < val(me) : val(r) > val(me))).length
  }
  if (rows === null) return <Card title="Playoff Summary"><Spin style={{ display: 'block', margin: '40px auto' }} /></Card>
  if (!me) return <Card title="Playoff Summary"><Empty description="Missed the playoffs this season" /></Card>

  return (
    <Row gutter={[16, 16]}>
      {/* 战报卡 */}
      <Col xs={24} lg={9}>
        <Card title={`${seasonYearLabel(seasonNum)} Playoff Results`} styles={{ body: { padding: '20px 24px' } }}>
          {(() => {
            const rec = playoffRecord(me.playoffResult, me.games)
            const winRate = rec && me.games ? rec.wins / me.games : 0
            const isChamp = me.playoffResult === 'Champion'
            return (
              <Space size={28} align="center" wrap>
                <Progress
                  type="circle"
                  size={110}
                  percent={Math.round(winRate * 100)}
                  strokeColor={isChamp ? '#d4a017' : '#1677ff'}
                  format={(p) => (
                    <div style={{ lineHeight: 1.3 }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{p}%</div>
                      <div style={{ fontSize: 11, color: '#999' }}>Playoff Win%</div>
                    </div>
                  )}
                />
                <div>
                  <Tag color={PLAYOFF_TAG[me.playoffResult] || 'default'} style={{ fontSize: 16, padding: '4px 14px', lineHeight: 1.6 }}>
                    {isChamp && <TrophyFilled style={{ marginRight: 6 }} />}
                    {me.playoffResult}
                  </Tag>
                  <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
                    {rec ? (
                      <>
                        {rec.wins} <span style={{ color: '#bbb', fontSize: 18 }}>W</span>{' '}
                        {rec.losses} <span style={{ color: '#bbb', fontSize: 18 }}>L</span>
                      </>
                    ) : '-'}
                    {/* 场数走复数整句；场数缺失时整段不出，不显示「出战 - 场」 */}
                    {me.games != null && (
                      <span style={{ color: '#999', fontSize: 13, marginLeft: 10 }}>{((Number(me.games)) === 1 ? `${Number(me.games)} game played` : `${Number(me.games)} games played`)}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, color: '#999', fontSize: 12 }}>{((rows.length) === 1 ? `Ranked among that season's ${rows.length} playoff team` : `Ranked among that season's ${rows.length} playoff teams`)}</div>
                </div>
              </Space>
            )
          })()}
        </Card>
      </Col>
      {/* 八项数据卡（季后赛内排名，失分/净胜含在内） */}
      <Col xs={24} lg={15}>
        <Row gutter={[12, 12]}>
          {PLAYOFF_STATS.map((s) => {
            const rank = rankOf(s)
            const val = s.get ? s.get(me) : Number(me[s.key])
            const display = s.signed ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}` : fmtNum(val)
            const color = s.signed ? (val >= 0 ? '#3f8600' : '#cf1322') : '#1677ff'
            return (
              <Col key={s.key} xs={12} sm={6}>
                <Card styles={{ body: { padding: '14px 16px' } }}>
                  <div style={{ color: '#888', fontSize: 13 }}>
                    {s.label}
                    {s.note && <span style={{ marginLeft: 6, fontSize: 11, color: '#bbb' }}>{s.note}</span>}
                  </div>
                  <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color, margin: '2px 0 6px', fontVariantNumeric: 'tabular-nums' }}>
                    {display}
                  </div>
                  <RankBadge rank={rank} scope="playoffs" />
                </Card>
              </Col>
            )
          })}
        </Row>
      </Col>
    </Row>
  )
}

/* ============ 季后赛：球队历史 ============ */

function PlayoffHistory({ teamCode }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    teamApi.playoffHistory(teamCode)
      .then((r) => { if (alive) setRows((r || []).slice().sort((a, b) => b.seasonNum - a.seasonNum)) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [teamCode])

  if (rows === null) return <Spin style={{ display: 'block', margin: '40px auto' }} />
  if (!rows.length) return <Empty description="Never made the playoffs in franchise history" />

  // 各轮次数（止步该轮）；分区冠军 = 打进总决赛（含夺冠）；合计战绩由轮次+出战反推。
  // cnt 的参数是库里 PLAYOFF_RESULT 的值，必须一字不差（Champion / Finals / …）。
  // 双语时期这里写成过 cnt(t("总冠军"))：英文界面拿译文去和库里的中文比，五个计数全是 0
  const cnt = (res) => rows.filter((r) => r.playoffResult === res).length
  const champs = cnt('Champion')
  const finalsLost = cnt('Finals')
  const confChamps = finalsLost + champs
  const agg = rows.reduce(
    (a, r) => {
      const rec = playoffRecord(r.playoffResult, r.games)
      if (rec) { a.w += rec.wins; a.l += rec.losses }
      return a
    },
    { w: 0, l: 0 },
  )

  const numCol = (title, key) => ({
    title, dataIndex: key, width: 62,
    sorter: (a, b) => Number(a[key]) - Number(b[key]),
    render: (v) => fmtNum(v),
  })

  const columns = [
    {
      title: 'Season', dataIndex: 'seasonNum', width: 76,
      sorter: (a, b) => a.seasonNum - b.seasonNum, defaultSortOrder: 'descend',
      render: (v) => seasonShort(v),
    },
    {
      title: 'Record', dataIndex: 'playoffResult', width: 96,
      render: (v) => (
        <Tag color={PLAYOFF_TAG[v] || 'default'} style={{ marginInlineEnd: 0 }}>
          {v === 'Champion' && <TrophyFilled style={{ marginRight: 4 }} />}
          {v}
        </Tag>
      ),
    },
    {
      title: 'Record', width: 80,
      sorter: (a, b) => (playoffRecord(a.playoffResult, a.games)?.wins ?? 0) - (playoffRecord(b.playoffResult, b.games)?.wins ?? 0),
      render: (_, r) => {
        const rec = playoffRecord(r.playoffResult, r.games)
        return rec ? <b>{rec.wins}-{rec.losses}</b> : '-'
      },
    },
    { title: 'Played', dataIndex: 'games', width: 56, sorter: (a, b) => a.games - b.games },
    numCol('PTS', 'pts'),
    numCol('Opp PTS', 'ptsAllowed'),
    {
      title: 'Margin', width: 66,
      sorter: (a, b) => (a.pts - a.ptsAllowed) - (b.pts - b.ptsAllowed),
      render: (_, r) => {
        const d = Number(r.pts) - Number(r.ptsAllowed)
        return <span style={{ fontWeight: 600, color: d >= 0 ? '#3f8600' : '#cf1322' }}>{d >= 0 ? '+' : ''}{d.toFixed(1)}</span>
      },
    },
    numCol('REB', 'reb'),
    numCol('AST', 'ast'),
    numCol('STL', 'stl'),
    numCol('BLK', 'blk'),
    numCol('TOV', 'tov'),
  ]

  return (
    <Card
      title="Playoff History"
      extra={
        <Space size={8} wrap>
          <Tag color="geekblue">{`Playoffs ×${rows.length}`}</Tag>
          {/* 括号用半角：原来全角括号写在 JSX 里，英文界面上也是「（55.6%）」 */}
          <Tag color="orange">{`Playoff record ${agg.w}-${agg.l} (${fmtRatio(agg.w, agg.w + agg.l)})`}</Tag>
          <Tag color={PLAYOFF_TAG['First Round']}>{`First Round ×${cnt('First Round')}`}</Tag>
          <Tag color={PLAYOFF_TAG['Semifinals']}>{`Conf. Semis ×${cnt('Semifinals')}`}</Tag>
          <Tag color={PLAYOFF_TAG['Conf. Finals']}>{`Conf. Finals ×${cnt('Conf. Finals')}`}</Tag>
          <Tag color={PLAYOFF_TAG['Finals']}>{`Conf. Champion ×${confChamps}`}</Tag>
          <Tag color="gold"><TrophyFilled /> {`Champion ×${champs}`}</Tag>
        </Space>
      }
      styles={{
        // 表格铺满卡片（左右+底部贴齐）；卡头的底边去掉——它和表格顶边只隔 4px，
        // 并排两条横线很难看，让表格自己的顶边当分隔即可
        body: { padding: 0 },
        header: { borderBottom: 'none' },
      }}
    >
      <Table className="clean-table stat-compact" bordered rowKey="seasonNum" dataSource={rows} columns={isMobile ? compactColumns(columns) : columns} pagination={false} size="middle" scroll={{ x: isMobile ? sumColWidth(compactColumns(columns)) : 'max-content' }} />
    </Card>
  )
}

/* ============ 常规赛：球队历史 ============ */

function TeamHistory({ teamCode }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState(null)
  const [allRecs, setAllRecs] = useState(null) // 全联盟历季胜场，算分区/分部第一用

  useEffect(() => {
    let alive = true
    Promise.all([teamApi.history(teamCode), teamApi.allRecords()])
      .then(([r, all]) => {
        if (!alive) return
        // 数据层就按最新赛季在前排好（移动端没有表头排序可依赖）
        setRows((r || []).slice().sort((a, b) => b.seasonNum - a.seasonNum))
        setAllRecs(all || [])
      })
      .catch(() => { if (alive) { setRows([]); setAllRecs([]) } })
    return () => { alive = false }
  }, [teamCode])

  if (rows === null) return <Spin style={{ display: 'block', margin: '40px auto' }} />
  if (!rows.length) return <Empty description="No franchise history" />

  const totalW = rows.reduce((s, r) => s + r.wins, 0)
  const totalL = rows.reduce((s, r) => s + r.losses, 0)
  const champs = rows.filter((r) => r.playoffResult === 'Champion').length
  const playoffs = rows.filter((r) => r.playoffResult && r.playoffResult !== 'Missed playoffs').length

  // 分区(东/西部)第一、分部(赛区)第一次数：与同范围各队当季胜场最高值比较（并列也算第一）
  const { conf, div } = teamRegion(teamCode)
  const confSet = new Set(Object.values(NBA_STRUCTURE[conf] || {}).flat())
  const divSet = new Set(NBA_STRUCTURE[conf]?.[div] || [])
  const firsts = (scopeSet) => {
    if (!allRecs?.length || !scopeSet.size) return 0
    const maxBySeason = {}
    for (const rec of allRecs) {
      if (!scopeSet.has(rec.teamCode)) continue
      if (!(rec.seasonNum in maxBySeason) || rec.wins > maxBySeason[rec.seasonNum]) {
        maxBySeason[rec.seasonNum] = rec.wins
      }
    }
    return rows.filter((r) => r.wins >= (maxBySeason[r.seasonNum] ?? Infinity)).length
  }
  const confFirsts = firsts(confSet)
  const divFirsts = firsts(divSet)

  // 每季排名：联盟第 X（30 队比胜场）+ 东/西部第 Y
  const ranks = {}
  for (const r of rows) {
    const seasonRecs = (allRecs || []).filter((rec) => rec.seasonNum === r.seasonNum)
    if (!seasonRecs.length) continue
    ranks[r.seasonNum] = {
      league: 1 + seasonRecs.filter((rec) => rec.wins > r.wins).length,
      conf: 1 + seasonRecs.filter((rec) => confSet.has(rec.teamCode) && rec.wins > r.wins).length,
    }
  }
  // 老球队（不在 NBA_STRUCTURE 里）查不到东西部，就不显示这一枚
  const confShort = conf === 'East' || conf === 'West' ? conf : ''

  const numCol = (title, key) => ({
    title, dataIndex: key, width: 62,
    sorter: (a, b) => Number(a[key]) - Number(b[key]),
    render: (v) => fmtNum(v),
  })

  const columns = [
    {
      title: 'Season', dataIndex: 'seasonNum', width: 76,
      sorter: (a, b) => a.seasonNum - b.seasonNum, defaultSortOrder: 'descend',
      render: (v) => seasonShort(v),
    },
    { title: 'W', dataIndex: 'wins', width: 48, sorter: (a, b) => a.wins - b.wins },
    { title: 'L', dataIndex: 'losses', width: 48, sorter: (a, b) => a.losses - b.losses },
    {
      title: 'Win%', width: 70,
      sorter: (a, b) => a.wins / (a.wins + a.losses) - b.wins / (b.wins + b.losses),
      render: (_, r) => fmtRatio(r.wins, Number(r.wins || 0) + Number(r.losses || 0)),
    },
    {
      title: 'Season Rank', width: 136,
      sorter: (a, b) => (ranks[a.seasonNum]?.league ?? 99) - (ranks[b.seasonNum]?.league ?? 99),
      render: (_, r) => {
        const k = ranks[r.seasonNum]
        if (!k) return '-'
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            <b style={{ color: k.league <= 3 ? '#1677ff' : undefined }}>{`League #${k.league}`}</b>
            {confShort && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>{`${confShort} #${k.conf}`}</span>}
          </span>
        )
      },
    },
    {
      // 与相邻的数据列同为右对齐，别单独一列靠左
      title: 'Playoffs', dataIndex: 'playoffResult', width: 92,
      render: (v) => (
        <Tag color={PLAYOFF_TAG[v] || 'default'} style={{ marginInlineEnd: 0 }}>
          {v === 'Champion' && <TrophyFilled style={{ marginRight: 4 }} />}
          {v ? v : '-'}
        </Tag>
      ),
    },
    numCol('PTS', 'pts'),
    numCol('Opp PTS', 'ptsAllowed'),
    {
      title: 'Margin', width: 66,
      sorter: (a, b) => (a.pts - a.ptsAllowed) - (b.pts - b.ptsAllowed),
      render: (_, r) => {
        const d = Number(r.pts) - Number(r.ptsAllowed)
        return <span style={{ fontWeight: 600, color: d >= 0 ? '#3f8600' : '#cf1322' }}>{d >= 0 ? '+' : ''}{d.toFixed(1)}</span>
      },
    },
    numCol('REB', 'reb'),
    numCol('AST', 'ast'),
    numCol('STL', 'stl'),
    numCol('BLK', 'blk'),
    numCol('TOV', 'tov'),
  ]

  return (
    <Card
      title="Team History"
      extra={
        <Space size={8} wrap>
          <Tag>{((rows.length) === 1 ? `History: ${rows.length} season` : `History: ${rows.length} seasons`)}</Tag>
          <Tag color="orange">{`All-time record ${totalW}-${totalL} (${fmtRatio(totalW, totalW + totalL)})`}</Tag>
          <Tag color="purple">{`Conf. 1st ×${confFirsts}`}</Tag>
          <Tag color="cyan">{`Div. 1st ×${divFirsts}`}</Tag>
          <Tag color="geekblue">{`Playoffs ×${playoffs}`}</Tag>
          <Tag color="gold"><TrophyFilled /> {`Champion ×${champs}`}</Tag>
        </Space>
      }
      styles={{
        // 表格铺满卡片（左右+底部贴齐）；卡头的底边去掉——它和表格顶边只隔 4px，
        // 并排两条横线很难看，让表格自己的顶边当分隔即可
        body: { padding: 0 },
        header: { borderBottom: 'none' },
      }}
    >
      <Table className="clean-table stat-compact" bordered rowKey="seasonNum" dataSource={rows} columns={isMobile ? compactColumns(columns) : columns} pagination={false} size="middle" scroll={{ x: isMobile ? sumColWidth(compactColumns(columns)) : 'max-content' }} />
    </Card>
  )
}

/* ============ 季后赛阵容：轮次细分 ============ */

const ROUND_LABEL = { 1: 'First Round', 2: 'Semifinals', 3: 'Conf. Finals', 4: 'Finals' }

/**
 * 季后赛球员表 + 轮次选择。
 * 轮次来自 player_playoff_round_stats（B-R 系列赛页），被淘汰的球队只会列出他打过的几轮；
 * 该季没有轮次数据（或没进季后赛）时选择器整体不渲染，退回整个季后赛的汇总表。
 */
function PlayoffRoster({ teamCode, seasonNum }) {
  const [rounds, setRounds] = useState(null)
  const [round, setRound] = useState(null) // null = 全部轮次（汇总）
  const isMobile = useIsMobile()

  useEffect(() => {
    setRounds(null)
    setRound(null)
    let alive = true
    playerApi
      .teamPlayoffRounds(seasonNum, teamCode)
      .then((rs) => alive && setRounds(rs || []))
      .catch(() => alive && setRounds([]))
    return () => { alive = false }
  }, [teamCode, seasonNum])

  const picked = (rounds || []).find((r) => Number(r.round) === round)

  return (
    <>
      {rounds?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Segmented
            size={isMobile ? 'small' : 'middle'}
            value={round ?? 'all'}
            onChange={(v) => setRound(v === 'all' ? null : Number(v))}
            options={[
              { label: 'All rounds', value: 'all' },
              ...rounds.map((r) => ({ label: ROUND_LABEL[Number(r.round)] ? ROUND_LABEL[Number(r.round)] : `Round ${r.round}`, value: Number(r.round) })),
            ]}
          />
          {picked && (
            <span style={{ color: '#999', fontSize: 12 }}>
              {`vs ${teamName(picked.oppTeam)} · ${picked.games}-game series`}
            </span>
          )}
        </div>
      )}
      <AllPlayerSeasonStats team={teamCode} stage="po" seasonNum={seasonNum} round={round} />
    </>
  )
}

/* ============ 页面 ============ */

/**
 * 球队主页（/players/team/:teamCode）。
 * 结构：身份卡（右侧 常规赛/季后赛 Segmented + 赛季选择，全页共用）
 *      + 单行 Tabs：赛季概况（概况卡 + 该队球员数据表）/ 球队历史。
 */
export default function TeamPlayers() {
  const { teamCode } = useParams()
  const navigate = useNavigate()
  const { conf, div } = teamRegion(teamCode)
  const [stage, setStage] = useUrlState('stage', 'reg') // reg=常规赛 po=季后赛（写进 URL，返回时保留）
  const [seasonNum, setSeasonNum] = useUrlState('seasonNum', LATEST_SEASON, true)
  const [tab, setTab] = useState('season')
  const po = stage === 'po'

  return (
    <>
      {/* 球队身份头 + 全页控件 */}
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '18px 24px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Space size={16} align="center">
            <TeamLogo code={teamCode} size={58} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {teamName(teamCode)}
                <span style={{ color: '#bbb', fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{teamCode}</span>
              </div>
              {/* conf / div 是 NBA_STRUCTURE 的键（West / Pacific），原样显示 */}
              <div style={{ color: '#999', fontSize: 13 }}>{conf && div ? `${conf} · ${div}` : teamCode}</div>
            </div>
          </Space>
          <Space size="middle" wrap>
            <Segmented
              value={stage}
              onChange={setStage}
              options={[{ label: 'Regular Season', value: 'reg' }, { label: 'Playoffs', value: 'po' }]}
            />
            <SeasonPicker value={seasonNum} onChange={setSeasonNum} includeCareer={false} />
          </Space>
        </div>
      </Card>
      <PillTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'season', icon: <DashboardOutlined />, label: 'Season Summary' },
          { value: 'history', icon: <HistoryOutlined />, label: 'Team History' },
        ]}
      />
      {tab === 'season' && (
        <>
          {po
            ? <PlayoffOverview teamCode={teamCode} seasonNum={seasonNum} />
            : <SeasonOverview teamCode={teamCode} seasonNum={seasonNum} />}
          <div style={{ marginTop: 16 }}>
            {po
              ? <PlayoffRoster teamCode={teamCode} seasonNum={seasonNum} />
              : <AllPlayerSeasonStats team={teamCode} stage={stage} seasonNum={seasonNum} />}
          </div>
        </>
      )}
      {tab === 'history' && (po ? <PlayoffHistory teamCode={teamCode} /> : <TeamHistory teamCode={teamCode} />)}
    </>
  )
}
