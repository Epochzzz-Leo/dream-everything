/**
 * 一条站内消息「怎么念、点了去哪」——消息页和 service worker **共用这一份**。
 *
 * 抽出来的原因：手机推送弹出来的那条通知，和「我的消息」列表里的那一行，说的必须是同一件事。
 * 各写一份的话，加一种消息类型时改了列表忘了推送，通知上就会冒出 default 分支的兜底文案，
 * 而且只有真机上才看得见。
 *
 * 这里**不能 import 任何 React/antd 的东西**：service worker 里没有 DOM，
 * 引进去构建能过、运行时直接炸。config/modules.js 是纯常量，可以引。
 */
import { LOL_TOPIC_ID } from '../config/modules'

// 点赞/点踩帖子类消息 msgId=帖子 id；评论类（含评论里@）msgId=评论 id、msgIdSecond=帖子 id
const COMMENT_TYPES = ['goodComment', 'badComment', 'commentComment', 'mentionComment']
// 专题类消息 msgId=专题 id，点进去跳专题页
const TOPIC_TYPES = ['topicApply', 'topicApproved', 'topicRejected', 'mentionChat']
// 日程类：remind 的 msgId=日期；assign 的 msgId=事件id、msgIdSecond=日期。点进日历对应那天（顺便标已读）
const SCHEDULE_TYPES = ['scheduleAssign', 'scheduleRemind', 'scheduleOverdue', 'scheduleExpiry']
// 每日赛场的短评/回复：被 @ 或被回复，msgId=比赛 id，点进去跳那场比赛（短评没有自己的页面）
const GAME_TYPES = ['mentionGame', 'replyGame']
// 开黑对局的短评/回复：同上，msgId=Riot 的 matchId。对局详情是战绩流里的一个浮层、
// 没有自己的路由，所以带 ?match= 进去让战绩流自己展开那一局
const LOL_TYPES = ['mentionLol', 'replyLol']

const newsIdOf = (m) => (COMMENT_TYPES.includes(m.msgType) ? m.msgIdSecond : m.msgId)

/** 富文本摘要剥成纯文本（通知里不能出现 HTML 标签） */
export const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '')

/**
 * 点击一条消息去哪：私信→会话，专题类→专题页，日程类→日历，关注→主页，其余→帖子详情。
 * 都带 userInformationId 顺便标已读。
 *
 * 路径必须和 App.jsx 里的路由**逐字对得上**。这里曾经写成 /myMessages，
 * 而真实路由是 /me，点开只会落到 404——推送场景下没人会去看地址栏，光看现象
 * 只知道"点了没反应"。
 */
export const linkOf = (m) =>
  m.msgType === 'test'
    ? '/me'
    : m.msgType === 'pm'
      // 私信不走 user_information 表，msgId 里放的是**发信人 id**，深链直接开那个会话
      ? `/messages?peerId=${m.msgId}`
      : m.msgType === 'follow'
      ? `/users/${m.msgId}` // follow 的 msgId=关注者 id → 跳其主页（已读由消息页统一处理）
      : TOPIC_TYPES.includes(m.msgType)
        ? `/news/topic/${m.msgId}?userInformationId=${m.userInformationId}`
        : SCHEDULE_TYPES.includes(m.msgType)
          ? `/schedule?date=${m.msgType === 'scheduleAssign' ? (m.msgIdSecond || '') : m.msgId}&userInformationId=${m.userInformationId}`
          : GAME_TYPES.includes(m.msgType)
            ? `/games/${m.msgId}?userInformationId=${m.userInformationId}`
          : LOL_TYPES.includes(m.msgType)
            ? `/news/topic/${LOL_TOPIC_ID}/lol/feed?match=${m.msgId}&userInformationId=${m.userInformationId}`
            : `/news/${newsIdOf(m)}?userInformationId=${m.userInformationId}`

/**
 * 动作短语。库里 commentNews/commentComment 的 contentMsg 存的是评论原文而不是短语，
 * 直接显示会变成「xxx "评论内容"」，很怪；这里统一按 msgType 映射，老消息也能正确显示。
 *
 * 帖子类：动作对象就是帖子 → 「xxx 点赞了您的帖子《标题》」；
 * 评论类：动作对象是评论、标题只是位置 → 「xxx 点赞了您在《标题》下的评论」（标题缺失=原帖已删，退回短句）。
 *
 * 推送场景下 newsTitle 是拿不到的（载荷里没有），所以每一支都要能在没有标题时说得通。
 */
export const actionTextOf = (m) => {
  const t = m.newsTitle ? `"${m.newsTitle}"` : ''
  switch (m.msgType) {
    case 'goodNews': return `liked your post ${t}`
    case 'badNews': return `disliked your post ${t}`
    case 'commentNews': return `commented on your post ${t}`
    case 'goodComment': return t ? `liked your comment on ${t}` : 'liked your comment'
    case 'badComment': return t ? `disliked your comment on ${t}` : 'disliked your comment'
    case 'commentComment': return t ? `replied to your comment on ${t}` : 'replied to your comment'
    case 'mentionComment': return t ? `mentioned you in a comment on ${t}` : 'mentioned you in a comment'
    case 'mentionNews': return t ? `mentioned you in the post ${t}` : 'mentioned you in a post'
    case 'mentionChat': return `mentioned you in the group chat of ${m.content ? `"${m.content}"` : 'the topic'}`
    case 'mentionGame': return 'mentioned you in a post-game comment'
    case 'mentionLol': return 'mentioned you in a LoL match comment'
    case 'replyGame': return 'replied to your post-game comment'
    case 'replyLol': return 'replied to your LoL match comment'
    case 'follow': return 'followed you'
    case 'topicApply': return `asked to join your topic ${m.content ? `"${m.content}"` : ''}`
    case 'topicApproved': return `approved your request to join ${m.content ? `"${m.content}"` : 'the topic'}`
    case 'topicRejected': return `declined your request to join ${m.content ? `"${m.content}"` : 'the topic'}`
    case 'scheduleAssign': return 'assigned you a schedule item'
    case 'scheduleRemind': return '' // operatorName 就是 Schedule reminder，短语留空避免说两遍
    case 'scheduleOverdue': return ''
    case 'scheduleExpiry': return ''
    case 'pm': return 'sent you a message'
    case 'test': return 'push is working'
    default: return m.contentMsg || ''
  }
}

/** 第二行明细：评论类展示评论/回复原文（存在 contentMsg 里），点赞类展示原帖/原评论摘要（存在 content 里） */
export const detailOf = (m) => {
  const s = (v) => stripHtml(v) || '(no content)'
  switch (m.msgType) {
    case 'commentNews': return `Comment: ${s(m.contentMsg)}`
    case 'commentComment': return `Reply: ${s(m.contentMsg)} | Your comment: ${s(m.content)}`
    case 'goodComment':
    case 'badComment': return `Your comment: ${s(m.content)}`
    case 'mentionComment': return `Comment: ${s(m.content)}`
    case 'mentionNews': return `Post: ${s(m.content)}`
    // 群聊没有「原帖」这回事：content 存的是专题名（已进标题），明细给那条群聊原文
    case 'mentionChat': return `Chat message: ${s(m.contentMsg)}`
    // 比赛信息点进去就看到了，消息里要展示的是那句话本身（content 存的就是它）
    case 'mentionGame': return `Comment: ${s(m.content)}`
    case 'mentionLol': return `Comment: ${s(m.content)}`
    // 回复类展示的是**对方那句回复**（content 存的就是它），点进去才看得到上下文
    case 'replyGame':
    case 'replyLol': return `Reply: ${s(m.content)}`
    case 'follow': return 'Tap to visit their profile'
    case 'topicApply': return 'Tap to open the topic and review it under Members'
    case 'topicApproved': return 'Tap to open the topic'
    case 'topicRejected': return `Topic: ${s(m.content)}`
    case 'scheduleAssign': return `Schedule: ${s(m.content)} | Tap to open that day`
    case 'scheduleRemind': return s(m.content)
    case 'scheduleOverdue': return `⚠️ ${s(m.content)}`
    case 'scheduleExpiry': return `⏳ ${s(m.content)}`
    case 'pm': return s(m.contentMsg)
    case 'test': return 'If you got this, the whole chain works'
    default: return `Post: ${s(m.content)}` // goodNews / badNews
  }
}

/**
 * 一条消息渲染成系统通知的标题和正文。只有 service worker 用。
 *
 * 标题放「谁 + 做了什么」，正文放细节——手机的通知栏折叠时通常只显示标题那一行，
 * 所以最要紧的信息必须在标题里。
 */
export const toNotification = (m) => ({
  title: `${m.operatorName || 'Someone'} ${actionTextOf(m)}`.trim(),
  body: stripHtml(detailOf(m)).slice(0, 120),
  url: linkOf(m),
})
