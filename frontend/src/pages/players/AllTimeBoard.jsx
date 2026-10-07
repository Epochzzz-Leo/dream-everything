import { useEffect, useState } from 'react'
import { Card, Empty, Spin, Table } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { playerApi } from '../../api/player'
import { CAREER_TOTAL_STATS, displayName, fmtTotal } from './rankConfig'
import { compactColumns, sumColWidth } from './statColumns'
import useIsMobile from '../../hooks/useIsMobile'

/**
 * 单项生涯总数的历史总榜（/rankings/alltime/:field）。
 *
 * 池子是 1947 年至今的全联盟，所以榜上会有大量本库没有资料卡的人（张伯伦、拉塞尔……）。
 * 他们走「历史球员最小档案」页，不是死链接——名字一律可点，只是落地页深浅不同。
 *
 * 不分页一滚到底：得分榜有四千多人，分页反而不好找人。
 */
export default function AllTimeBoard() {
  const { field } = useParams()
  const isMobile = useIsMobile()
  const [rows, setRows] = useState(null)
  // 认不出的字段给个兜底名
  const stat = CAREER_TOTAL_STATS.find((s) => s.key === field) || { key: field, label: 'Stat' }

  useEffect(() => {
    let alive = true
    setRows(null)
    playerApi.allTimeBoard(field)
      .then((r) => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [field])

  const MEDAL = ['#f5b301', '#9aa0a6', '#b87333']
  const columns = [
    {
      title: 'Rank', dataIndex: 'rk', width: 60, fixed: 'left',
      render: (v) => (
        <span style={{ fontWeight: v <= 3 ? 800 : 400, fontStyle: 'italic', color: v <= 3 ? MEDAL[v - 1] : '#bbb' }}>{v}</span>
      ),
    },
    {
      title: 'Player', dataIndex: 'playerName', width: 150, fixed: 'left',
      // 本库有资料卡的进资料卡（生涯档），没有的进最小档案，都不留死链接。
      // 名字走 displayName（英文原名优先）：这张表的 nameEn 是 nba_career_totals 的 B-R 原名，
      // 原来直接显示 playerName（中文译名），整页约 100 个中文名
      render: (_, r) => (
        <Link to={r.playerId ? `/players/${r.playerId}?seasonNum=99` : `/players/history/${r.brId}`}>{displayName(r)}</Link>
      ),
    },
    { title: 'Years', dataIndex: 'firstYear', width: 96, render: (_, r) => `${r.firstYear}-${r.lastYear}` },
    { title: 'Season', dataIndex: 'seasons', width: 56 },
    {
      title: stat.label, dataIndex: 'val', width: 96,
      render: (v) => <b style={{ color: '#1677ff', fontVariantNumeric: 'tabular-nums' }}>{fmtTotal(v)}</b>,
    },
  ]
  const cols = isMobile ? compactColumns(columns) : columns

  return (
    <Card
      title={`${stat.label} · All-Time`}
      extra={<span style={{ color: '#bbb', fontSize: 12 }}>{rows ? `${rows.length} players` : ''}</span>}
      styles={{ body: { padding: 0 } }}
    >
      {rows === null ? (
        <Spin style={{ display: 'block', margin: '60px auto' }} />
      ) : rows.length ? (
        <Table
          bordered
          className="clean-table stat-compact"
          rowKey="brId"
          dataSource={rows}
          columns={cols}
          size="middle"
          /*
            不给 scroll.y，也就不开虚拟滚动——两者是绑定的（antd 的 virtual 必须有固定高度）。
            固定高度会在页面里再套一个纵向滚动区：快速滑动时内层中途到底，惯性交给页面继续滚，
            观感就是整张表被带着走。单项排行的完整排行页没有 scroll.y，所以手感是对的，这里对齐它。
            但那一页只有五百来行，这里是 5015 行，全塞进 DOM 会卡，所以改成分页：
            页面自己滚（手感一致），DOM 里同时只有 100 行（不卡），全量仍然翻得到。
          */
          pagination={{ pageSize: 100, showSizeChanger: false, size: 'small', showLessItems: isMobile }}
          scroll={{ x: sumColWidth(cols) }}
        />
      ) : (
        <Empty description="No data" style={{ padding: 40 }} />
      )}
    </Card>
  )
}
