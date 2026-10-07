package com.dream.basketball.controller;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.dream.basketball.common.Result;
import com.dream.basketball.entity.DreamUser;
import com.dream.basketball.service.EventLogger;
import com.dream.basketball.utils.SecUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 页面上报的行为（公开，访客也能报）：首页推荐流里「卡片出现在屏幕上」（impression）和「点开了」（click）。
 *
 * <p>请求体是 JSON：{"anonId": "...", "events": [{"type","newsId","source","position","reason"}, …]}。
 * 页面用 navigator.sendBeacon 发，它只能发 text/plain（发 JSON 类型会触发跨域预检，页面关掉时来不及），
 * 所以这里按原始字节收、自己解析。最多读 {@value #MAX_BODY} 字节，超过就整批不要——
 * 不能让一个请求把一大坨数据塞进内存。校验和白名单在 {@link EventLogger#client} 里。
 */
@RestController
@RequestMapping("/event")
public class EventController {

    static final int MAX_BODY = 20_000;

    @Autowired
    private EventLogger eventLogger;

    @PostMapping("/batch")
    public Result<Map<String, Object>> batch(HttpServletRequest request) throws IOException {
        byte[] raw = request.getInputStream().readNBytes(MAX_BODY + 1);
        if (raw.length == 0 || raw.length > MAX_BODY) {
            return new Result<>(0, "OK", Map.of("accepted", 0));
        }
        JSONObject body;
        try {
            body = JSON.parseObject(new String(raw, StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            return new Result<>(0, "OK", Map.of("accepted", 0));
        }
        if (body == null) {
            return new Result<>(0, "OK", Map.of("accepted", 0));
        }
        DreamUser me = SecUtil.getLoginUserToSession(request);
        Object events = body.get("events");
        int n = eventLogger.client(me == null ? null : me.getUserId(), body.getString("anonId"),
                events instanceof List ? (List<?>) events : null);
        return new Result<>(0, "OK", Map.of("accepted", n));
    }
}
