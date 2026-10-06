package com.dream.basketball.utils;

/**
 * 帖子热度，全站只在这里算一份。
 *
 * <p>2026-10-06 收口：以前「点赞×2 + 评论×3」写在四个地方——搜索热榜的 SQL、前端联盟概览的热帖、
 * 帖子详情右栏的「更多帖子」、专题页的 Hot 排序。要给热度加时间衰减，就得改四处、两种语言，
 * 漏一处就各算各的。现在后端在帖子列表里直接给出 {@code hotScore}，前端只读这个字段；
 * SQL 里要排序的地方用 {@link #sqlRaw}，权重同样来自这里。
 *
 * <p>三个口径：
 * <ul>
 *   <li>{@link #raw}：不看时间的原始热度，现有的 Hot 排序和热榜用它，行为和以前完全一样；</li>
 *   <li>{@link #decayed}：每过 {@value #HALF_LIFE_DAYS} 天减半，推荐首页用；</li>
 *   <li>{@link #rankKey}：和 decayed 排出来的先后完全一致，但不随时间变，适合存进 Redis 有序集合。</li>
 * </ul>
 * 设计和例子见 vault《79-推荐首页规划》第五章。
 */
public final class HotScore {

    public static final int LIKE_WEIGHT = 2;
    public static final int COMMENT_WEIGHT = 3;
    public static final double HALF_LIFE_DAYS = 7.0;

    private static final double DAY_MILLIS = 86_400_000.0;

    private HotScore() {
    }

    /** 原始热度：点赞 × 2 + 评论 × 3。空值当 0。 */
    public static int raw(Integer likes, Integer comments) {
        return (likes == null ? 0 : likes) * LIKE_WEIGHT + (comments == null ? 0 : comments) * COMMENT_WEIGHT;
    }

    /**
     * SQL 里排序用的同一个式子，比如 {@code sqlRaw("GOOD_NUM", "COMMENT_NUM")} 得到
     * {@code (ifnull(GOOD_NUM,0)*2 + ifnull(COMMENT_NUM,0)*3)}。列名只能传代码里写死的常量，不能是用户输入。
     */
    public static String sqlRaw(String likeColumn, String commentColumn) {
        return "(ifnull(" + likeColumn + ",0)*" + LIKE_WEIGHT + " + ifnull(" + commentColumn + ",0)*" + COMMENT_WEIGHT + ")";
    }

    /**
     * 带时间衰减的热度：(原始热度 + 1) × 0.5^(发帖天数 ÷ 7)。
     * 加 1 是每篇帖子的起步分：不加的话，今天发的、还没人互动的帖子是 0，
     * 会排在两年前那篇衰减到 10⁻³⁰ 的旧帖后面。发帖时间在未来（时钟偏差）时按 0 天算。
     */
    public static double decayed(int raw, long publishMillis, long nowMillis) {
        double days = Math.max(0, nowMillis - publishMillis) / DAY_MILLIS;
        return (raw + 1) * Math.pow(0.5, days / HALF_LIFE_DAYS);
    }

    /**
     * 不随时间变化的排序键：log2(原始热度 + 1) + 发帖时刻的天数 ÷ 7。
     *
     * <p>为什么和 {@link #decayed} 排出来一样：对 decayed 取以 2 为底的对数，得到
     * log2(raw + 1) + 发帖天数 ÷ 7 − 今天 ÷ 7。比较两篇帖子时「今天 ÷ 7」对两边是同一个数，
     * 会抵消，剩下的就是这个键。它只在有人点赞或评论时才需要更新。
     */
    public static double rankKey(int raw, long publishMillis) {
        return Math.log(raw + 1) / Math.log(2) + (publishMillis / DAY_MILLIS) / HALF_LIFE_DAYS;
    }
}
