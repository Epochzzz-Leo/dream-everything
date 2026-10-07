import { useEffect, useState } from 'react'
import { ProTable } from '@ant-design/pro-components'
import { useParams, Link } from 'react-router-dom'
import { Button, Card, Col, ConfigProvider, Empty, Row, Segmented, Space, Spin, Tag } from 'antd'
import { BarChartOutlined, FireOutlined, IdcardOutlined, TrophyOutlined } from '@ant-design/icons'
import { playerApi } from '../../api/player'
import { withGlossary } from './statGlossary'
import StatViewSwitch from './StatViewSwitch'
import { CAREER_SEASON, NBA_TEAM_NAMES, PLAYOFF_TAG, fmtNum as num, fmtPair, seasonShort, fmtPct, displayName, seasonYears, teamName } from './rankConfig'
import { CAREER_AWARDS } from './honorConfig'
import { advColWidth, compactColumns, renderAllTeam, renderAppearance, sumColWidth } from './statColumns'
import { ADVANCED_STATS, fmtAdv } from './rankConfig'
import TeamLogo, { TeamNames } from '../../components/TeamLogo'
import SeasonProfile from './SeasonProfile'
import DraftTag from './DraftTag'
import GameLogTable from './GameLog'
import { SEASON_TYPE, useGameLogSeasons } from './gameLogConfig'
import useUrlState from '../../hooks/useUrlState'
import useIsMobile from '../../hooks/useIsMobile'

const shortSeason = (s) => seasonYears(s)

/* ============ 生涯荣誉（荣誉柜） ============ */

function AwardCard({ award, entries }) {
  const isChampion = award.key === 'champion'
  const isMobile = useIsMobile()
  return (
    <Card
      style={
        award.gold
          ? { background: 'linear-gradient(135deg, #fffbe6 0%, #fff1b8 100%)', border: '1px solid #ffe58f' }
          : undefined
      }
      styles={{ body: { padding: '16px 18px' } }}
    >
      <Space align="start" size={14}>
        <span style={{ fontSize: isMobile ? 26 : 34, lineHeight: 1 }}>{award.icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {award.label}
            <span style={{ marginLeft: 8, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: award.gold ? '#d48806' : '#1677ff' }}>
              ×{entries.length}
            </span>
          </div>
          <Space size={[4, 4]} wrap style={{ marginTop: 6 }}>
            {entries.map((e, i) => (
              <Tag key={i} color={award.gold ? 'gold' : 'default'} style={{ marginInlineEnd: 0 }}>
                {isChampion ? `${shortSeason(e.season)} · ${e.team}` : shortSeason(e)}
              </Tag>
            ))}
          </Space>
        </div>
      </Space>
    </Card>
  )
}

function HonorShelf({ honors }) {
  if (!honors) return <Spin style={{ display: 'block', margin: '40px auto' }} />
  const owned = CAREER_AWARDS.map((a) => ({ award: a, entries: honors[a.key] || [] })).filter((x) => x.entries.length > 0)
  if (!owned.length) return <Empty description="No major honors yet. Still on the way" />

  // 顶部速览条：只列拿过的荣誉计数
  const summary = owned.map((x) => `${x.award.icon} ${x.award.label} ×${x.entries.length}`).join(' · ')

  return (
    <>
      <Card
        style={{ marginBottom: 16, background: 'linear-gradient(120deg, #1677ff 0%, #4096ff 100%)', border: 'none' }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15, lineHeight: 2 }}>{summary}</span>
      </Card>
      <Row gutter={[16, 16]}>
        {owned.map((x) => (
          <Col key={x.award.key} xs={24} sm={12} lg={8}>
            <AwardCard award={x.award} entries={x.entries} />
          </Col>
        ))}
      </Row>
    </>
  )
}

/** 逐季表的高阶列：赛季/球队/出场打头，后面接共享的高阶指标定义 */
const advSeasonColumns = () => withGlossary([
  { title: 'Season', dataIndex: 'seasonNum', width: 64, fixed: 'left', render: (s) => (s === CAREER_SEASON ? 'Career' : seasonShort(s)) },
  { title: 'Team', dataIndex: 'playerTeam', width: 78, render: (v) => <TeamNames value={v} /> },
  // 出场不重复（基础表的「首发/出场」已有），时间留着——率值要配上场时间才读得懂
  { title: 'MIN', dataIndex: 'playingTime', width: 48, render: (v) => num(v) },
  // 正负值原来只在这儿、还只对季后赛开（常规赛那时拿不到），现在两张基础表都有了，这里不重复
  ...ADVANCED_STATS.map((a) => ({
    title: a.label,
    dataIndex: a.field,
    width: advColWidth(a, 14, 14),
    render: (v) => fmtAdv(v, a),
  })),
])

/* ============ Tab 1：生涯逐季数据 ============ */

function CareerTable({ playerId }) {
  const isMobile = useIsMobile()
  const [view, setView] = useState('basic')
  const basicColumns = [
    { title: 'Season', dataIndex: 'seasonNum', width: 64, fixed: 'left', render: (s) => (s === CAREER_SEASON ? 'Career' : seasonShort(s)) },
    { title: 'Team', dataIndex: 'playerTeam', width: 78, render: (v) => <TeamNames value={v} /> },
    { title: 'Pos', dataIndex: 'playerPosition', width: 46 },
    { title: 'GS/GP', dataIndex: 'playerAppearance', width: 94, render: renderAppearance },
    { title: 'MIN', dataIndex: 'playingTime', width: 48, render: (v) => num(v) },
    { title: 'PTS', dataIndex: 'playerAvgScore', width: 48, render: (v) => num(v) },
    { title: 'REB', dataIndex: 'playerAvgReb', width: 48, render: (v) => num(v) },
    { title: 'AST', dataIndex: 'playerAvgAss', width: 48, render: (v) => num(v) },
    { title: 'FG', dataIndex: 'playerAvgFgm', width: 88, render: (_, r) => fmtPair(r.playerAvgFgm, r.playerAvgFga) },
    { title: 'FG%', dataIndex: 'playerAccuracy', width: 56, render: (v) => fmtPct(v) },
    { title: '3P', dataIndex: 'playerAvgTpm', width: 88, render: (_, r) => fmtPair(r.playerAvgTpm, r.playerAvgTpa) },
    { title: '3P%', dataIndex: 'playerThreeAccuracy', width: 56, render: (v) => fmtPct(v) },
    { title: 'FT', dataIndex: 'playerAvgFtm', width: 88, render: (_, r) => fmtPair(r.playerAvgFtm, r.playerAvgFta) },
    { title: 'FT%', dataIndex: 'playerFreethrowAccuracy', width: 56, render: (v) => fmtPct(v) },
    { title: 'ORB', dataIndex: 'playerAvgOffReb', width: 48, render: (v) => num(v) },
    { title: 'DRB', dataIndex: 'playerAvgDefReb', width: 48, render: (v) => num(v) },
    { title: 'BLK', dataIndex: 'playerAvgBlock', width: 48, render: (v) => num(v) },
    { title: 'STL', dataIndex: 'playerAvgSteal', width: 48, render: (v) => num(v) },
    { title: 'TOV', dataIndex: 'playerAvgTurnover', width: 48, render: (v) => num(v) },
    { title: 'PF', dataIndex: 'playerAvgPf', width: 48, render: (v) => num(v) },
    // 常规赛的正负值来自逐场累加（赛季汇总表没这项），1997 起有值，更早的整季留空
    { title: '+/-', dataIndex: 'playerAvgPn', width: 62, render: (v) => num(v) },
    { title: 'PER', dataIndex: 'playerPer', width: 78, render: (v) => num(v) },
    { title: 'MVP', dataIndex: 'mvpRank', width: 50 },
    { title: 'DPOY', dataIndex: 'dpoyRank', width: 56 },
    { title: 'All-NBA', dataIndex: 'allDbaTeam', width: 72, render: renderAllTeam },
    { title: 'All-Def', dataIndex: 'allDefTeam', width: 72, render: renderAllTeam },
  ]

  const columns = view === 'adv' ? advSeasonColumns() : basicColumns
  const cols = isMobile ? compactColumns(columns) : columns
  return (
    <>
    <StatViewSwitch value={view} onChange={setView} />
    <ProTable
      className="stat-compact"
      bordered
      toolBarRender={false} /* 开关已挪到表外，这里回归纯表格 */
      rowKey="statsId"
      columns={cols}
      search={false}
      options={false}
      scroll={{ x: sumColWidth(cols) }}
      pagination={false}
      request={async (params, sort) => {
        const sortKey = Object.keys(sort || {})[0]
        const res = await playerApi.listPlayerCareer({
          playerId,
          page: 1,
          limit: 100,
          field: sortKey,
          order: sortKey ? (sort[sortKey] === 'ascend' ? 'asc' : 'desc') : undefined,
        })
        return { data: res.records || [], total: res.total || 0, success: true }
      }}
    />
    </>
  )
}

/* ============ Tab 2：季后赛逐季数据 ============ */

function PlayoffTable({ playerId }) {
  const isMobile = useIsMobile()
  const [view, setView] = useState('basic')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    playerApi.listPlayerPlayoffs(playerId)
      .then((r) => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [playerId])

  if (rows === null) return <Spin style={{ display: 'block', margin: '40px auto' }} />
  if (!rows.length) return <Empty description="Never made the playoffs" />

  const basicColumns = [
    { title: 'Season', dataIndex: 'seasonNum', width: 64, fixed: 'left', render: (s) => (s === CAREER_SEASON ? 'Career' : seasonShort(s)) },
    { title: 'Team', dataIndex: 'playerTeam', width: 78, render: (v) => <TeamNames value={v} /> },
    {
      // playoffResult 是库里的身份值（Champion / Finals / …），颜色按它查，文字原样显示
      title: 'Record', dataIndex: 'playoffResult', width: 92,
      render: (v) => (v ? <Tag color={PLAYOFF_TAG[v] || 'default'}>{v}</Tag> : '-'),
    },
    { title: 'GS/GP', dataIndex: 'playerAppearance', width: 94, render: (_, r) => `${r.playerFrAppearance ?? 0}/${r.playerAppearance ?? 0}` },
    { title: 'MIN', dataIndex: 'playingTime', width: 48, render: (v) => num(v) },
    { title: 'PTS', dataIndex: 'playerAvgScore', width: 48, render: (v) => <b style={{ color: '#1677ff' }}>{num(v)}</b> },
    { title: 'REB', dataIndex: 'playerAvgReb', width: 48, render: (v) => num(v) },
    { title: 'AST', dataIndex: 'playerAvgAss', width: 48, render: (v) => num(v) },
    { title: 'FG', dataIndex: 'playerAvgFgm', width: 88, render: (_, r) => fmtPair(r.playerAvgFgm, r.playerAvgFga) },
    { title: 'FG%', dataIndex: 'playerAccuracy', width: 56, render: (v) => fmtPct(v) },
    { title: '3P', dataIndex: 'playerAvgTpm', width: 88, render: (_, r) => fmtPair(r.playerAvgTpm, r.playerAvgTpa) },
    { title: '3P%', dataIndex: 'playerThreeAccuracy', width: 56, render: (v) => fmtPct(v) },
    { title: 'FT', dataIndex: 'playerAvgFtm', width: 88, render: (_, r) => fmtPair(r.playerAvgFtm, r.playerAvgFta) },
    { title: 'FT%', dataIndex: 'playerFreethrowAccuracy', width: 56, render: (v) => fmtPct(v) },
    { title: 'ORB', dataIndex: 'playerAvgOffReb', width: 48, render: (v) => num(v) },
    { title: 'DRB', dataIndex: 'playerAvgDefReb', width: 48, render: (v) => num(v) },
    { title: 'BLK', dataIndex: 'playerAvgBlock', width: 48, render: (v) => num(v) },
    { title: 'STL', dataIndex: 'playerAvgSteal', width: 48, render: (v) => num(v) },
    { title: 'TOV', dataIndex: 'playerAvgTurnover', width: 48, render: (v) => num(v) },
    { title: 'PF', dataIndex: 'playerAvgPf', width: 48, render: (v) => num(v) },
    { title: '+/-', dataIndex: 'playerAvgPn', width: 62, render: (v) => num(v) },
    { title: 'PER', dataIndex: 'playerPer', width: 78, render: (v) => num(v) },
  ]

  const columns = view === 'adv' ? advSeasonColumns() : basicColumns
  const cols = isMobile ? compactColumns(columns) : columns
  return (
    <>
    <StatViewSwitch value={view} onChange={setView} />
    <ProTable
      className="stat-compact"
      bordered
      toolBarRender={false} /* 开关已挪到表外，这里回归纯表格 */
      rowKey="statsId"
      dataSource={rows}
      columns={cols}
      search={false}
      options={false}
      pagination={false}
      scroll={{ x: sumColWidth(cols) }}
    />
    </>
  )
}

/* ============ 逐季汇总 / 逐场数据 ============ */

/**
 * 一个赛段（常规赛或季后赛）的内容区。
 * 逐场数据是逐步回补的，所以「逐场数据」这个选项只在该球员该赛段确实有数据时才出现 —— 
 * 常规赛回补进来之后，同一个开关会自动长在常规赛页签上，不用改代码。
 */
function StagePane({ playerId, seasonType, seasons, children }) {
  // 同样写进 URL——从「逐场数据」点开一场比赛再返回，要回到逐场表而不是逐季汇总
  const [view, setView] = useUrlState('view', 'season')
  const hasLog = !!seasons?.length

  // 没有逐场数据的球员一律按逐季汇总渲染。**派生而不是用 effect 把状态改回去**：
  // effect 要等一次提交之后才跑，中间会有一帧真的停在空表上
  const shown = hasLog ? view : 'season'

  return (
    <>
      {hasLog && (
        <div style={{ marginBottom: 12 }}>
          <Segmented
            value={shown}
            onChange={setView}
            options={[{ label: 'By Season', value: 'season' }, { label: 'Game Log', value: 'game' }]}
          />
        </div>
      )}
      {shown === 'season'
        ? children
        : <GameLogTable playerId={playerId} seasonType={seasonType} seasons={seasons} />}
    </>
  )
}


/* ============ 页面 ============ */

// 分段器选项（品牌色胶囊，与数据概览同一设计语言）
const TAB_OPTIONS = [
  { value: 'profile', icon: <IdcardOutlined />, text: 'Season Profile' },
  { value: 'career', icon: <BarChartOutlined />, text: 'Regular Season Stats' },
  { value: 'playoffs', icon: <FireOutlined />, text: 'Playoff Stats' },
  { value: 'honors', icon: <TrophyOutlined />, text: 'Career Honors' },
]

/** 球员主页（/players/:playerId）：身份头 + 赛季资料卡 / 生涯数据 / 生涯荣誉 */
export default function PlayerCareer() {
  const { playerId } = useParams()
  const isMobile = useIsMobile()
  const [honors, setHonors] = useState(null)
  // 页签写进 URL：点进某一场比赛再返回时，这一页要回到用户刚才看的那个页签，
  // 而不是默认的赛季资料卡。放在 useState 里的话一离开就丢了
  const [tab, setTab] = useUrlState('tab', 'profile')
  // 资料卡选中赛季所属球队（由 SeasonProfile 回报）：身份头右侧那枚大队标就认它。
  // 交易赛季取最后一站＝赛季结束时所在的队；生涯档没有单一球队，不出队标。
  const [seasonTeam, setSeasonTeam] = useState(null)
  const [seasonNum, setSeasonNum] = useState(null) // 资料卡选中的赛季：队标跳转要带着它，落到同一个赛季的球队页
  const teamCode = String(seasonTeam || '').split('->').pop().trim().toUpperCase()
  const showTeamLogo = !!NBA_TEAM_NAMES[teamCode]
  // 一次查清这名球员哪些赛季有逐场数据，常规赛/季后赛两个页签共用这一份结果
  const gameLogSeasons = useGameLogSeasons(playerId)

  useEffect(() => {
    let alive = true
    setHonors(null)
    setSeasonTeam(null) // 换球员先清掉，别让上一位的队标停在头上
    playerApi.playerHonors(playerId)
      .then((d) => { if (alive) setHonors(d || {}) })
      .catch(() => { if (alive) setHonors({}) })
    return () => { alive = false }
  }, [playerId])

  const goldCount = honors
    ? (honors.champion?.length || 0) + (honors.mvp?.length || 0) + (honors.dpoy?.length || 0)
    : 0

  return (
    <>
      {/* 球员身份头：左边身份，右边一枚大队标（资料卡当前赛季所属球队） */}
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '18px 24px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Space size={16} align="center">
          {/* 有照片就上照片（超管在球员管理里传），没有则沿用球衣号圆牌 */}
          {honors?.photo ? (
            <img
              src={honors.photo}
              alt={displayName(honors)}
              style={{
                width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center',
                background: '#f5f5f5', border: '2px solid #fff', boxShadow: '0 2px 10px rgba(0,0,0,.14)',
              }}
            />
          ) : (
            <div
              style={{
                width: 56, height: 56, borderRadius: '50%', background: 'rgba(22,119,255,.1)', color: '#1677ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20,
              }}
            >
              {honors?.playerNumber ? `#${honors.playerNumber}` : '🏀'}
            </div>
          )}
          <div>
            {/* 手机上降一档：中文译名长的（「扬尼斯·阿德托昆博」这一类）在 20px 下，
                左边头像和右边队标一夹就换行 */}
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, lineHeight: 1.3 }}>
              {displayName(honors) || '…'}
              {/* 圆牌让位给照片时，球衣号跟到名字后面，信息不丢 */}
              {honors?.photo && honors?.playerNumber && (
                <span style={{ marginLeft: 8, fontSize: isMobile ? 13 : 14, fontWeight: 800, color: '#1677ff' }}>#{honors.playerNumber}</span>
              )}
            </div>
            {/* 名字下面原来还有一行「另一种名字」（中文界面配英文原名、英文界面配中文名）。
                网站改成只保留英文、主名字已经是英文原名，那一行只剩中文译名，读者用不上，整行去掉 */}
            {/* 手机上省掉括号里的注解，否则右边那枚队标一挤，这行会从「冠军」中间断开 */}
            <div style={{ color: '#999', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* 选秀标签排在荣誉说明前面：它是这名球员的出身，先于他后来打成什么样 */}
              <DraftTag draft={honors?.draft} size={isMobile ? 'small' : 'normal'} />
              <span>
                {goldCount > 0
                  ? `Top honors ×${goldCount}${isMobile ? '' : ' (titles/MVP/DPOY)'}`
                  : 'Career stats & honors by season'}
              </span>
            </div>
          </div>
        </Space>
        {showTeamLogo && (
          // 点队标进这支球队的页面，并停在资料卡当前选中的那个赛季（生涯档没有单一赛季，不带参数）
          <Link
            to={`/players/team/${teamCode}${seasonNum && seasonNum !== CAREER_SEASON ? `?seasonNum=${seasonNum}` : ''}`}
            title={`View ${teamName(teamCode)}`}
            style={{ flexShrink: 0, lineHeight: 0 }}
          >
            <TeamLogo code={teamCode} size={isMobile ? 60 : 76} />
          </Link>
        )}
        </div>
      </Card>
      {/* 胶囊分段器（替代默认 Tabs） */}
      <ConfigProvider
        theme={{
          token: { borderRadius: 22, borderRadiusSM: 18 },
          components: {
            Segmented: {
              itemSelectedBg: '#1677ff',
              itemSelectedColor: '#ffffff',
              trackBg: '#efefef',
              itemColor: '#666',
              itemHoverColor: '#1677ff',
              itemHoverBg: 'rgba(22,119,255,0.08)',
            },
          },
        }}
      >
        <Segmented
          size="large"
          value={tab}
          onChange={setTab}
          style={{ marginBottom: 16, padding: 4, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.04)' }}
          options={TAB_OPTIONS.map((o) => ({
            value: o.value,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
                {o.icon} {o.text}
              </span>
            ),
          }))}
        />
      </ConfigProvider>
      {tab === 'profile' && <SeasonProfile playerId={playerId} honors={honors} onTeamChange={setSeasonTeam} onSeasonChange={setSeasonNum} />}
      {tab === 'career' && (
        <StagePane playerId={playerId} seasonType={SEASON_TYPE.REG} seasons={gameLogSeasons?.[SEASON_TYPE.REG]}>
          <CareerTable playerId={playerId} />
        </StagePane>
      )}
      {tab === 'playoffs' && (
        <StagePane playerId={playerId} seasonType={SEASON_TYPE.PO} seasons={gameLogSeasons?.[SEASON_TYPE.PO]}>
          <PlayoffTable playerId={playerId} />
        </StagePane>
      )}
      {tab === 'honors' && <HonorShelf honors={honors} />}
    </>
  )
}
