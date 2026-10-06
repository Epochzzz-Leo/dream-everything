package com.dream.basketball.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.test.util.ReflectionTestUtils;

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
    void server_survivesABrokenBroker() {
        doThrow(new AmqpException("broker down")).when(amqp).convertAndSend(anyString(), anyString(), any(Object.class));
        assertDoesNotThrow(() -> logger.server("u1", POST, null, "comment"));
    }
}
