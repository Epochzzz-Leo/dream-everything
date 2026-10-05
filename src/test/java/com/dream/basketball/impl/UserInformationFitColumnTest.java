package com.dream.basketball.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * 消息表 CONTENT 列只有 varchar(255)。写不下的内容以前会让整个请求 500，
 * 而那时评论这类主操作往往已经落库了。fitColumn 负责在写库前截断。
 */
class UserInformationFitColumnTest {

    private static String repeat(String s, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append(s);
        }
        return sb.toString();
    }

    @Test
    void shortTextIsReturnedAsIs() {
        String s = "点赞了您的帖子";
        assertSame(s, UserInformationServiceImpl.fitColumn(s, 255));
    }

    @Test
    void exactlyAtLimitIsNotCut() {
        String s = repeat("a", 255);
        assertSame(s, UserInformationServiceImpl.fitColumn(s, 255));
    }

    @Test
    void longTextIsCutToTheLimitWithEllipsis() {
        String out = UserInformationServiceImpl.fitColumn(repeat("字", 300), 255);
        assertEquals(255, out.codePointCount(0, out.length()), "截完正好 255 个字符，含末尾省略号");
        assertEquals('…', out.charAt(out.length() - 1));
    }

    @Test
    void emojiAtTheCutIsNotSplitInHalf() {
        // 每个 😀 是两个 char、一个码点。按 char 截会在第 254 个码点中间劈开，留下半个代理对
        String out = UserInformationServiceImpl.fitColumn(repeat("😀", 300), 255);
        assertEquals(255, out.codePointCount(0, out.length()));
        assertEquals(repeat("😀", 254) + "…", out);
    }

    @Test
    void nullStaysNull() {
        assertNull(UserInformationServiceImpl.fitColumn(null, 255));
    }
}
