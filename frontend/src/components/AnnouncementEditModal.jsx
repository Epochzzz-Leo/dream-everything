import { useEffect, useState } from 'react'
import { Alert, Input, Modal, Segmented, Switch, message } from 'antd'
import { announceApi } from '../api/announce'

/**
 * 编辑全站公告（超管）。
 *
 * 保存之后所有人（含之前把它叉掉的人）都会重新看到——因为版本号是修改时间，
 * 一保存就变了。这一点在弹窗里明说，免得以为改个错别字不会打扰别人。
 */
const LEVELS = [
  { label: 'Normal', value: 'info' },
  { label: 'Notice', value: 'warning' },
  { label: 'Urgent', value: 'error' },
]

export default function AnnouncementEditModal({ open, onClose }) {
  const [content, setContent] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [level, setLevel] = useState('info')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    announceApi.get()
      .then((r) => {
        setContent(r?.content || '')
        setEnabled(!!r?.enabled)
        setLevel(r?.level || 'info')
      })
      .catch(() => {})
  }, [open])

  const submit = async () => {
    setSaving(true)
    try {
      await announceApi.save({ content, enabled: enabled ? '1' : '0', level })
      message.success(enabled ? 'Announcement published' : 'Announcement turned off')
      onClose()
    } catch { /* 拦截器已提示 */ } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      okText="Save"
      cancelText="Cancel"
      title="Site Announcement"
      width={480}
      destroyOnClose
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Switch checked={enabled} onChange={setEnabled} checkedChildren="Showing" unCheckedChildren="Turned off" />
        <Segmented size="small" options={LEVELS} value={level} onChange={setLevel} />
      </div>
      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write the notice to scroll, e.g. Server maintenance Sunday 20:00, the site will be briefly unavailable"
        maxLength={500}
        showCount
        autoSize={{ minRows: 3, maxRows: 6 }}
      />
      <Alert
        style={{ marginTop: 12 }}
        type="info"
        message={level === 'error'
          ? 'Closing an urgent notice only hides it for now; it comes back on reload or next visit. Maintenance and outage notices shouldn\'t be muted for good with one click.'
          : 'After saving, people who closed it will see it again: the dismissal is per version, and any edit makes a new version.'}
      />
    </Modal>
  )
}
