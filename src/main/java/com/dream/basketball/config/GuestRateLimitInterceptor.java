package com.dream.basketball.config;

import com.dream.basketball.utils.SecUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.function.LongSupplier;

/**
 * 没登录的访客访问 NBA 数据接口时的限流。
 *
 * <p>2026-10-06 NBA 模块改成对访客公开（见 {@link Feature#NBA_DATA}）。原来挡在前面的登录门槛
 * 有一半是为了防爬虫，门槛拿掉以后用这个顶上：按 IP、按分钟计数，一分钟超过上限就回 429。
 * 登录用户不计数——他们的行为本来就能按账号追到，也不会是搜索引擎。
 *
 * <p>计数放 Redis：{@code dream:rl:guest:<ip>:<分钟编号>}，第一次计数时设 120 秒过期，
 * 每分钟一个新键，不需要定时清理。上限默认每分钟 120 次：一个 NBA 页面打开时要发 5 到 12 个请求，
 * 正常人一分钟翻十几页都够用；一秒两三次、持续不停的才会撞上。
 *
 * <p>Redis 出问题时放行，只记一条日志。限流是保护，不能因为它坏了把正常访客全挡在外面。
 */
public class GuestRateLimitInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(GuestRateLimitInterceptor.class);

    static final String PREFIX = "dream:rl:guest:";

    private final StringRedisTemplate redis;
    private final int perMinute;
    private final LongSupplier clock;

    public GuestRateLimitInterceptor(StringRedisTemplate redis, int perMinute) {
        this(redis, perMinute, System::currentTimeMillis);
    }

    /** 测试用：时钟可以换成固定值 */
    GuestRateLimitInterceptor(StringRedisTemplate redis, int perMinute, LongSupplier clock) {
        this.redis = redis;
        this.perMinute = perMinute;
        this.clock = clock;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        if (SecUtil.isLogin(request) && SecUtil.getLoginUserToSession(request) != null) {
            return true;
        }
        long now = clock.getAsLong();
        String key = PREFIX + clientIp(request) + ":" + (now / 60_000L);
        Long count;
        try {
            count = redis.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redis.expire(key, Duration.ofSeconds(120));
            }
        } catch (RuntimeException e) {
            log.warn("访客限流计数失败，本次放行: {}", e.toString());
            return true;
        }
        if (count != null && count > perMinute) {
            long secondsLeft = 60 - (now / 1000L) % 60;
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(secondsLeft));
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":429,\"msg\":\"Too many requests. Please wait a minute and try again\",\"data\":null}");
            return false;
        }
        return true;
    }

    /**
     * 访客的真实 IP。
     *
     * <p>站点只从 Cloudflare 隧道进来，Cloudflare 会把客户端地址写进 CF-Connecting-IP，
     * 客户端自己带的同名头会被它覆盖，所以可以拿来做限流的依据。X-Forwarded-For 不行：
     * 客户端可以自己先填一段，Cloudflare 只是在后面追加，取第一段就会被随便换 IP 绕过。
     * 没有这个头（本机开发、局域网直连）时退回连接本身的地址。
     */
    static String clientIp(HttpServletRequest request) {
        String cf = StringUtils.trimToNull(request.getHeader("CF-Connecting-IP"));
        return cf != null ? cf : request.getRemoteAddr();
    }
}
