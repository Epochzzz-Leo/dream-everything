import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, Checkbox, Form, Input, Modal, Radio, Select, Space, Switch, Tag, Upload, message } from 'antd'
import { DeleteOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons'
import { compressImage } from '../utils/image'
import { topicApi } from '../api/topic'
import { searchApi } from '../api/search'
import { useAuth } from '../auth/AuthContext'

/**
 * 建 / 改专题弹窗。
 * - 建（admin）：名称/简介 + 指定 owner + 公开性 + 公开专题的"开放发帖/发言"；
 * - 改（admin 或 owner，传 topic）：改设置（owner 不在这里改）。
 * 公开=人人可浏览、默认只限白名单发帖发言；勾"开放发帖/发言"则任何登录用户都能发。
 */

const avatarColor = (name) => {
  let h = 0
  for (const c of String(name || '?')) h = (h * 31 + c.codePointAt(0)) % 360
  return `hsl(${h}, 52%, 52%)`
}

export default function TopicEditModal({ open, onClose, onSaved, topic, categories = [] }) {
  const isEdit = !!topic
  const { user, dn } = useAuth() // 题主候选也显示备注名，跟搜索口径一致
  const isSuper = !!user?.isSuperManager // 超管建专题可代指定 owner；普通用户创建后自己即题主
  const [form] = Form.useForm()
  const [visibility, setVisibility] = useState('public')
  const [opts, setOpts] = useState([])
  const [saving, setSaving] = useState(false)
  const [postCats, setPostCats] = useState([]) // 本专题的帖子类别 [{id,name}]（题主配）
  const [newCat, setNewCat] = useState('')
  // 背景图：banner 是已落库的地址（'' 表示"这次要清掉"），bannerFile 是还没上传的新图。
  // 两者互斥——选了新图就以新图为准，点了移除就把 banner 置 ''
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(null)
  const timer = useRef()

  useEffect(() => {
    if (!open) return
    if (isEdit) {
      form.setFieldsValue({
        name: topic.name, description: topic.description,
        visibility: topic.visibility, openPost: topic.openPost, openComment: topic.openComment,
        listed: topic.listed !== false, categoryId: topic.categoryId || undefined,
        chatEnabled: !!topic.chatEnabled,
        filesEnabled: !!topic.filesEnabled,
      })
      setVisibility(topic.visibility || 'public')
      setPostCats(topic.postCategories || [])
      setBanner(topic.banner || null)
    } else {
      form.resetFields()
      form.setFieldsValue({ visibility: 'public', openPost: false, openComment: false, listed: true, chatEnabled: false })
      setVisibility('public')
      setPostCats([])
      setBanner(null)
    }
    setNewCat('')
    setOpts([])
    // 每次打开都把上一次没提交的选图丢掉，并释放它的 blob（不释放就一直占着内存）
    setBannerFile(null)
    setBannerPreview((old) => { if (old) URL.revokeObjectURL(old); return null })
  }, [open, isEdit, topic, form])

  // 帖子类别：本地先编好，跟专题设置一起提交（一次弹窗、一次保存，不搞两套按钮）。
  // 新加的一项先给个临时 id，后端见到不认识的 id 会重新发一个，效果一样
  const addPostCat = () => {
    const n = newCat.trim()
    if (!n || postCats.length >= 20) return
    if (postCats.some((c) => c.name === n)) return message.info('That category already exists')
    setPostCats((arr) => [...arr, { id: `new-${Date.now()}`, name: n }])
    setNewCat('')
  }

  const search = (kw) => {
    clearTimeout(timer.current)
    if (!kw.trim()) return setOpts([])
    timer.current = setTimeout(async () => {
      try {
        const list = await searchApi.mentionUsers(kw)
        setOpts((list || []).map((u) => ({ value: u.userId, label: dn(u.userId, u.userNickname), avatar: u.avatar })))
      } catch { setOpts([]) }
    }, 250)
  }

  const submit = async () => {
    let v
    try { v = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      const payload = {
        name: v.name,
        description: v.description || '',
        visibility: v.visibility,
        listed: v.listed === false ? '0' : '1',
        openPost: v.visibility === 'public' && v.openPost ? '1' : '0',
        openComment: v.visibility === 'public' && v.openComment ? '1' : '0',
        categoryId: v.categoryId || '', // 空串=显式设为未分类（后端据此区分"没传"和"清空"）
        chatEnabled: v.chatEnabled ? '1' : '0',
      }
      // 文件系统开关只有超管的请求会被后端采纳；非超管干脆不发这个参数，
      // 免得表单里残留的值把超管刚设的又盖回去
      if (isSuper) payload.filesEnabled = v.filesEnabled ? '1' : '0'
      if (isEdit) {
        // 背景图先传：uploadBanner 自己就落库了，所以随后的 update 不带 banner 参数
        // （后端见 null 就不动这一列）。只有"点了移除且没选新图"才显式传空串
        if (bannerFile) {
          await topicApi.uploadBanner(topic.topicId, await compressImage(bannerFile))
        } else if (banner === '') {
          payload.banner = ''
        }
        await topicApi.update({ topicId: topic.topicId, ...payload })
        // 帖子类别是另一个接口（整份覆盖），跟着一起提交
        await topicApi.setPostCategories(topic.topicId, postCats)
        message.success('Saved')
      } else {
        await topicApi.create({ ...payload, ownerId: v.ownerId })
        message.success('Topic created')
      }
      onSaved?.()
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
      okText={isEdit ? 'Save' : 'Create'}
      cancelText="Cancel"
      title={isEdit ? 'Edit topic' : 'New topic'}
      width={520}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        {/* 上限和后端 TopicController 的 NAME_MAX / DESC_MAX 一致。
            原来是 40 / 200，写得下但显示不下——专题名要出现在卡片、横幅、侧栏、
            搜索结果、面包屑里，那几处宽度固定，超了就是被省略号截掉。
            `showCount` 让人在打字时就看见还剩几个字，而不是点了保存才被后端拒绝 */}
        <Form.Item name="name" label="Topic name" rules={[{ required: true, message: 'Please enter a name' }]}>
          <Input placeholder="e.g. Book club" maxLength={15} showCount />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea placeholder="One line about this topic" maxLength={50} showCount autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
        {/* 背景图：专题页顶部整块铺它，百家说的卡片顶部也铺一条。
            要 topicId 才能上传，所以只在编辑时出现（和帖子类别同理）。
            预览按 3:1 画——和专题页横幅的比例一致，选图的时候就能看出会被裁掉哪儿 */}
        {isEdit && (
          <Form.Item label="Cover image" extra="A landscape image around 1200×400 works best, jpg/png/webp ≤ 20MB (resized to 1600px on the long side before upload). Leave empty for the default orange gradient">
            <div
              style={{
                position: 'relative', width: '100%', aspectRatio: '3 / 1', borderRadius: 12,
                overflow: 'hidden', background: bannerPreview || (banner && banner !== '')
                  ? '#f5f5f5'
                  : 'linear-gradient(120deg, #1677ff 0%, #0958d9 60%, #003eb3 100%)',
                border: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {(bannerPreview || (banner && banner !== '')) ? (
                <img
                  src={bannerPreview || banner}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13 }}>
                  <PictureOutlined style={{ marginRight: 6 }} />No cover image yet
                </span>
              )}
            </div>
            <Space style={{ marginTop: 10 }}>
              <Upload
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={(file) => {
                  // 20MB：背景图多半是相机原图或壁纸，10MB 很容易顶到。
                  // 服务端 FileUtils.uploadBanner 也是这个数（Spring 的 multipart 上限 30MB，够）
                  if (file.size > 20 * 1024 * 1024) {
                    message.error('Image must be under 20MB')
                    return Upload.LIST_IGNORE
                  }
                  if (bannerPreview) URL.revokeObjectURL(bannerPreview)
                  setBannerFile(file)
                  setBannerPreview(URL.createObjectURL(file))
                  return false // 不自动上传，点"保存"才提交
                }}
              >
                <Button icon={<PictureOutlined />}>{banner || bannerPreview ? 'Change' : 'Choose image'}</Button>
              </Upload>
              {(bannerPreview || (banner && banner !== '')) && (
                <Button
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
                    setBannerPreview(null)
                    setBannerFile(null)
                    setBanner('') // '' = 保存时显式清空（null 会被后端当成"没传"）
                  }}
                >
                  Remove
                </Button>
              )}
            </Space>
          </Form.Item>
        )}
        {!isEdit && isSuper && (
          <Form.Item name="ownerId" label="Topic owner (manages member permissions)" rules={[{ required: true, message: 'Please pick an owner' }]}>
            <Select
              virtual={false}
              showSearch
              filterOption={false}
              placeholder="Search a user to make owner"
              onSearch={search}
              notFoundContent={null}
              options={opts.map((o) => ({
                value: o.value,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {o.avatar ? <Avatar size={20} src={o.avatar} /> : <Avatar size={20} style={{ background: avatarColor(o.label), fontSize: 11 }}>{String(o.label || '?')[0].toUpperCase()}</Avatar>}
                    {o.label}
                  </span>
                ),
              }))}
            />
          </Form.Item>
        )}
        {/* 专题类别：全站一份，超管在百家说首页的「管理类别」里维护。这里只是挑一个 */}
        {categories.length > 0 && (
          <Form.Item name="categoryId" label="Topic category" extra="Decides which filter on the Chat Everything home page shows this topic">
            <Select
              virtual={false}
              allowClear
              placeholder="None = uncategorized"
              options={categories.map((c) => ({ value: c.categoryId, label: c.name }))}
            />
          </Form.Item>
        )}
        <Form.Item name="visibility" label="Visibility">
          <Radio.Group onChange={(e) => setVisibility(e.target.value)}>
            <Radio value="public">Public (anyone can view)</Radio>
            <Radio value="private">Private (members only)</Radio>
          </Radio.Group>
        </Form.Item>
        {visibility === 'public' && (
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>In a public topic only listed members can post or comment by default. You can open it to everyone:</div>
            <Form.Item name="openPost" valuePropName="checked" noStyle>
              <Checkbox>Let any signed-in user post</Checkbox>
            </Form.Item>
            <Form.Item name="openComment" valuePropName="checked" noStyle>
              <Checkbox style={{ marginLeft: 16 }}>Let any signed-in user comment</Checkbox>
            </Form.Item>
          </div>
        )}
        {/* 帖子类别：本专题自己的一份，题主说了算，和上面的专题类别是两回事。
            建专题时还没有 topicId，所以只在编辑时出现 */}
        {isEdit && (
          <Form.Item label="Post categories" extra={'Used inside this topic: pick one when posting and filter the feed by it. Deleting one moves its posts back to "Uncategorized"'}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: postCats.length ? 10 : 0 }}>
              {postCats.map((c) => (
                <Tag
                  key={c.id}
                  closable
                  color="volcano"
                  onClose={() => setPostCats((arr) => arr.filter((x) => x.id !== c.id))}
                  style={{ marginInlineEnd: 0, fontSize: 13, padding: '2px 8px' }}
                >
                  {c.name}
                </Tag>
              ))}
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="e.g. Notice, Recap, Help (up to 20)"
                maxLength={12}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onPressEnter={(e) => { e.preventDefault(); addPostCat() }}
              />
              <Button icon={<PlusOutlined />} onClick={addPostCat} disabled={!newCat.trim() || postCats.length >= 20}>Add</Button>
            </Space.Compact>
          </Form.Item>
        )}
        {/* 文件系统：只有超管看得到这一行——开关本身就只有超管能动（占的是服务器的盘）。
            题主的权限是"开了之后管理里面的内容"，不含开关 */}
        {isEdit && isSuper && (
          <Form.Item
            name="filesEnabled"
            label="Files"
            valuePropName="checked"
            extra="Super admin only. When on, the owner can upload files and create folders; anyone who can view the topic can browse and download."
            style={{ marginTop: 12 }}
          >
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
        )}
        {/* 群聊：默认关，题主自己决定要不要给这个专题开一个实时房间 */}
        {isEdit && (
          <Form.Item
            name="chatEnabled"
            label="Group chat"
            valuePropName="checked"
            extra="When on, anyone who can view the topic can join the chat. To mute one person, turn off their chat switch under Members."
            style={{ marginTop: 12 }}
          >
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
        )}
        <Form.Item
          name="listed"
          label="Listed in Chat Everything"
          valuePropName="checked"
          extra="When off, the topic is hidden from the Chat Everything list, site search and the hot list; the owner, admins and members can still see and open it."
          style={{ marginTop: 12 }}
        >
          <Switch checkedChildren="Listed" unCheckedChildren="Hide" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
