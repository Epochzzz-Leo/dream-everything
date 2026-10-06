import { useEffect, useState } from 'react'
import { Alert, Checkbox, Modal } from 'antd'
import dayjs from 'dayjs'
import { chatApi } from '../api/chat'
import DayRangePicker from './DayRangePicker'

/**
 * 导出群聊备份（题主/管理者）。
 *
 * 日期是**闭区间**：选 7-21 ~ 7-28，导出的是 7-21 00:00 到 **7-29 00:00 之前**的全部消息，
 * 也就是把 7-28 那一整天算进去——包含你点下载那一刻为止的最新消息。
 * 这是最容易写错的地方：写成 `<= 结束日` 会把结束日整天漏掉。
 *
 * 下载走浏览器直连（不经 axios）：要的是把文件存下来，不是拿到响应体。
 */
export default function ChatExportModal({ topicId, open, onClose }) {
  const [range, setRange] = useState(null)
  const [all, setAll] = useState(true)

  useEffect(() => {
    if (!open) { setRange(null); setAll(true) }
  }, [open])

  const ok = () => {
    const [from, to] = all || !range ? [null, null] : [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')]
    window.open(chatApi.exportUrl(topicId, from, to), '_blank')
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={ok}
      okText="Download"
      cancelText="Cancel"
      okButtonProps={{ disabled: !all && !range }}
      title="Export chat backup"
      width={440}
      destroyOnClose
    >
      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 12 }}>
        {'Packed as a zip: '}<code>messages.json</code>{' (structured), '}<code>chat.txt</code>{' (readable log), '}
        <code>files/</code>{' (original images and attachments).'}
      </div>
      <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)}>Export everything</Checkbox>
      <div style={{ marginTop: 12 }}>
        <DayRangePicker
          value={range}
          onChange={(v) => { setRange(v); if (v) setAll(false) }}
          disabled={all}
          disabledDate={(d) => d && d > dayjs().endOf('day')}
        />
      </div>
      {!all && range && (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          message={`Export ${range[0].format('MMM D')} to ${range[1].format('MMM D')}, including everything on ${range[1].format('MMM D')} up to now`}
        />
      )}
    </Modal>
  )
}
