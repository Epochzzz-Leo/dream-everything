package com.dream.basketball.utils;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 热度公式：原始分、SQL 版本、时间衰减、不随时间变的排序键。
 * 数字和 vault《79-推荐首页规划》第五章的例子一致。
 */
class HotScoreTest {

    private static final long DAY = 86_400_000L;
    /** 固定的「现在」：2026-10-06 00:00 UTC */
    private static final long NOW = 1_791_244_800_000L;

    @Test
    void raw_isLikesTimesTwoPlusCommentsTimesThree() {
        assertEquals(36, HotScore.raw(3, 10), "例子里的 A：3×2 + 10×3");
        assertEquals(10, HotScore.raw(2, 2), "例子里的 B：2×2 + 2×3");
        assertEquals(3, HotScore.raw(0, 1), "技术帖：0 赞 1 评");
        assertEquals(0, HotScore.raw(null, null), "空值当 0");
    }

    @Test
    void sqlRaw_usesTheSameWeights() {
        assertEquals("(ifnull(GOOD_NUM,0)*2 + ifnull(COMMENT_NUM,0)*3)", HotScore.sqlRaw("GOOD_NUM", "COMMENT_NUM"));
    }

    @Test
    void decayed_halvesEverySevenDays() {
        assertEquals(1.0, HotScore.decayed(0, NOW, NOW), 1e-9, "今天的新帖只有起步分 1");
        assertEquals(11 * Math.pow(0.5, 1 / 7.0), HotScore.decayed(10, NOW - DAY, NOW), 1e-9, "B：11 × 0.5^(1/7)");
        assertEquals(9.963, HotScore.decayed(10, NOW - DAY, NOW), 0.001);
        assertEquals(5.5, HotScore.decayed(10, NOW - 7 * DAY, NOW), 1e-9, "整 7 天正好减半");
        assertEquals(11.0, HotScore.decayed(10, NOW + DAY, NOW), 1e-9, "发帖时间在未来按 0 天算");
    }

    /** 去掉 +1 的话，今天的零互动新帖是 0，会排在两年前那篇后面 */
    @Test
    void startingPoint_keepsTodaysQuietPostAboveAnAncientHotOne() {
        double ancient = HotScore.decayed(36, NOW - 730 * DAY, NOW);
        double today = HotScore.decayed(0, NOW, NOW);
        assertTrue(ancient > 0 && ancient < 1e-29, "A 衰减到约 1.5×10⁻³⁰，实际 " + ancient);
        assertTrue(today > ancient);
    }

    /** 排序键排出来的先后，和衰减分在任何一个「现在」排出来的都一样 */
    @Test
    void rankKey_ordersExactlyLikeDecayed() {
        int[] raw = {36, 10, 0, 3, 3, 0, 8};
        long[] pub = {NOW - 730 * DAY, NOW - DAY, NOW, NOW - 3 * DAY, NOW - 2 * DAY - 3_600_000L, NOW - 10 * DAY, NOW - 6 * DAY};
        for (long now : new long[]{NOW, NOW + 3 * DAY, NOW + 40 * DAY}) {
            for (int i = 0; i < raw.length; i++) {
                for (int j = 0; j < raw.length; j++) {
                    int byDecayed = Integer.signum(Double.compare(HotScore.decayed(raw[i], pub[i], now), HotScore.decayed(raw[j], pub[j], now)));
                    int byKey = Integer.signum(Double.compare(HotScore.rankKey(raw[i], pub[i]), HotScore.rankKey(raw[j], pub[j])));
                    assertEquals(byDecayed, byKey, "帖子 " + i + " 和 " + j + "，现在 = " + now);
                }
            }
        }
    }

    /** B 比 C 的排序键大 log2(11) − 1/7 ≈ 3.316，和文档里手算的一致 */
    @Test
    void rankKey_gapMatchesTheWorkedExample() {
        double b = HotScore.rankKey(10, NOW - DAY);
        double c = HotScore.rankKey(0, NOW);
        assertEquals(3.316, b - c, 0.001);
    }
}
