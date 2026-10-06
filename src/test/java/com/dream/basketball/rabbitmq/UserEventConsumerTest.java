package com.dream.basketball.rabbitmq;

import com.dream.basketball.entity.DreamNews;
import com.dream.basketball.entity.UserEvent;
import com.dream.basketball.mapper.DreamNewsMapper;
import com.dream.basketball.mapper.UserEventMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 行为记录的写库端：帖子还在就写一行（专题按帖子补上），帖子没了就丢，写库出错不往外抛。
 */
class UserEventConsumerTest {

    private UserEventMapper events;
    private DreamNewsMapper news;
    private UserEventConsumer consumer;

    @BeforeEach
    void setUp() {
        events = mock(UserEventMapper.class);
        news = mock(DreamNewsMapper.class);
        consumer = new UserEventConsumer();
        ReflectionTestUtils.setField(consumer, "userEventMapper", events);
        ReflectionTestUtils.setField(consumer, "dreamNewsMapper", news);
    }

    private static DreamNews post(String id, String topicId) {
        DreamNews p = new DreamNews();
        p.setNewsId(id);
        p.setTopicId(topicId);
        return p;
    }

    private static Map<String, Object> message(String newsId, String type, String topicId) {
        Map<String, Object> m = new HashMap<>();
        m.put("userId", "u1");
        m.put("newsId", newsId);
        m.put("topicId", topicId);
        m.put("type", type);
        m.put("ts", 1_759_752_030_000L);
        return m;
    }

    @Test
    void writesOneRowAndFillsTheTopicFromThePost() {
        when(news.selectById("n1")).thenReturn(post("n1", "t9"));
        consumer.receive(message("n1", "like", null));
        ArgumentCaptor<UserEvent> row = ArgumentCaptor.forClass(UserEvent.class);
        verify(events).insert(row.capture());
        UserEvent e = row.getValue();
        assertEquals("u1", e.getUserId());
        assertNull(e.getAnonId());
        assertEquals("n1", e.getNewsId());
        assertEquals("t9", e.getTopicId(), "消息里没带专题，按帖子补");
        assertEquals("like", e.getEventType());
        assertNull(e.getSource());
        assertNull(e.getPosition());
        assertEquals(1_759_752_030_000L, e.getCreateTime().getTime(), "用发出时的时间，不用写库时的时间");
    }

    @Test
    void keepsTheTopicTheSenderGave() {
        when(news.selectById("n1")).thenReturn(post("n1", "t9"));
        consumer.receive(message("n1", "favorite", "t1"));
        ArgumentCaptor<UserEvent> row = ArgumentCaptor.forClass(UserEvent.class);
        verify(events).insert(row.capture());
        assertEquals("t1", row.getValue().getTopicId());
    }

    @Test
    void dropsEventsForPostsThatAreGone() {
        when(news.selectById("gone")).thenReturn(null);
        consumer.receive(message("gone", "like", null));
        verify(events, never()).insert(any(UserEvent.class));
    }

    @Test
    void swallowsDatabaseErrors() {
        when(news.selectById("n1")).thenReturn(post("n1", null));
        when(events.insert(any(UserEvent.class))).thenThrow(new RuntimeException("db down"));
        assertDoesNotThrow(() -> consumer.receive(message("n1", "comment", null)));
    }
}
