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
 * 没登录的访客访问 NBA 数据接口、首页推荐流（/feed）和行为上报（/event）时的限流，三者共用一份额度。
 *
 * <p>2026-10-06 NBA 模块改成对访客公开（见 {@link Feature#NBA_DATA}）。原来挡在前面的登录门槛
 * 有一半是为了防爬虫，门槛拿掉以后用这个顶上：按 IP、按分钟计数，一分钟超过上限就回 429。
 * 登录用户不计数——他们的行为本来就能按账号追到，也不会是搜索引擎。
 *
 * <p>计数放 Redis：{@code dream:rl:guest:<ip>:<分钟编号>}，第一次计数时设 120 秒过期，
 * 每分钟一个新键，不需要定时清理。上限默认每分钟 120 次：一个 NBA 页面打开时要发 5 到 12 个请求，
 * 正常人一分钟翻十几页都够用；一秒两三次、持续不停的才会撞上。
 *
 * <p>IPv6 按 /64 计（见 {@link #limitKey}）：一户人家通常分到一整段 /64，同一台电脑可以在这段里
 * 随时换地址，按单个地址计数等于没限。
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
        String key = PREFIX + limitKey(clientIp(request)) + ":" + (now / 60_000L);
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

    /**
     * 限流按什么计数：IPv4 按单个地址；IPv6 按前 64 位，比如
     * {@code 2001:db8:85a3:8d3:1319:8a2e:370:7348} 记成 {@code 2001:db8:85a3:8d3::/64}。
     *
     * <p>为什么是 /64：运营商一般给每户一整段 /64，设备在这一段里会定期换一个新地址（隐私扩展），
     * 想绕限流的人也可以每个请求换一个。按单个地址计数，同一台电脑就能拿到无数份额度。
     *
     * <p>两个特殊情况：{@code ::ffff:1.2.3.4} 这种套在 IPv6 里的 IPv4 按里面那个 IPv4 算，不然所有这类
     * 地址会挤进同一个 /64；看不懂的格式原样计数，不能因为格式怪就不限。
     * 这里自己解析文本，不用 {@code InetAddress.getByName}：后者遇到不是 IP 的字符串会去查 DNS。
     */
    static String limitKey(String ip) {
        if (ip == null || ip.indexOf(':') < 0) {
            return ip;
        }
        int[] g = parseIpv6(ip);
        if (g == null) {
            return ip;
        }
        if (g[0] == 0 && g[1] == 0 && g[2] == 0 && g[3] == 0 && g[4] == 0 && g[5] == 0xffff) {
            return (g[6] >> 8) + "." + (g[6] & 0xff) + "." + (g[7] >> 8) + "." + (g[7] & 0xff);
        }
        return Integer.toHexString(g[0]) + ":" + Integer.toHexString(g[1]) + ":"
                + Integer.toHexString(g[2]) + ":" + Integer.toHexString(g[3]) + "::/64";
    }

    /**
     * 把 IPv6 文本展开成 8 段（每段 0 到 0xffff）；格式不对返回 null。
     * 支持 {@code ::} 缩写、末尾嵌 IPv4（{@code ::ffff:1.2.3.4}）和 {@code %网卡} 后缀。
     */
    static int[] parseIpv6(String text) {
        String s = text;
        int pct = s.indexOf('%');
        if (pct >= 0) {
            s = s.substring(0, pct);
        }
        int lastColon = s.lastIndexOf(':');
        String tail = s.substring(lastColon + 1);
        if (tail.indexOf('.') >= 0) {
            String[] p = tail.split("\\.", -1);
            if (p.length != 4) {
                return null;
            }
            int[] b = new int[4];
            for (int i = 0; i < 4; i++) {
                if (!p[i].matches("\\d{1,3}") || Integer.parseInt(p[i]) > 255) {
                    return null;
                }
                b[i] = Integer.parseInt(p[i]);
            }
            s = s.substring(0, lastColon + 1) + Integer.toHexString(b[0] << 8 | b[1]) + ":" + Integer.toHexString(b[2] << 8 | b[3]);
        }
        int dbl = s.indexOf("::");
        if (dbl >= 0 && s.indexOf("::", dbl + 1) >= 0) {
            return null;
        }
        String[] head;
        String[] rest;
        if (dbl >= 0) {
            head = dbl == 0 ? new String[0] : s.substring(0, dbl).split(":", -1);
            String after = s.substring(dbl + 2);
            rest = after.isEmpty() ? new String[0] : after.split(":", -1);
            if (head.length + rest.length > 7) {
                return null;
            }
        } else {
            head = s.split(":", -1);
            rest = new String[0];
            if (head.length != 8) {
                return null;
            }
        }
        int[] out = new int[8];
        for (int i = 0; i < head.length; i++) {
            int v = hextet(head[i]);
            if (v < 0) {
                return null;
            }
            out[i] = v;
        }
        for (int i = 0; i < rest.length; i++) {
            int v = hextet(rest[i]);
            if (v < 0) {
                return null;
            }
            out[8 - rest.length + i] = v;
        }
        return out;
    }

    /** 一段十六进制（1 到 4 位）转成数字；不合法返回 -1 */
    private static int hextet(String h) {
        if (h.isEmpty() || h.length() > 4) {
            return -1;
        }
        for (int i = 0; i < h.length(); i++) {
            if (Character.digit(h.charAt(i), 16) < 0) {
                return -1;
            }
        }
        return Integer.parseInt(h, 16);
    }
}
