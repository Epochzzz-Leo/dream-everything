import { useEffect, useRef, useState } from 'react'
import { EditableProTable } from '@ant-design/pro-components'
import { Button, Popconfirm, message } from 'antd'
import { useParams, Link } from 'react-router-dom'
import { playerApi } from '../../api/player'
import { CAREER_SEASON } from './rankConfig'

// [字段, 列名, 类型]：数字用 digit(InputNumber)，文本用 text
const STAT_FIELDS = [
  ['season', 'Season', 'digit'], ['seasonNum', '#', 'digit'],
  ['playerTeam', 'Team', 'text'], ['playerPosition', 'Pos', 'text'],
  ['playerAppearance', 'GP', 'digit'], ['playerFrAppearance', 'GS', 'digit'], ['playerSrAppearance', 'Bench', 'digit'],
  ['playingTime', 'MIN', 'digit'], ['playerAvgScore', 'PTS', 'digit'],
  ['playerAvgReb', 'REB', 'digit'], ['playerAvgOffReb', 'ORB', 'digit'], ['playerAvgDefReb', 'DRB', 'digit'],
  ['playerAvgAss', 'AST', 'digit'],
  ['playerAvgFgm', 'FGM', 'digit'], ['playerAvgFga', 'FGA', 'digit'], ['playerAccuracy', 'FG%', 'digit'],
  ['playerAvgTpm', '3PM', 'digit'], ['playerAvgTpa', '3PA', 'digit'], ['playerThreeAccuracy', '3P%', 'digit'],
  ['playerAvgFtm', 'FTM', 'digit'], ['playerAvgFta', 'FTA', 'digit'], ['playerFreethrowAccuracy', 'FT%', 'digit'],
  ['playerAvgBlock', 'BLK', 'digit'], ['playerAvgSteal', 'STL', 'digit'], ['playerAvgTurnover', 'TOV', 'digit'],
  ['playerPer', 'PER', 'digit'], ['playerPie', 'PIE', 'digit'], ['playerWs', 'WS', 'digit'],
  ['playerOffEff', 'ORtg', 'digit'], ['playerDefEff', 'DRtg', 'digit'], ['playerNetEff', 'Net Rtg', 'digit'], ['playerAvgPn', '+/-', 'digit'],
  ['mvpRank', 'MVP', 'digit'], ['dpoyRank', 'DPOY', 'digit'],
  ['allDbaTeam', 'All-NBA', 'text'], ['allDefTeam', 'All-Def', 'text'],
]

const SUMMARY_SEASON = CAREER_SEASON // 生涯汇总行（season/seasonNum=CAREER_SEASON），由后端重算，不可删
const isTemp = (id) => typeof id === 'string' && id.startsWith('new-')

/**
 * 某球员生涯逐季数据管理（superManager）。替代 player-stats-manager-list.ftl。
 * "新增一行赛季"只在前端本地追加（带 new- 临时 id），点"保存全部"才入库——
 * savePlayerStats 对空 statsId 会补 UUID 再保存，并重算生涯汇总行(seasonNum=99)。
 */
export default function PlayerStatsManage() {
  const { playerId } = useParams()
  const [rows, setRows] = useState([])
  const [editableKeys, setEditableKeys] = useState([])
  const [loading, setLoading] = useState(false)
  const tmpSeq = useRef(0) // 递增计数器，保证本地新行的 rowKey 唯一

  const reload = async () => {
    setLoading(true)
    try {
      const res = await playerApi.listPlayerCareer({ playerId, page: 1, limit: 1000 })
      const records = res.records || []
      setRows(records)
      setEditableKeys(records.map((r) => r.statsId))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, [playerId])

  // 本地新增一行：不落库，给个 new- 临时 id 占 rowKey，序号自动取最大季+1
  const onAddRow = () => {
    const tmpId = `new-${tmpSeq.current++}`
    const maxNum = rows
      .filter((r) => r.seasonNum !== SUMMARY_SEASON)
      .reduce((m, r) => Math.max(m, Number(r.seasonNum) || 0), 0)
    setRows([...rows, { statsId: tmpId, playerId, seasonNum: maxNum + 1 }])
    setEditableKeys([...editableKeys, tmpId])
  }

  const onSaveAll = async () => {
    // 临时行清空 statsId（让后端补 UUID）并带上 playerId
    const payload = rows.map((r) => (isTemp(r.statsId) ? { ...r, statsId: '', playerId } : r))
    await playerApi.savePlayerStats(payload, playerId)
    message.success('Saved; career totals recalculated')
    reload()
  }

  const onDelete = async (row) => {
    if (isTemp(row.statsId)) { // 还没入库，本地删掉即可
      setRows(rows.filter((r) => r.statsId !== row.statsId))
      setEditableKeys(editableKeys.filter((k) => k !== row.statsId))
      return
    }
    await playerApi.deletePlayerStats(row.statsId, playerId)
    message.success('Deleted; career totals recalculated')
    reload()
  }

  const columns = [
    ...STAT_FIELDS.map(([dataIndex, title, valueType]) => ({ title: title, dataIndex, valueType, width: 92 })),
    {
      title: 'Actions', valueType: 'option', fixed: 'right', width: 80, editable: false,
      render: (_, row) =>
        row.seasonNum === SUMMARY_SEASON
          ? [<span key="s" style={{ color: '#999' }}>Totals</span>]
          : [
              <Popconfirm key="del" title="Delete this season's data?" onConfirm={() => onDelete(row)}>
                <a style={{ color: '#ff4d4f' }}>Delete</a>
              </Popconfirm>,
            ],
    },
  ]

  return (
    <>
      <EditableProTable
        rowKey="statsId"
        headerTitle="Manage season data (career totals recalculate on save)"
        loading={loading}
        value={rows}
        onChange={setRows}
        recordCreatorProps={false}
        editable={{ type: 'multiple', editableKeys, onChange: setEditableKeys, actionRender: () => [] }}
        columns={columns}
        scroll={{ x: 3300 }}
        toolBarRender={() => [
          <Button key="add" onClick={onAddRow}>Add season row</Button>,
          <Button key="save" type="primary" onClick={onSaveAll}>Save all (recalculate)</Button>,
        ]}
      />
    </>
  )
}
