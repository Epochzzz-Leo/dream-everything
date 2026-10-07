package com.dream.basketball.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 行为记录的发送端：合法的发进队列，不合法的整条丢掉，消息队列坏了不影响点赞和评论本身。
 */
class EventLoggerTest {

    private static final String POST = "0028250d-e099-497f-b00d-1bd1ab4e0ebb";

    private AmqpTemplate amqp;
    private EventLogger logger;

    @BeforeEach
    void setUp() {
        amqp = mock(AmqpTemplate.class);
        logger = new EventLogger();
        ReflectionTestUtils.setField(logger, "amqpTemplate", amqp);
    }

    @Test
    @SuppressWarnings("unchecked")
    void server_sendsOneMessageToTheEventQueue() {
        logger.server("u1", POST, "t1", "like");
        ArgumentCaptor<Object> sent = ArgumentCaptor.forClass(Object.class);
        verify(amqp).convertAndSend(eq("exchange"), eq("user.event"), sent.capture());
        Map<String, Object> m = (Map<String, Object>) sent.getValue();
        assertEquals("u1", m.get("userId"));
        assertEquals(POST, m.get("newsId"));
        assertEquals("t1", m.get("topicId"));
        assertEquals("like", m.get("type"));
        assertTrue(m.get("ts") instanceof Long);
        assertFalse(m.containsKey("source"), "服务端分不清是从哪一页点的，不填来源");
    }

    @Test
    void server_dropsAnythingInvalid() {
        logger.server("u1", POST, null, "impression");
        logger.server("u1", POST, null, "view");
        logger.server(null, POST, null, "like");
        logger.server(" ", POST, null, "like");
        logger.server("u1", null, null, "like");
        logger.server("u1", "not a post id", null, "like");
        logger.server("u1", "x".repeat(101), null, "comment");
        verifyNoInteractions(amqp);
    }

    @Test
    void client_keepsOnlyWhitelistedEvents() {
        List<Object> events = List.of(
                Map.of("type", "impression", "newsId", POST, "source", "feed_for_you", "position", 0, "reason", "picked"),
                Map.of("type", "click", "newsId", POST, "source", "feed_latest", "position", 3),
                Map.of("type", "view", "newsId", POST),                                   // 类型不在白名单
                Map.of("type", "click", "newsId", "not a post id"),                       // id 格式不对
                Map.of("type", "click", "newsId", POST, "source", "homepage"),            // 来源不在白名单
                Map.of("type", "click", "newsId", POST, "reason", "because-i-said-so"),   // 理由不在白名单
                Map.of("type", "click", "newsId", POST, "position", -1),                  // 位置是负数
                Map.of("type", "click", "newsId", POST, "position", 1.5),                 // 位置不是整数
                Map.of("type", "click", "newsId", POST, "position", 4_294_967_301L),      // 大到装不进 int（直接取 int 会绕回 5）
                "not even a map");
        assertEquals(2, logger.client(null, "anon-1234-5678", events));
        verify(amqp, times(2)).convertAndSend(eq("exchange"), eq("user.event"), any(Object.class));
    }

    @Test
    void client_needsASignedInUserOrAValidAnonId() {
        List<Object> one = List.of(Map.of("type", "impression", "newsId", POST));
        assertEquals(0, logger.client(null, null, one));
        assertEquals(0, logger.client(null, "short", one), "匿名编号太短");
        assertEquals(0, logger.client(null, "has spaces in it", one));
        assertEquals(1, logger.client("u1", null, one), "登录用户不带匿名编号也收");
    }

    @Test
    void client_capsABatchAtFifty() {
        List<Object> many = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            many.add(Map.of("type", "impression", "newsId", POST, "position", i));
        }
        assertEquals(50, logger.client(null, "anon-1234-5678", many));
    }

    @Test
    void server_survivesABrokenBroker() {
        doThrow(new AmqpException("broker down")).when(amqp).convertAndSend(anyString(), anyString(), any(Object.class));
        assertDoesNotThrow(() -> logger.server("u1", POST, null, "comment"));
    }
}
