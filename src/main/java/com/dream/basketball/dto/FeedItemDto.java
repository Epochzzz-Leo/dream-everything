package com.dream.basketball.dto;

import lombok.Data;

import java.util.Date;

/**
 * 首页推荐流里的一张卡片。只放卡片要显示的东西：不带正文，摘要和封面图在后端抠好。
 */
@Data
public class FeedItemDto {

    private String newsId;
    private String title;
    /** 正文去掉 HTML 后的前一段（最多 160 个字） */
    private String excerpt;
    /** 正文里第一张图的地址，没有就是 null */
    private String cover;

    private String topicId;
    private String topicName;

    private String authorId;
    /** 作者现在的昵称（帖子表里存的是发帖时的快照） */
    private String author;
    private String authorAvatar;
    private String authorTitles;
    private Boolean authorSuperManager;

    private Date publishDate;
    private Integer goodNum;
    private Integer commentNum;
    private Integer favoriteCount;
    /** 原始热度（HotScore.raw），和帖子列表里的同名字段一致 */
    private Integer hotScore;

    /** 推荐理由代码：following / picked / hot / new；没有就是 null（「最新」「关注」两个标签都不带理由） */
    private String reason;
    /** 卡片上显示的理由文字，比如 Picked by epoch */
    private String reasonLabel;
}
