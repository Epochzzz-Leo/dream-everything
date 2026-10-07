package com.dream.basketball.service;

import com.dream.basketball.utils.HotScore;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 首页推荐流的排序逻辑。纯计算，不碰数据库，所以每一步都能单测。
 *
 * <p>「为你推荐」分三段，工业推荐系统的骨架都是这样：
 * <ol>
 *   <li><b>召回</b>：从候选池里按四条路各挑一批（最新、热门、站长精选、关注的人），合在一起去重。
 *       作用是「先粗选出有资格的」，池子很大时不用给每一篇都算分。</li>
 *   <li><b>排序</b>：只看一个分数 {@link #score}：带时间衰减的热度（{@link HotScore#decayed}），
 *       访客看到的中文标题 ×0.5，自己点开看过的 ×0.3。</li>
 *   <li><b>重排</b>：为了观感再调一遍顺序，把同一个专题的帖子错开（{@link #diversify}）。</li>
 * </ol>
 * 最后给每一篇定一个推荐理由（{@link #reasonOf}），页面上写在卡片上。
 *
 * <p>「最新」和「关注」两个标签不走这些，就是按时间倒序（{@link #latestAfter}），它们是对照的基线。
 * 设计和例子见 vault《79-推荐首页规划》第五章、《82-推荐首页第3和4步》。
 */
public final class FeedRanker {

    /** 一篇候选帖子：排序只需要这些字段。picked = 专题题主在下面评论过（站长点评）。 */
    public record Post(String newsId, String topicId, String authorId, String title,
                       long publishMillis, int raw, boolean picked, boolean essence) {
    }

    /** 这次是谁在看：访客还是登录用户、关注了谁、点开看过哪些。 */
    public record Viewer(boolean visitor, Set<String> followees, Set<String> opened) {
    }

    /** 排好的一条：帖子 + 推荐理由代码（可能为 null，表示没有特别的理由）。 */
    public record Ranked(Post post, String reason) {
    }

    /** 「最新」「关注」翻页用的位置：上一页最后一篇的发帖时刻和 id。 */
    public record Cursor(long publishMillis, String newsId) {
    }

    /** 召回每一路最多取几篇。池子现在只有一两百篇，四路基本都能取全；池子变大以后它们才起作用。 */
    public static final int LATEST_ROUTE = 200;
    public static final int HOT_ROUTE = 100;
    public static final int PICKED_ROUTE = 100;
    public static final int FOLLOWING_ROUTE = 100;

    /** 重排时看最近几篇 */
    public static final int DIVERSITY_WINDOW = 4;
    /** 最近几篇里同一个专题每已经有一篇，这个专题剩下的帖子分数就乘一次这个数 */
    public static final double DIVERSITY_FACTOR = 0.6;
    /** 访客流里，标题带汉字的帖子分数乘这个数（用户定的「降低分数，不删」） */
    public static final double CHINESE_FACTOR = 0.5;
    /** 自己点开看过的帖子分数乘这个数：往后放，但不删（帖子少，全删了很快就刷空了） */
    public static final double OPENED_FACTOR = 0.3;
    /** 「本周热门」的门槛：7 天内发的，原始热度至少这么多（比如 1 赞 1 评 = 5） */
    public static final int HOT_MIN_RAW = 5;
    /** 「新帖」：3 天内发的 */
    public static final long NEW_WITHIN_MILLIS = 3 * 86_400_000L;
    public static final long HOT_WITHIN_MILLIS = 7 * 86_400_000L;

    /** 新的在前；同一时刻按 id 倒序，保证顺序每次都一样 */
    public static final Comparator<Post> NEWEST_FIRST =
            Comparator.comparingLong(Post::publishMillis).reversed()
                    .thenComparing(Post::newsId, Comparator.reverseOrder());

    private FeedRanker() {
    }

    /** 「为你推荐」：召回 → 排序 → 重排 → 推荐理由，最多返回 cap 篇。 */
    public static List<Ranked> forYou(List<Post> pool, Viewer viewer, long now, int cap) {
        Collection<Post> candidates = recall(pool, viewer, LATEST_ROUTE, HOT_ROUTE, PICKED_ROUTE, FOLLOWING_ROUTE).values();
        Map<String, Double> scores = scores(candidates, viewer, now);
        List<Post> ordered = diversify(sortByScore(candidates, scores), scores, DIVERSITY_WINDOW, DIVERSITY_FACTOR);
        List<Ranked> out = new ArrayList<>();
        for (Post p : ordered) {
            if (out.size() >= cap) {
                break;
            }
            out.add(new Ranked(p, reasonOf(p, viewer, now)));
        }
        return out;
    }

    /**
     * 召回：四条路各挑一批，合起来去重。返回的 Map 的值就是候选集合（顺序不重要，后面要重新排）。
     * 每一路的条数是参数，单测里用小数字验证「每路只取前几篇」。
     */
    static Map<String, Post> recall(List<Post> pool, Viewer viewer, int latestK, int hotK, int pickedK, int followingK) {
        Map<String, Post> out = new LinkedHashMap<>();
        // 1. 最新：按发帖时间
        pool.stream().sorted(NEWEST_FIRST).limit(latestK).forEach(p -> out.putIfAbsent(p.newsId(), p));
        // 2. 热门：有过互动的，按不随时间变的排序键（和衰减分排出来的先后一样）
        pool.stream().filter(p -> p.raw() > 0)
                .sorted(Comparator.comparingDouble((Post p) -> HotScore.rankKey(p.raw(), p.publishMillis())).reversed()
                        .thenComparing(NEWEST_FIRST))
                .limit(hotK).forEach(p -> out.putIfAbsent(p.newsId(), p));
        // 3. 精选：加了精华的，或者专题题主评论过的
        pool.stream().filter(p -> p.picked() || p.essence()).sorted(NEWEST_FIRST).limit(pickedK)
                .forEach(p -> out.putIfAbsent(p.newsId(), p));
        // 4. 关注的人发的（访客没有这一路）
        if (!viewer.visitor() && !viewer.followees().isEmpty()) {
            pool.stream().filter(p -> viewer.followees().contains(p.authorId())).sorted(NEWEST_FIRST).limit(followingK)
                    .forEach(p -> out.putIfAbsent(p.newsId(), p));
        }
        return out;
    }

    /** 一篇帖子在这个人眼里的分数。 */
    static double score(Post p, Viewer viewer, long now) {
        double s = HotScore.decayed(p.raw(), p.publishMillis(), now);
        if (viewer.visitor() && hasChinese(p.title())) {
            s *= CHINESE_FACTOR;
        }
        if (viewer.opened().contains(p.newsId())) {
            s *= OPENED_FACTOR;
        }
        return s;
    }

    static Map<String, Double> scores(Collection<Post> candidates, Viewer viewer, long now) {
        Map<String, Double> scores = new LinkedHashMap<>();
        for (Post p : candidates) {
            scores.put(p.newsId(), score(p, viewer, now));
        }
        return scores;
    }

    /** 排序：分数高的在前；同分时新的在前，再按 id，保证每次结果一样。 */
    static List<Post> rank(Collection<Post> candidates, Viewer viewer, long now) {
        return sortByScore(candidates, scores(candidates, viewer, now));
    }

    static List<Post> sortByScore(Collection<Post> candidates, Map<String, Double> scores) {
        return candidates.stream()
                .sorted(Comparator.comparingDouble((Post p) -> scores.get(p.newsId())).reversed().thenComparing(NEWEST_FIRST))
                .collect(Collectors.toList());
    }

    /**
     * 重排：把同一个专题的帖子错开。
     *
     * <p>做法是一篇一篇往下放。每次在剩下的帖子里挑「打折后的分数」最高的那篇：
     * 最近 window 篇里，和它同专题的每有一篇，它的分数就乘一次 factor。
     * 分数差不多的帖子（比如同一天批量发的技术帖）会自然地轮着来；
     * 分数差很多的不受影响——两个月前没人理的旧帖，打完折也追不上刚发的，不会被硬拉上来插空。
     *
     * <p>2026-10-07 以前（还没上线时）是硬规则「同一个专题最多连着 2 篇」，用真实数据一跑有两个毛病：
     * 开头只有两个专题轮流霸屏（另外三个专题全排在后面），结尾为了不连排，把 7 月的旧帖拉到第 45、48 位插空。
     * 过程记在 vault《82》里。
     *
     * @param ranked 已经按分数从高到低排好的列表
     */
    static List<Post> diversify(List<Post> ranked, Map<String, Double> scores, int window, double factor) {
        List<Post> rest = new ArrayList<>(ranked);
        List<Post> out = new ArrayList<>(ranked.size());
        while (!rest.isEmpty()) {
            int best = 0;
            double bestScore = -1;
            for (int i = 0; i < rest.size(); i++) {
                double base = scores.get(rest.get(i).newsId());
                if (base <= bestScore) {
                    break;   // rest 按原分数从高到低，打折只会更低，后面不可能再赢了
                }
                double s = base * Math.pow(factor, recentSameTopic(out, rest.get(i).topicId(), window));
                if (s > bestScore) {
                    best = i;
                    bestScore = s;
                }
            }
            out.add(rest.remove(best));
        }
        return out;
    }

    /** out 的最后 window 篇里，有几篇属于 topicId 这个专题 */
    static int recentSameTopic(List<Post> out, String topicId, int window) {
        int n = 0;
        for (int i = out.size() - 1; i >= 0 && i >= out.size() - window; i--) {
            if (Objects.equals(out.get(i).topicId(), topicId)) {
                n++;
            }
        }
        return n;
    }

    /**
     * 推荐理由，按这个顺序取第一个成立的：
     * 关注的人发的 → 精选（精华或题主点评过）→ 本周热门 → 新帖；都不成立就没有理由（null）。
     */
    static String reasonOf(Post p, Viewer viewer, long now) {
        if (!viewer.visitor() && viewer.followees().contains(p.authorId())) {
            return "following";
        }
        if (p.essence() || p.picked()) {
            return "picked";
        }
        long age = now - p.publishMillis();
        if (p.raw() >= HOT_MIN_RAW && age <= HOT_WITHIN_MILLIS) {
            return "hot";
        }
        if (age <= NEW_WITHIN_MILLIS) {
            return "new";
        }
        return null;
    }

    /** 标题里有没有汉字（CJK 统一表意文字，含扩展区；全角标点、日文假名不算）。 */
    static boolean hasChinese(String s) {
        return s != null && s.codePoints().anyMatch(cp -> Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN);
    }

    /**
     * 「最新」「关注」两个标签的一页：按时间倒序，从上一页最后一篇之后接着取（after 为 null 就是第一页）。
     *
     * <p>为什么不用「跳过前 N 篇」：翻页之间有人发了新帖，所有帖子都往后挤一位，
     * 跳过前 N 篇会把上一页最后那篇再取一次。按「比上一页最后那篇更旧」取就不会重复也不会漏。
     */
    public static List<Post> latestAfter(List<Post> pool, Cursor after, int limit) {
        return pool.stream().sorted(NEWEST_FIRST)
                .filter(p -> after == null || p.publishMillis() < after.publishMillis()
                        || (p.publishMillis() == after.publishMillis() && p.newsId().compareTo(after.newsId()) < 0))
                .limit(limit)
                .collect(Collectors.toList());
    }
}
