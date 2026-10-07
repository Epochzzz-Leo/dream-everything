package com.dream.basketball.controller;

import com.dream.basketball.common.Result;
import com.dream.basketball.entity.DreamUser;
import com.dream.basketball.service.FeedService;
import com.dream.basketball.utils.SecUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 首页推荐流（公开，访客也能看）。规则全在 {@link FeedService} 里。
 *
 * <p>GET /feed?tab=foryou|latest|following&cursor=…&limit=10&topicId=…&anonId=…
 * 返回 {tab, items, nextCursor, topics（只有第一页带）}。nextCursor 为 null 表示没有下一页了。
 */
@RestController
@RequestMapping("/feed")
public class FeedController {

    @Autowired
    private FeedService feedService;

    @GetMapping
    public Result<Map<String, Object>> feed(String tab, String cursor, Integer limit, String topicId, String anonId,
                                            HttpServletRequest request) {
        DreamUser me = SecUtil.getLoginUserToSession(request);
        int n = limit == null ? FeedService.DEFAULT_LIMIT : limit;
        return new Result<>(0, "OK", feedService.feed(me, tab, cursor, n, topicId, anonId));
    }
}
