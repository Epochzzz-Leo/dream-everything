package com.dream.basketball.config;

import com.dream.basketball.entity.DreamUser;
import com.dream.basketball.utils.SecUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 访客访问 NBA 接口的限流：按 IP、按分钟计数，超过上限回 429；登录用户不计数；Redis 坏了放行。
 */
class GuestRateLimitInterceptorTest {

    /** 固定时钟：2025-10-06 12:00:30 UTC（毫秒），也就是第 29,329,200 分钟的第 30 秒 */
    private static final long NOW = 1_759_752_030_000L;

    private StringRedisTemplate redis;
    private ValueOperations<String, String> ops;
    private GuestRateLimitInterceptor limiter;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        ops = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        limiter = new GuestRateLimitInterceptor(redis, 3, () -> NOW);
    }

    private MockHttpServletRequest guest(String cfIp) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/player/getAllPlayersSeasonStatsList");
        request.setRemoteAddr("172.18.0.5");
        if (cfIp != null) {
            request.addHeader("CF-Connecting-IP", cfIp);
        }
        return request;
    }

    private String keyFor(String ip) {
        return GuestRateLimitInterceptor.PREFIX + ip + ":" + (NOW / 60_000L);
    }

    @Test
    void firstRequest_passesAndSetsExpiry() throws Exception {
        when(ops.increment(keyFor("203.0.113.7"))).thenReturn(1L);
        assertTrue(limiter.preHandle(guest("203.0.113.7"), new MockHttpServletResponse(), null));
        verify(redis).expire(keyFor("203.0.113.7"), Duration.ofSeconds(120));
    }

    @Test
    void atTheLimit_stillPasses() throws Exception {
        when(ops.increment(keyFor("203.0.113.7"))).thenReturn(3L);
        assertTrue(limiter.preHandle(guest("203.0.113.7"), new MockHttpServletResponse(), null));
        verify(redis, never()).expire(anyString(), any(Duration.class));
    }

    @Test
    void overTheLimit_gets429Json() throws Exception {
        when(ops.increment(keyFor("203.0.113.7"))).thenReturn(4L);
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertFalse(limiter.preHandle(guest("203.0.113.7"), response, null));
        assertEquals(429, response.getStatus());
        assertEquals("30", response.getHeader("Retry-After"), "12:00:30 → 这一分钟还剩 30 秒");
        assertTrue(response.getContentAsString().contains("\"code\":429"));
        assertTrue(response.getContentAsString().contains("Too many requests"));
    }

    @Test
    void signedInUser_isNotCounted() throws Exception {
        MockHttpServletRequest request = guest("203.0.113.7");
        DreamUser user = new DreamUser();
        user.setUserId("u1");
        SecUtil.login4Session(request, user);
        assertTrue(limiter.preHandle(request, new MockHttpServletResponse(), null));
        verify(redis, never()).opsForValue();
    }

    @Test
    void redisFailure_letsTheRequestThrough() throws Exception {
        when(ops.increment(anyString())).thenThrow(new IllegalStateException("redis down"));
        assertTrue(limiter.preHandle(guest("203.0.113.7"), new MockHttpServletResponse(), null));
    }

    @Test
    void preflight_isNeverCounted() throws Exception {
        MockHttpServletRequest request = guest("203.0.113.7");
        request.setMethod("OPTIONS");
        assertTrue(limiter.preHandle(request, new MockHttpServletResponse(), null));
        verify(redis, never()).opsForValue();
    }

    /** CF-Connecting-IP 由 Cloudflare 写入；X-Forwarded-For 的第一段客户端可以自己伪造，不能用 */
    @Test
    void clientIp_prefersCloudflareHeaderAndIgnoresForwardedFor() {
        MockHttpServletRequest viaCloudflare = guest("203.0.113.7");
        viaCloudflare.addHeader("X-Forwarded-For", "1.2.3.4, 203.0.113.7");
        assertEquals("203.0.113.7", GuestRateLimitInterceptor.clientIp(viaCloudflare));

        MockHttpServletRequest direct = guest(null);
        direct.addHeader("X-Forwarded-For", "1.2.3.4");
        assertEquals("172.18.0.5", GuestRateLimitInterceptor.clientIp(direct), "没有 Cloudflare 头时用连接地址");
    }

    /** IPv6 按 /64 计：同一段里换地址还是同一个桶；隔壁段、IPv4、套在 IPv6 里的 IPv4、看不懂的格式各归各的 */
    @Test
    void limitKey_groupsIpv6BySlash64() {
        String bucket = "2001:db8:85a3:8d3::/64";
        assertEquals(bucket, GuestRateLimitInterceptor.limitKey("2001:db8:85a3:8d3:1319:8a2e:370:7348"));
        assertEquals(bucket, GuestRateLimitInterceptor.limitKey("2001:db8:85a3:8d3::1"), "同一段里换一个地址");
        assertEquals(bucket, GuestRateLimitInterceptor.limitKey("2001:0DB8:85A3:08D3:0000:0000:0000:0001"), "大写、不缩写、带前导零");
        assertEquals("2001:db8:85a3:8d4::/64", GuestRateLimitInterceptor.limitKey("2001:db8:85a3:8d4::1"), "隔壁一段");
        assertEquals("fe80:0:0:0::/64", GuestRateLimitInterceptor.limitKey("fe80::1%eth0"), "去掉网卡后缀");
        assertEquals("0:0:0:0::/64", GuestRateLimitInterceptor.limitKey("::1"));
        assertEquals("203.0.113.7", GuestRateLimitInterceptor.limitKey("203.0.113.7"), "IPv4 不变");
        assertEquals("203.0.113.7", GuestRateLimitInterceptor.limitKey("::ffff:203.0.113.7"), "套在 IPv6 里的 IPv4 按它本身算");
        assertEquals("1:2:3", GuestRateLimitInterceptor.limitKey("1:2:3"), "段数不够：原样计数");
        assertEquals("1::2::3", GuestRateLimitInterceptor.limitKey("1::2::3"), "两个 ::：原样计数");
        assertEquals("::ffff:1.2.3.999", GuestRateLimitInterceptor.limitKey("::ffff:1.2.3.999"), "IPv4 段超过 255：原样计数");
        assertEquals("12345::1", GuestRateLimitInterceptor.limitKey("12345::1"), "一段超过 4 位：原样计数");
    }

    @Test
    void ipv6Visitor_isCountedUnderTheirSlash64() throws Exception {
        String key = GuestRateLimitInterceptor.PREFIX + "2001:db8:85a3:8d3::/64:" + (NOW / 60_000L);
        when(ops.increment(key)).thenReturn(4L);
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertFalse(limiter.preHandle(guest("2001:db8:85a3:8d3:1319:8a2e:370:7348"), response, null));
        assertEquals(429, response.getStatus());
    }
}
