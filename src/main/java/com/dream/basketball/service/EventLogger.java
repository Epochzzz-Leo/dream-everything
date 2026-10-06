package com.dream.basketball.service;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 记录用户对帖子的行为（推荐首页用，2026-10-06）。
 *
 * <p>现在只有服务端这一个入口：点赞、评论、收藏成功之后调用 {@link #server}。
 * 页面上报的展示（impression）和点开（click）要等首页做出来才有地方报，和首页同一批上线。
 *
 * <p>这里只做校验，然后丢进 RabbitMQ（交换机 exchange，路由键 user.event），由 UserEventConsumer 写库，
 * 不拖慢请求本身。发送失败只记一条日志：行为记录丢一条无所谓，不能因此让点赞、评论失败。
 */
@Component
public class EventLogger {

    private static final Logger log = LoggerFactory.getLogger(EventLogger.class);

    public static final String EXCHANGE = "exchange";
    public static final String ROUTING_KEY = "user.event";

    /** 服务端写的类型 */
    public static final Set<String> SERVER_TYPES = Set.of("like", "comment", "favorite");

    /** 帖子 id 都是 UUID 格式；只认字母数字和横线、最长 100，和列宽一致 */
    private static final Pattern NEWS_ID = Pattern.compile("^[A-Za-z0-9-]{1,100}$");

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
        try {
            amqpTemplate.convertAndSend(EXCHANGE, ROUTING_KEY, m);
        } catch (Exception e) {
            log.warn("行为记录发送失败，丢弃这一条: {}", e.toString());
        }
    }

    static boolean validNewsId(String newsId) {
        return newsId != null && NEWS_ID.matcher(newsId).matches();
    }
}
