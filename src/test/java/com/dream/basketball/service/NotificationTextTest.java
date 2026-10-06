package com.dream.basketball.service;

import com.dream.basketball.entity.UserInformation;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * App 推送（FCM）的标题正文由服务端拼。期望值和 notification.js 里网页用的措辞逐字一致，
 * 两边改了一边忘了另一边，这里先报出来。
 */
class NotificationTextTest {

    private static final Pattern CJK = Pattern.compile("[\\u3000-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uff00-\\uffef]");

    private static UserInformation msg(String type, String operator, String content, String contentMsg) {
        UserInformation m = new UserInformation();
        m.setMsgType(type);
        m.setOperatorName(operator);
        m.setContent(content);
        m.setContentMsg(contentMsg);
        m.setMsgId("ID1");
        m.setMsgIdSecond("ID2");
        m.setUserInformationId("INFO");
        return m;
    }

    @Test
    void wordingMatchesTheWebList() {
        assertEquals("Bob liked your post", NotificationText.titleOf(msg("goodNews", "Bob", "Hello", null)));
        assertEquals("Post: Hello", NotificationText.bodyOf(msg("goodNews", "Bob", "Hello", null)));
        assertEquals("Bob commented on your post", NotificationText.titleOf(msg("commentNews", "Bob", "Hello", "nice")));
        assertEquals("Comment: nice", NotificationText.bodyOf(msg("commentNews", "Bob", "Hello", "nice")));
        assertEquals("Reply: re | Your comment: mine", NotificationText.bodyOf(msg("commentComment", "Bob", "mine", "re")));
        assertEquals("Bob mentioned you in the group chat of \"NBA\"", NotificationText.titleOf(msg("mentionChat", "Bob", "NBA", "hi")));
        assertEquals("Bob mentioned you in the group chat of the topic", NotificationText.titleOf(msg("mentionChat", "Bob", "", "hi")));
        assertEquals("Chat message: hi", NotificationText.bodyOf(msg("mentionChat", "Bob", "NBA", "hi")));
        assertEquals("Bob asked to join your topic \"NBA\"", NotificationText.titleOf(msg("topicApply", "Bob", "NBA", null)));
        assertEquals("Bob asked to join your topic", NotificationText.titleOf(msg("topicApply", "Bob", "", null)));
        assertEquals("Bob approved your request to join \"NBA\"", NotificationText.titleOf(msg("topicApproved", "Bob", "NBA", null)));
        assertEquals("Bob declined your request to join the topic", NotificationText.titleOf(msg("topicRejected", "Bob", "", null)));
        assertEquals("Schedule: Standup | Tap to open that day", NotificationText.bodyOf(msg("scheduleAssign", "Bob", "Standup", null)));
        assertEquals("Someone followed you", NotificationText.titleOf(msg("follow", "", null, null)));
        assertEquals("(no content)", NotificationText.bodyOf(msg("pm", "Bob", null, "")));
        assertEquals("Test push is working", NotificationText.titleOf(msg("test", "Test", null, null)));
        assertEquals("If you got this, the whole chain works", NotificationText.bodyOf(msg("test", "Test", null, null)));
    }

    @Test
    void scheduleRemindersShowTheJobTextAsIs() {
        // operatorName 就是 "Schedule reminder"，动作短语留空，标题不会说两遍
        UserInformation remind = msg("scheduleRemind", "Schedule reminder", "You have 1 thing to do today: \"Standup\"", null);
        assertEquals("Schedule reminder", NotificationText.titleOf(remind));
        assertEquals("You have 1 thing to do today: \"Standup\"", NotificationText.bodyOf(remind));
        assertEquals("⚠️ \"Report\" is overdue (due 2026-10-06)",
                NotificationText.bodyOf(msg("scheduleOverdue", "Schedule reminder", "\"Report\" is overdue (due 2026-10-06)", null)));
    }

    @Test
    void noTypeProducesChinese() {
        List<String> types = Arrays.asList("goodNews", "badNews", "commentNews", "goodComment", "badComment",
                "commentComment", "mentionComment", "mentionNews", "mentionChat", "mentionGame", "mentionLol",
                "replyGame", "replyLol", "follow", "topicApply", "topicApproved", "topicRejected", "scheduleAssign",
                "pm", "test");
        for (String type : types) {
            UserInformation m = msg(type, "Bob", "Hello", "nice");
            String title = NotificationText.titleOf(m);
            String body = NotificationText.bodyOf(m);
            assertFalse(CJK.matcher(title).find(), type + " 的标题里有中文：" + title);
            assertFalse(CJK.matcher(body).find(), type + " 的正文里有中文：" + body);
        }
    }

    @Test
    void gameAndLolTypesNoLongerFallThrough() {
        // 以前这四类在这里走 default：标题接的是 contentMsg，点开跳 /news/ID1（不存在的帖子）
        assertEquals("Bob mentioned you in a post-game comment", NotificationText.titleOf(msg("mentionGame", "Bob", "Nice shot", null)));
        assertEquals("Comment: Nice shot", NotificationText.bodyOf(msg("mentionGame", "Bob", "Nice shot", null)));
        assertEquals("Bob replied to your LoL match comment", NotificationText.titleOf(msg("replyLol", "Bob", "gg", null)));
        assertEquals("Reply: gg", NotificationText.bodyOf(msg("replyLol", "Bob", "gg", null)));
        assertEquals("/games/ID1?userInformationId=INFO", NotificationText.linkOf(msg("replyGame", "Bob", "x", null)));
        assertEquals("/news/topic/b5d95238-a0db-44ed-9f12-3d112d681345/lol/feed?match=ID1&userInformationId=INFO",
                NotificationText.linkOf(msg("mentionLol", "Bob", "x", null)));
    }
}
