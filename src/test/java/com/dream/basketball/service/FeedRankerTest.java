package com.dream.basketball.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 推荐流的排序逻辑：召回、打分、同专题不连排、推荐理由、按时间翻页。
 * 用到的数字都能手算，和 vault《79》《82》里的例子一致。
 */
class FeedRankerTest {

    private static final long DAY = 86_400_000L;
    /** 固定的「现在」：2026-10-07 00:00 UTC */
    private static final long NOW = 1_791_331_200_000L;

    private static final FeedRanker.Viewer VISITOR = new FeedRanker.Viewer(true, Set.of(), Set.of());
    private static final FeedRanker.Viewer MEMBER = new FeedRanker.Viewer(false, Set.of(), Set.of());

    private static FeedRanker.Post post(String id, String topic, double daysAgo, int raw) {
        return new FeedRanker.Post(id, topic, "author-" + id, "Title " + id, NOW - (long) (daysAgo * DAY), raw, false, false);
    }

    private static List<String> ids(List<FeedRanker.Post> posts) {
        return posts.stream().map(FeedRanker.Post::newsId).collect(Collectors.toList());
    }

    @Test
    void hasChinese_onlyCountsHanCharacters() {
        assertTrue(FeedRanker.hasChinese("76人！"));
        assertTrue(FeedRanker.hasChinese("老鹰：里萨谢成了近几年最大的选秀失误"));
        assertFalse(FeedRanker.hasChinese("ky, zhyz"));
        assertFalse(FeedRanker.hasChinese("Ｖａｒｙ！"), "全角字母和标点不算");
        assertFalse(FeedRanker.hasChinese("こんにちは"), "日文假名不算");
        assertFalse(FeedRanker.hasChinese(null));
    }

    /** 文档 79 第五章的例子：T 是昨天的英文帖 0 赞 1 评，E 是今天的中文帖 2 赞 0 评 */
    @Test
    void chineseTitlesAreHalvedForVisitorsOnly() {
        FeedRanker.Post t = new FeedRanker.Post("T", "tech", "a1", "Improving site performance", NOW - DAY, 3, false, false);
        FeedRanker.Post e = new FeedRanker.Post("E", "nba", "a2", "76人！", NOW, 4, false, false);
        assertEquals(3.623, FeedRanker.score(t, VISITOR, NOW), 0.001, "(3+1) × 0.5^(1/7) = 4 × 0.9057 = 3.6229");
        assertEquals(2.5, FeedRanker.score(e, VISITOR, NOW), 1e-9, "(4+1) × 1 × 0.5");
        assertEquals(5.0, FeedRanker.score(e, MEMBER, NOW), 1e-9, "登录用户不降权");
        assertEquals(List.of("T", "E"), ids(FeedRanker.rank(List.of(e, t), VISITOR, NOW)));
        assertEquals(List.of("E", "T"), ids(FeedRanker.rank(List.of(e, t), MEMBER, NOW)));
    }

    @Test
    void openedPostsMoveDownButStay() {
        FeedRanker.Post a = post("A", "x", 0, 0);
        FeedRanker.Post b = post("B", "x", 1, 0);
        FeedRanker.Viewer readA = new FeedRanker.Viewer(false, Set.of(), Set.of("A"));
        assertEquals(0.3, FeedRanker.score(a, readA, NOW), 1e-9, "1 × 1 × 0.3");
        assertEquals(List.of("B", "A"), ids(FeedRanker.rank(List.of(a, b), readA, NOW)), "B = 0.906 > A = 0.3");
    }

    private static Map<String, Double> scoresOf(List<FeedRanker.Post> posts, double... values) {
        Map<String, Double> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < posts.size(); i++) {
            m.put(posts.get(i).newsId(), values[i]);
        }
        return m;
    }

    /** 分数差不多的三个专题：轮着来 x y z x y z（数字见 vault 82 的手算表） */
    @Test
    void diversify_interleavesTopicsWithNearlyEqualScores() {
        List<FeedRanker.Post> ranked = List.of(post("x1", "x", 0, 0), post("x2", "x", 0, 0), post("y1", "y", 0, 0),
                post("y2", "y", 0, 0), post("z1", "z", 0, 0), post("z2", "z", 0, 0));
        Map<String, Double> s = scoresOf(ranked, 9.00, 8.99, 8.98, 8.97, 8.96, 8.95);
        assertEquals(List.of("x1", "y1", "z1", "x2", "y2", "z2"), ids(FeedRanker.diversify(ranked, s, 4, 0.6)));
    }

    /** 只剩一个专题的新帖和一篇几乎零分的旧帖：旧帖不会被拉上来插空 */
    @Test
    void diversify_doesNotPullAStalePostUpToBreakARun() {
        List<FeedRanker.Post> ranked = List.of(post("w1", "web", 0, 0), post("w2", "web", 0, 0), post("w3", "web", 0, 0),
                post("old", "nba", 0, 0));
        Map<String, Double> s = scoresOf(ranked, 3.40, 3.39, 3.38, 0.0003);
        assertEquals(List.of("w1", "w2", "w3", "old"), ids(FeedRanker.diversify(ranked, s, 4, 0.6)),
                "w3 打两次折 3.38 × 0.36 = 1.22，还是远大于 0.0003");
    }

    /** 同专题的第二篇明显更热：照样排第二，不为了错开而让位 */
    @Test
    void diversify_keepsAClearlyHotterPostOfTheSameTopic() {
        List<FeedRanker.Post> ranked = List.of(post("x1", "x", 0, 0), post("x2", "x", 0, 0), post("y1", "y", 0, 0));
        Map<String, Double> s = scoresOf(ranked, 10.0, 9.0, 1.0);
        assertEquals(List.of("x1", "x2", "y1"), ids(FeedRanker.diversify(ranked, s, 4, 0.6)), "9 × 0.6 = 5.4 > 1");
    }

    @Test
    void diversify_neverLosesOrDuplicatesPosts() {
        List<FeedRanker.Post> ranked = new ArrayList<>();
        String[] topics = {"x", "x", "x", "x", "y", "x", "x", "z", "z", "z", "z", "y"};
        double[] values = new double[topics.length];
        for (int i = 0; i < topics.length; i++) {
            ranked.add(post(String.valueOf(i), topics[i], 0, 0));
            values[i] = 100 - i;
        }
        List<FeedRanker.Post> out = FeedRanker.diversify(ranked, scoresOf(ranked, values), 4, 0.6);
        assertEquals(ranked.size(), out.size());
        assertEquals(Set.copyOf(ids(ranked)), Set.copyOf(ids(out)));
    }

    @Test
    void recall_eachRouteTakesOnlyItsTopK() {
        List<FeedRanker.Post> pool = List.of(
                post("new1", "a", 0, 0), post("new2", "a", 1, 0), post("old", "a", 30, 0),
                post("hotOld", "a", 40, 50),
                new FeedRanker.Post("picked", "a", "x", "t", NOW - 60 * DAY, 0, true, false),
                new FeedRanker.Post("friend", "a", "pal", "t", NOW - 90 * DAY, 0, false, false));
        FeedRanker.Viewer withFriend = new FeedRanker.Viewer(false, Set.of("pal"), Set.of());
        Map<String, FeedRanker.Post> r = FeedRanker.recall(pool, withFriend, 2, 1, 1, 1);
        assertEquals(Set.of("new1", "new2", "hotOld", "picked", "friend"), r.keySet(), "最新取 2、热门 1、精选 1、关注 1；old 哪一路都没进");
        Map<String, FeedRanker.Post> visitor = FeedRanker.recall(pool, VISITOR, 2, 1, 1, 1);
        assertFalse(visitor.containsKey("friend"), "访客没有关注这一路");
    }

    @Test
    void reasons_followTheirPriority() {
        FeedRanker.Viewer v = new FeedRanker.Viewer(false, Set.of("pal"), Set.of());
        FeedRanker.Post byFriendAndPicked = new FeedRanker.Post("1", "a", "pal", "t", NOW, 0, true, false);
        FeedRanker.Post picked = new FeedRanker.Post("2", "a", "x", "t", NOW - 30 * DAY, 0, true, false);
        FeedRanker.Post hot = new FeedRanker.Post("3", "a", "x", "t", NOW - 6 * DAY, 5, false, false);
        FeedRanker.Post fresh = new FeedRanker.Post("4", "a", "x", "t", NOW - 2 * DAY, 4, false, false);
        FeedRanker.Post plain = new FeedRanker.Post("5", "a", "x", "t", NOW - 10 * DAY, 4, false, false);
        assertEquals("following", FeedRanker.reasonOf(byFriendAndPicked, v, NOW));
        assertEquals("picked", FeedRanker.reasonOf(byFriendAndPicked, VISITOR, NOW), "访客没有「关注」理由，退到精选");
        assertEquals("picked", FeedRanker.reasonOf(picked, v, NOW));
        assertEquals("hot", FeedRanker.reasonOf(hot, v, NOW), "6 天内、原始热度 5");
        assertEquals("new", FeedRanker.reasonOf(fresh, v, NOW), "热度 4 不够热，但 2 天内算新");
        assertNull(FeedRanker.reasonOf(plain, v, NOW));
    }

    /** 文档 79 第四章的例子：翻页之间来了一篇新帖，按游标取第二页不重复也不漏 */
    @Test
    void latestAfter_cursorSurvivesANewPostBetweenPages() {
        List<FeedRanker.Post> pool = new ArrayList<>();
        for (int i = 1; i <= 9; i++) {
            pool.add(post("P" + i, "a", 10 - i, 0));   // P9 最新，P1 最旧
        }
        List<FeedRanker.Post> page1 = FeedRanker.latestAfter(pool, null, 3);
        assertEquals(List.of("P9", "P8", "P7"), ids(page1));
        pool.add(post("P10", "a", 0, 0));               // 有人发了新帖
        FeedRanker.Post last = page1.get(2);
        List<FeedRanker.Post> page2 = FeedRanker.latestAfter(pool, new FeedRanker.Cursor(last.publishMillis(), last.newsId()), 3);
        assertEquals(List.of("P6", "P5", "P4"), ids(page2), "不会再出现 P7");
    }

    @Test
    void latestAfter_sameSecondPostsAreOrderedById() {
        List<FeedRanker.Post> pool = List.of(post("b", "a", 1, 0), post("c", "a", 1, 0), post("a", "a", 1, 0));
        List<FeedRanker.Post> page1 = FeedRanker.latestAfter(pool, null, 2);
        assertEquals(List.of("c", "b"), ids(page1));
        FeedRanker.Post last = page1.get(1);
        assertEquals(List.of("a"), ids(FeedRanker.latestAfter(pool, new FeedRanker.Cursor(last.publishMillis(), last.newsId()), 2)));
    }

    /** 一个访客的完整例子：技术帖在前、两个专题错开，中文 NBA 旧帖排最后 */
    @Test
    void forYou_endToEndForAVisitor() {
        List<FeedRanker.Post> pool = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            pool.add(new FeedRanker.Post("ai" + i, "ai", "digest", "AI post " + i, NOW - DAY - i * 1000L, 3, true, false));
        }
        pool.add(new FeedRanker.Post("web0", "web", "digest", "Web post", NOW - DAY - 5000L, 3, true, false));
        pool.add(new FeedRanker.Post("nba0", "nba", "dreamer", "老鹰：里萨谢成了近几年最大的选秀失误", NOW - 76 * DAY, 0, false, false));
        List<FeedRanker.Ranked> out = FeedRanker.forYou(pool, VISITOR, NOW, 10);
        assertEquals(List.of("ai0", "web0", "ai1", "ai2", "nba0"), out.stream().map(r -> r.post().newsId()).collect(Collectors.toList()),
                "web0 比 ai1 旧 4 秒，但 ai1 要打一次折（3.62 × 0.6 = 2.17），所以 web0 先上");
        assertEquals("picked", out.get(0).reason());
        assertNull(out.get(4).reason(), "76 天前、没互动、没人点评：没有理由");
    }
}
