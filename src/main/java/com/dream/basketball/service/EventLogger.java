package com.dream.basketball.service;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 记录用户对帖子的行为（推荐首页用，2026-10-06 起）。
 *
 * <p>两个入口：
 * <ul>
 *   <li>{@link #server}：服务端在点赞、评论、收藏成功之后调用；</li>
 *   <li>{@link #client}：首页推荐流通过 /event/batch 一次报一批展示（impression）和点开（click）。</li>
 * </ul>
 * 这里只做校验，然后丢进 RabbitMQ（交换机 exchange，路由键 user.event），由 UserEventConsumer 写库，
 * 不拖慢请求本身。发送失败只记一条日志：行为记录丢一条无所谓，不能因此让点赞、评论失败。
 *
 * <p>页面报来的字段全部走白名单，非法的条目整条丢掉，不改写、不猜。
 */
@Component
public class EventLogger {

    private static final Logger log = LoggerFactory.getLogger(EventLogger.class);

    public static final String EXCHANGE = "exchange";
    public static final String ROUTING_KEY = "user.event";

    /** 服务端写的类型 */
    public static final Set<String> SERVER_TYPES = Set.of("like", "comment", "favorite");
    /** 页面能报的类型 */
    public static final Set<String> CLIENT_TYPES = Set.of("impression", "click");
    /** 从哪个位置来 */
    public static final Set<String> SOURCES = Set.of(
            "feed_for_you", "feed_latest", "feed_following", "topic", "hot", "search", "related", "detail");
    /** 推荐理由（和 FeedRanker.reasonOf 的代码一致，because 留给第 5 步的个性化） */
    public static final Set<String> REASONS = Set.of("picked", "new", "hot", "following", "because");

    /** 一批最多收几条；页面每 5 秒左右报一次，正常远到不了这个数 */
    public static final int MAX_BATCH = 50;

    /** 帖子 id 都是 UUID 格式；只认字母数字和横线、最长 100，和列宽一致 */
    private static final Pattern NEWS_ID = Pattern.compile("^[A-Za-z0-9-]{1,100}$");
    /** 浏览器里生成的匿名编号：crypto.randomUUID()，同样只认字母数字和横线 */
    private static final Pattern ANON_ID = Pattern.compile("^[A-Za-z0-9-]{8,64}$");

    @Autowired
    private AmqpTemplate amqpTemplate;

    /**
     * 服务端动作。topicId 可以为空，消费者会按帖子去查。
     * SOURCE 不填：同一个收藏按钮在帖子详情和个人主页都有，服务端分不清是从哪一页点的，宁可留空也不瞎填。
     */
    public void server(String userId, String newsId, String topicId, String type) {
        if (StringUtils.isBlank(userId) || !SERVER_TYPES.contains(type) || !validNewsId(newsId)) {
            return;
        }
        Map<String, Object> m = new HashMap<>();
        m.put("userId", userId);
        m.put("newsId", newsId);
        m.put("topicId", topicId);
        m.put("type", type);
        m.put("ts", System.currentTimeMillis());
        publish(m);
    }

    /**
     * 页面报来的一批。userId 来自登录态（没登录为 null），anonId 来自请求体。
     * 返回实际收下的条数（非法的条目不算）。
     */
    public int client(String userId, String anonId, List<?> events) {
        String anon = anonId != null && ANON_ID.matcher(anonId).matches() ? anonId : null;
        if (StringUtils.isBlank(userId) && anon == null) {
            return 0;   // 既没登录、也没有合法的匿名编号：这条行为挂不到任何人身上，不收
        }
        if (events == null) {
            return 0;
        }
        int accepted = 0;
        long now = System.currentTimeMillis();
        for (Object o : events.subList(0, Math.min(events.size(), MAX_BATCH))) {
            if (!(o instanceof Map)) {
                continue;
            }
            Map<?, ?> e = (Map<?, ?>) o;
            String type = str(e.get("type"));
            String newsId = str(e.get("newsId"));
            String source = str(e.get("source"));
            String reason = str(e.get("reason"));
            Integer position = intOrNull(e.get("position"));
            if (!CLIENT_TYPES.contains(type) || !validNewsId(newsId)
                    || (source != null && !SOURCES.contains(source))
                    || (reason != null && !REASONS.contains(reason))
                    || (position != null && (position < 0 || position > 1000))) {
                continue;
            }
            Map<String, Object> m = new HashMap<>();
            m.put("userId", StringUtils.isBlank(userId) ? null : userId);
            m.put("anonId", anon);
            m.put("newsId", newsId);
            m.put("type", type);
            m.put("source", source);
            m.put("position", position);
            m.put("reason", reason);
            m.put("ts", now);
            publish(m);
            accepted++;
        }
        return accepted;
    }

    static boolean validNewsId(String newsId) {
        return newsId != null && NEWS_ID.matcher(newsId).matches();
    }

    private static String str(Object o) {
        return o instanceof String && !((String) o).isEmpty() ? (String) o : null;
    }

    /** 不是数字返回 null；是数字但不是整数、或者大到装不进 int（直接 intValue 会绕回小数字），返回 -1 让范围检查拒掉 */
    private static Integer intOrNull(Object o) {
        if (!(o instanceof Number)) {
            return null;
        }
        double d = ((Number) o).doubleValue();
        return d == Math.rint(d) && d >= Integer.MIN_VALUE && d <= Integer.MAX_VALUE ? (int) d : -1;
    }

    private void publish(Map<String, Object> m) {
        try {
            amqpTemplate.convertAndSend(EXCHANGE, ROUTING_KEY, m);
        } catch (Exception e) {
            log.warn("行为记录发送失败，丢弃这一条: {}", e.toString());
        }
    }
}
