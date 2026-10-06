package com.dream.basketball.rabbitmq;

import com.dream.basketball.entity.DreamNews;
import com.dream.basketball.entity.UserEvent;
import com.dream.basketball.mapper.DreamNewsMapper;
import com.dream.basketball.mapper.UserEventMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Date;
import java.util.Map;

/**
 * 把 EventLogger 发来的行为记录写进 user_event 表。
 *
 * <p>帖子不存在（被删了，或者页面报了一个瞎编的 id）就丢掉；专题 id 没带的，按帖子补上。
 * 出错只记日志：写失败的那一条丢了就丢了，不重试，也不让消息卡在队列里反复投递。
 */
@Component
public class UserEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(UserEventConsumer.class);

    @Autowired
    private UserEventMapper userEventMapper;

    @Autowired
    private DreamNewsMapper dreamNewsMapper;

    @RabbitListener(queues = "user_event_queue")
    public void receive(Map<String, Object> m) {
        try {
            String newsId = (String) m.get("newsId");
            DreamNews news = newsId == null ? null : dreamNewsMapper.selectById(newsId);
            if (news == null) {
                return;
            }
            UserEvent e = new UserEvent();
            e.setUserId((String) m.get("userId"));
            e.setAnonId((String) m.get("anonId"));
            e.setNewsId(newsId);
            Object topicId = m.get("topicId");
            e.setTopicId(topicId instanceof String ? (String) topicId : news.getTopicId());
            e.setEventType((String) m.get("type"));
            e.setSource((String) m.get("source"));
            Object pos = m.get("position");
            e.setPosition(pos instanceof Number ? ((Number) pos).intValue() : null);
            e.setReason((String) m.get("reason"));
            Object ts = m.get("ts");
            e.setCreateTime(ts instanceof Number ? new Date(((Number) ts).longValue()) : new Date());
            userEventMapper.insert(e);
        } catch (Exception ex) {
            log.warn("行为记录写库失败，丢弃这一条: {}", ex.toString());
        }
    }
}
