import { Segmented } from 'antd'
import { POSITION_GROUPS } from './rankConfig'
import ControlGroup from './ControlGroup'

/**
 * 位置筛选器，所有球员数据排行共用。
 * 分组规则在 rankConfig 的 inPositionGroup（PG/SG→后卫，SF/PF→前锋）。
 */
export default function PositionFilter({ value, onChange }) {
  return (
    <ControlGroup label="Pos">
      {/* label 显示用；value 是筛选用的身份值（all / G / F / C） */}
      <Segmented size="small" value={value || 'all'} onChange={onChange} options={POSITION_GROUPS.map((g) => ({ value: g.value, label: g.label }))} />
    </ControlGroup>
  )
}
