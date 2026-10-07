package com.dream.basketball.controller;

import com.dream.basketball.common.Result;
import com.dream.basketball.service.EventLogger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 页面上报接口：按原始字节收（sendBeacon 发的是 text/plain），太大、不是 JSON 的整批不要。
 */
class EventControllerTest {

    private EventLogger logger;
    private EventController controller;

    @BeforeEach
    void setUp() {
        logger = mock(EventLogger.class);
        controller = new EventController();
        ReflectionTestUtils.setField(controller, "eventLogger", logger);
    }

    private static MockHttpServletRequest body(String text) {
        MockHttpServletRequest r = new MockHttpServletRequest("POST", "/event/batch");
        r.setContentType("text/plain;charset=UTF-8");
        r.setContent(text.getBytes(StandardCharsets.UTF_8));
        return r;
    }

    @Test
    void passesTheBatchToTheLogger() throws Exception {
        when(logger.client(isNull(), eq("anon-1234-5678"), anyList())).thenReturn(1);
        Result<Map<String, Object>> r = controller.batch(
                body("{\"anonId\":\"anon-1234-5678\",\"events\":[{\"type\":\"impression\",\"newsId\":\"n1\"}]}"));
        assertEquals(1, r.getData().get("accepted"));
    }

    @Test
    void rejectsOversizedBodiesWithoutParsingThem() throws Exception {
        String big = "{\"anonId\":\"anon-1234-5678\",\"events\":[" + "{\"type\":\"impression\",\"newsId\":\"n1\"},".repeat(1000) + "{}]}";
        Result<Map<String, Object>> r = controller.batch(body(big));
        assertEquals(0, r.getData().get("accepted"));
        verify(logger, never()).client(any(), any(), any());
    }

    @Test
    void ignoresBodiesThatAreNotJson() throws Exception {
        assertEquals(0, controller.batch(body("not json at all")).getData().get("accepted"));
        assertEquals(0, controller.batch(body("")).getData().get("accepted"));
        verify(logger, never()).client(any(), any(), any());
    }

    @Test
    void eventsThatAreNotAListArePassedAsNull() throws Exception {
        controller.batch(body("{\"anonId\":\"anon-1234-5678\",\"events\":\"oops\"}"));
        verify(logger).client(isNull(), eq("anon-1234-5678"), isNull());
    }
}
