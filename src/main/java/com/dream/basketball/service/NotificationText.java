package com.dream.basketball.service;

import com.dream.basketball.entity.UserInformation;
import org.apache.commons.lang3.StringUtils;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 一条站内消息「怎么念、点了去哪」——<b>服务端这一份</b>。
 *
 * <h2>⚠️ 这是第二份，另一份在 {@code frontend/src/utils/notification.js}</h2>
 *
 * 加一种消息类型、改一句措辞时<b>两边都要改</b>。改了一边忘了另一边，症状是：
 * 网页通知念得对、安卓 App 的通知落到 default 分支说一句没头没脑的话（或者反过来）。
 * 2026-10-06 就查出过一次：赛后短评、开黑对局的四种类型只加进了 JS 那份，
 * 这里一直走 default，点开还跳到了不存在的帖子页。
 *
 * <h2>为什么不得不有第二份</h2>
 *
 * Web Push 那条路刻意<b>只发原始字段</b>，文案由 service worker 现算，
 * 所以规则只有 JS 那一份（见 {@link WebPushSender#payloadOf}）。
 *
 * FCM 做不到这样。它有两种消息：
 *
 * <table border="1">
 *   <tr><th></th><th>data-only</th><th>带 notification 块</th></tr>
 *   <tr><td>App 在前台</td><td>能收到，可以自己渲染</td><td>能收到</td></tr>
 *   <tr><td><b>App 被切后台 / 已退出</b></td><td><b>什么都不弹</b></td><td>系统自动弹</td></tr>
 * </table>
 *
 * 而推送的全部意义就是"App 没开着的时候也能叫到你"，所以只能发带 notification 块的，
 * 而那个块里的标题正文<b>必须服务端就写好</b>。
 *
 * <p>取舍是清楚的：多一份要同步维护的规则，换 App 关着时通知能弹出来。
 * 代价的严重程度也清楚：万一漏同步，后果是某类通知的措辞变旧，不是功能坏掉。
 *
 * <p>2026-10-06 起网站只有英文，这里的措辞和 notification.js 逐字一致。
 */
public final class NotificationText {

    /** 点赞/点踩帖子类 msgId=帖子 id；评论类（含评论里@）msgId=评论 id、msgIdSecond=帖子 id */
    private static final Set<String> COMMENT_TYPES = new HashSet<>(Arrays.asList(
            "goodComment", "badComment", "commentComment", "mentionComment"));
    /** 专题类 msgId=专题 id，点进去跳专题页 */
    private static final Set<String> TOPIC_TYPES = new HashSet<>(Arrays.asList(
            "topicApply", "topicApproved", "topicRejected", "mentionChat"));
    /** 日程类：remind 的 msgId=日期；assign 的 msgId=事件 id、msgIdSecond=日期 */
    private static final Set<String> SCHEDULE_TYPES = new HashSet<>(Arrays.asList(
            "scheduleAssign", "scheduleRemind", "scheduleOverdue", "scheduleExpiry"));
    /** 每日赛场的短评/回复：msgId=比赛 id，点进去跳那场比赛 */
    private static final Set<String> GAME_TYPES = new HashSet<>(Arrays.asList("mentionGame", "replyGame"));
    /** 开黑对局的短评/回复：msgId=Riot 的 matchId，对局详情是战绩流里的浮层，带 ?match= 进去展开 */
    private static final Set<String> LOL_TYPES = new HashSet<>(Arrays.asList("mentionLol", "replyLol"));
    /** 挂开黑战绩模块的专题。<b>必须和 frontend/src/config/modules.js 的 LOL_TOPIC_ID 一致</b> */
    private static final String LOL_TOPIC_ID = "b5d95238-a0db-44ed-9f12-3d112d681345";

    private NotificationText() {
    }

    /** 富文本摘要剥成纯文本——通知栏里不能出现 HTML 标签 */
    public static String stripHtml(String s) {
        return s == null ? "" : s.replaceAll("<[^>]+>", "");
    }

    /**
     * 点开去哪。<b>路径必须和 App.jsx 的路由逐字对得上</b>——
     * JS 那边曾经写成 {@code /myMessages} 而真实路由是 {@code /me}，
     * 点开只会落到 404，而推送场景下没人会去看地址栏，光看现象只知道"点了没反应"。
     */
    public static String linkOf(UserInformation m) {
        String type = StringUtils.trimToEmpty(m.getMsgType());
        String infoId = m.getUserInformationId();
        if ("test".equals(type)) {
            return "/me";
        }
        if ("pm".equals(type)) {
            // 私信不走 user_information 表，msgId 里放的是**发信人 id**
            return "/messages?peerId=" + m.getMsgId();
        }
        if ("follow".equals(type)) {
            return "/users/" + m.getMsgId();
        }
        if (TOPIC_TYPES.contains(type)) {
            return "/news/topic/" + m.getMsgId() + "?userInformationId=" + infoId;
        }
        if (SCHEDULE_TYPES.contains(type)) {
            String date = "scheduleAssign".equals(type)
                    ? StringUtils.trimToEmpty(m.getMsgIdSecond()) : m.getMsgId();
            return "/schedule?date=" + date + "&userInformationId=" + infoId;
        }
        if (GAME_TYPES.contains(type)) {
            return "/games/" + m.getMsgId() + "?userInformationId=" + infoId;
        }
        if (LOL_TYPES.contains(type)) {
            return "/news/topic/" + LOL_TOPIC_ID + "/lol/feed?match=" + m.getMsgId() + "&userInformationId=" + infoId;
        }
        String newsId = COMMENT_TYPES.contains(type) ? m.getMsgIdSecond() : m.getMsgId();
        return "/news/" + newsId + "?userInformationId=" + infoId;
    }

    /**
     * 动作短语。
     *
     * <p>推送场景下拿不到帖子标题（载荷里没有），所以每一支都必须在<b>没有标题</b>时也说得通——
     * 这一点和 JS 那份是一样的，那边的 {@code t} 恒为空串。
     */
    public static String actionTextOf(UserInformation m) {
        String type = StringUtils.trimToEmpty(m.getMsgType());
        String content = StringUtils.trimToEmpty(m.getContent());
        String quoted = content.isEmpty() ? "" : "\"" + stripHtml(content) + "\"";
        String topic = quoted.isEmpty() ? "the topic" : quoted;
        switch (type) {
            case "goodNews":       return "liked your post";
            case "badNews":        return "disliked your post";
            case "commentNews":    return "commented on your post";
            case "goodComment":    return "liked your comment";
            case "badComment":     return "disliked your comment";
            case "commentComment": return "replied to your comment";
            case "mentionComment": return "mentioned you in a comment";
            case "mentionNews":    return "mentioned you in a post";
            case "mentionChat":    return "mentioned you in the group chat of " + topic;
            case "mentionGame":    return "mentioned you in a post-game comment";
            case "mentionLol":     return "mentioned you in a LoL match comment";
            case "replyGame":      return "replied to your post-game comment";
            case "replyLol":       return "replied to your LoL match comment";
            case "follow":         return "followed you";
            case "topicApply":     return ("asked to join your topic " + quoted).trim();
            case "topicApproved":  return "approved your request to join " + topic;
            case "topicRejected":  return "declined your request to join " + topic;
            case "scheduleAssign": return "assigned you a schedule item";
            // 这三类的 operatorName 就是「Schedule reminder」，短语留空避免说两遍
            case "scheduleRemind":
            case "scheduleOverdue":
            case "scheduleExpiry":  return "";
            case "pm":             return "sent you a message";
            case "test":           return "push is working";
            default:               return StringUtils.trimToEmpty(m.getContentMsg());
        }
    }

    /** 第二行明细：评论类给原文，点赞类给原帖摘要 */
    public static String detailOf(UserInformation m) {
        String type = StringUtils.trimToEmpty(m.getMsgType());
        String content = orPlaceholder(m.getContent());
        String contentMsg = orPlaceholder(m.getContentMsg());
        switch (type) {
            case "commentNews":    return "Comment: " + contentMsg;
            case "commentComment": return "Reply: " + contentMsg + " | Your comment: " + content;
            case "goodComment":
            case "badComment":     return "Your comment: " + content;
            case "mentionComment": return "Comment: " + content;
            case "mentionNews":    return "Post: " + content;
            case "mentionChat":    return "Chat message: " + contentMsg;
            case "mentionGame":
            case "mentionLol":     return "Comment: " + content;
            case "replyGame":
            case "replyLol":       return "Reply: " + content;
            case "follow":         return "Tap to visit their profile";
            case "topicApply":     return "Tap to open the topic and review it under Members";
            case "topicApproved":  return "Tap to open the topic";
            case "topicRejected":  return "Topic: " + content;
            case "scheduleAssign": return "Schedule: " + content + " | Tap to open that day";
            case "scheduleRemind": return content;
            case "scheduleOverdue": return "⚠️ " + content;
            case "scheduleExpiry":  return "⏳ " + content;
            case "pm":             return contentMsg;
            case "test":           return "If you got this, the whole chain works";
            default:               return "Post: " + content;   // goodNews / badNews
        }
    }

    /**
     * 标题放「谁 + 做了什么」，正文放细节——手机通知栏折叠时通常只显示标题那一行，
     * 所以最要紧的信息必须在标题里。
     */
    public static String titleOf(UserInformation m) {
        String who = StringUtils.isBlank(m.getOperatorName()) ? "Someone" : m.getOperatorName();
        return (who + " " + actionTextOf(m)).trim();
    }

    public static String bodyOf(UserInformation m) {
        String s = stripHtml(detailOf(m));
        return s.length() > 120 ? s.substring(0, 120) : s;
    }

    private static String orPlaceholder(String v) {
        String s = stripHtml(v).trim();
        return s.isEmpty() ? "(no content)" : s;
    }
}
