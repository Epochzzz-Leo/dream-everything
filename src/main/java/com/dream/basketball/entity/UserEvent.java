package com.dream.basketball.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.util.Date;

/**
 * One user action on a post, recorded for the recommendation homepage (2026-10-06).
 *
 * <p>Who: USER_ID for signed-in users, ANON_ID (a random id kept in the browser) for visitors;
 * signed-in users carry both so behaviour before and after signing in can be joined later.
 * What: EVENT_TYPE is impression / click (sent by the page) or like / comment / favorite
 * (written by the server where the action happens). Where from: SOURCE, POSITION and REASON
 * say which list showed the post, at which slot, and with which recommendation reason.
 * Written asynchronously through RabbitMQ (see EventLogger), never in the request path.
 */
@TableName("user_event")
public class UserEvent implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(value = "EVENT_ID", type = IdType.AUTO)
    private Long eventId;

    @TableField("USER_ID")
    private String userId;

    @TableField("ANON_ID")
    private String anonId;

    @TableField("NEWS_ID")
    private String newsId;

    @TableField("TOPIC_ID")
    private String topicId;

    @TableField("EVENT_TYPE")
    private String eventType;

    @TableField("SOURCE")
    private String source;

    @TableField("POSITION")
    private Integer position;

    @TableField("REASON")
    private String reason;

    @TableField("CREATE_TIME")
    private Date createTime;

    public Long getEventId() { return eventId; }
    public void setEventId(Long eventId) { this.eventId = eventId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getAnonId() { return anonId; }
    public void setAnonId(String anonId) { this.anonId = anonId; }
    public String getNewsId() { return newsId; }
    public void setNewsId(String newsId) { this.newsId = newsId; }
    public String getTopicId() { return topicId; }
    public void setTopicId(String topicId) { this.topicId = topicId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Integer getPosition() { return position; }
    public void setPosition(Integer position) { this.position = position; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Date getCreateTime() { return createTime; }
    public void setCreateTime(Date createTime) { this.createTime = createTime; }
}
