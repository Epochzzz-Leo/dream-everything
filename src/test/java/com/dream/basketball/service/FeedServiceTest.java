package com.dream.basketball.service;

import com.dream.basketball.config.TopicPermissionService;
import com.dream.basketball.config.UserPermService;
import com.dream.basketball.dto.FeedItemDto;
import com.dream.basketball.entity.DreamNews;
import com.dream.basketball.entity.DreamNewsComment;
import com.dream.basketball.entity.DreamUser;
import com.dream.basketball.entity.ForumTopic;
import com.dream.basketball.entity.ForumTopicMember;
import com.dream.basketball.mapper.DreamNewsCommentMapper;
import com.dream.basketball.mapper.DreamNewsMapper;
import com.dream.basketball.mapper.ForumTopicMapper;
import com.dream.basketball.mapper.ForumTopicMemberMapper;
import com.dream.basketball.mapper.NewsFavoriteMapper;
import com.dream.basketball.mapper.NewsViewerMapper;
import com.dream.basketball.mapper.UserEventMapper;
import com.dream.basketball.mapper.UserFollowMapper;
import com.dream.basketball.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 首页推荐流的服务层：谁能看到什么（选项 A）、两种翻页、卡片内容。
 *
 * <p>假数据库故意「什么都返回」：不管查询条件写的是什么，帖子表的查询把所有帖子（含私密、隐藏、草稿、
 * 官方频道）全部返回。这相当于 SQL 条件全写错了的最坏情况，用来证明 Java 那道门单独也挡得住。
 */
class FeedServiceTest {

    private static final long DAY = 86_400_000L;
    private static final long NOW = 1_791_331_200_000L;

    private static final String PUB = "t-public";
    private static final String PRIV = "t-private";
    private static final String UNLISTED = "t-unlisted";
    private static final String OWNER = "owner-id";

    private DreamNewsMapper newsMapper;
    private UserPermService userPerms;
    private UserMapper userMapper;
    private DreamNewsCommentMapper commentMapper;
    private UserFollowMapper followMapper;
    private final Map<String, String> redisStore = new HashMap<>();
    private final List<DreamNews> posts = new ArrayList<>();
    private final List<ForumTopicMember> members = new ArrayList<>();
    private final Map<String, DreamUser> users = new HashMap<>();
    private FeedService svc;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        newsMapper = mock(DreamNewsMapper.class);
        ForumTopicMapper topicMapper = mock(ForumTopicMapper.class);
        ForumTopicMemberMapper memberMapper = mock(ForumTopicMemberMapper.class);
        commentMapper = mock(DreamNewsCommentMapper.class);
        followMapper = mock(UserFollowMapper.class);
        NewsViewerMapper viewerMapper = mock(NewsViewerMapper.class);
        UserEventMapper eventMapper = mock(UserEventMapper.class);
        userMapper = mock(UserMapper.class);
        NewsFavoriteMapper favoriteMapper = mock(NewsFavoriteMapper.class);
        userPerms = mock(UserPermService.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = mock(ValueOperations.class);

        svc = new FeedService();
        ReflectionTestUtils.setField(svc, "newsMapper", newsMapper);
        ReflectionTestUtils.setField(svc, "topicMapper", topicMapper);
        ReflectionTestUtils.setField(svc, "memberMapper", memberMapper);
        ReflectionTestUtils.setField(svc, "commentMapper", commentMapper);
        ReflectionTestUtils.setField(svc, "followMapper", followMapper);
        ReflectionTestUtils.setField(svc, "viewerMapper", viewerMapper);
        ReflectionTestUtils.setField(svc, "eventMapper", eventMapper);
        ReflectionTestUtils.setField(svc, "userMapper", userMapper);
        ReflectionTestUtils.setField(svc, "favoriteMapper", favoriteMapper);
        ReflectionTestUtils.setField(svc, "topicPerms", new TopicPermissionService());
        ReflectionTestUtils.setField(svc, "userPerms", userPerms);
        ReflectionTestUtils.setField(svc, "redis", redis);
        svc.clock = () -> NOW;

        when(topicMapper.selectList(any())).thenReturn(List.of(
                topic(PUB, "Public", "public", "1"), topic(PRIV, "Private", "private", "0"), topic(UNLISTED, "Unlisted", "public", "0")));
        when(memberMapper.selectList(any())).thenAnswer(inv -> List.copyOf(members));
        when(newsMapper.selectList(any())).thenAnswer(inv -> List.copyOf(posts));
        when(newsMapper.selectBatchIds(anyCollection())).thenAnswer(inv -> {
            Collection<?> ids = inv.getArgument(0);
            return posts.stream().filter(p -> ids.contains(p.getNewsId())).collect(Collectors.toList());
        });
        when(newsMapper.selectMaps(any())).thenAnswer(inv -> posts.stream().map(DreamNews::getTopicId).distinct()
                .map(t -> Map.<String, Object>of("topicId", t)).collect(Collectors.toList()));
        when(commentMapper.selectList(any())).thenReturn(List.of());
        when(followMapper.selectObjs(any())).thenReturn(List.of());
        when(viewerMapper.selectObjs(any())).thenReturn(List.of());
        when(eventMapper.selectObjs(any())).thenReturn(List.of());
        when(userMapper.selectById(any())).thenAnswer(inv -> users.get(String.valueOf((Object) inv.getArgument(0))));
        when(userMapper.selectBatchIds(anyCollection())).thenAnswer(inv -> {
            Collection<?> ids = inv.getArgument(0);
            return users.values().stream().filter(u -> ids.contains(u.getUserId())).collect(Collectors.toList());
        });
        when(favoriteMapper.selectMaps(any())).thenReturn(List.of());
        when(userPerms.canBrowse(anyString())).thenReturn(true);
        when(redis.opsForValue()).thenReturn(ops);
        doAnswer(inv -> redisStore.put(inv.getArgument(0), inv.getArgument(1)))
                .when(ops).set(anyString(), anyString(), any(Duration.class));
        when(ops.get(any())).thenAnswer(inv -> redisStore.get(String.valueOf((Object) inv.getArgument(0))));
    }

    // ───────────────────────────── 造数据

    private static ForumTopic topic(String id, String name, String visibility, String listed) {
        ForumTopic t = new ForumTopic();
        t.setTopicId(id);
        t.setName(name);
        t.setVisibility(visibility);
        t.setListed(listed);
        t.setOwnerId(OWNER);
        return t;
    }

    private DreamNews post(String id, String topicId, double daysAgo) {
        DreamNews n = new DreamNews();
        n.setNewsId(id);
        n.setTopicId(topicId);
        n.setAuthorId("author-" + id);
        n.setAuthor("Author " + id);
        n.setTitle("Title " + id);
        n.setContent("<p>Body of <b>" + id + "</b></p>");
        n.setPublishDate(new Date(NOW - (long) (daysAgo * DAY)));
        n.setGoodNum(0);
        n.setCommentNum(0);
        n.setNewsChannel("forum");
        posts.add(n);
        return n;
    }

    private DreamUser user(String id, String role) {
        DreamUser u = new DreamUser();
        u.setUserId(id);
        u.setUserNickname("nick-" + id);
        u.setUserRole(role);
        users.put(id, u);
        return u;
    }

    private void member(String userId, String topicId, String canView) {
        ForumTopicMember m = new ForumTopicMember();
        m.setUserId(userId);
        m.setTopicId(topicId);
        m.setCanView(canView);
        members.add(m);
    }

    /** 公开专题 2 篇正常帖；私密、下架各 1 篇；公开专题里还有隐藏帖、草稿、官方频道帖各 1 篇 */
    private void mixedPosts() {
        post("pub1", PUB, 1);
        post("pub2", PUB, 2);
        post("priv1", PRIV, 1);
        post("unl1", UNLISTED, 1);
        post("hidden1", PUB, 1).setHidden("1");
        post("draft1", PUB, 1).setDraft("1");
        post("official1", PUB, 1).setNewsChannel("official");
    }

    @SuppressWarnings("unchecked")
    private Set<String> idsOf(Map<String, Object> page) {
        return ((List<FeedItemDto>) page.get("items")).stream().map(FeedItemDto::getNewsId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** 一直翻到没有下一页，返回按顺序拿到的所有 id（重复的也保留，用来查重） */
    @SuppressWarnings("unchecked")
    private List<String> allPages(DreamUser viewer, String tab, int limit) {
        List<String> out = new ArrayList<>();
        String cursor = null;
        for (int guard = 0; guard < 50; guard++) {
            Map<String, Object> page = svc.feed(viewer, tab, cursor, limit, null, null);
            ((List<FeedItemDto>) page.get("items")).forEach(it -> out.add(it.getNewsId()));
            cursor = (String) page.get("nextCursor");
            if (cursor == null) {
                return out;
            }
        }
        throw new AssertionError("翻了 50 页还没完");
    }

    // ───────────────────────────── 谁能看到什么

    @Test
    void visitor_onlyGetsPublicListedPosts_evenIfTheQueryReturnedEverything() {
        mixedPosts();
        assertEquals(Set.of("pub1", "pub2"), Set.copyOf(allPages(null, "foryou", 10)));
        assertEquals(List.of("pub1", "pub2"), allPages(null, "latest", 10));
    }

    @Test
    void signedInStranger_seesTheSameAsAVisitor() {
        mixedPosts();
        DreamUser stranger = user("stranger", "normalUser");
        assertEquals(Set.of("pub1", "pub2"), Set.copyOf(allPages(stranger, "foryou", 10)));
    }

    @Test
    void memberWithViewRight_seesTheirPrivateTopic() {
        mixedPosts();
        DreamUser m = user("m1", "normalUser");
        member("m1", PRIV, "1");
        assertEquals(Set.of("pub1", "pub2", "priv1"), Set.copyOf(allPages(m, "foryou", 10)));
    }

    @Test
    void memberWithoutViewRight_doesNotSeeThePrivateTopic() {
        mixedPosts();
        DreamUser m = user("m1", "normalUser");
        member("m1", PRIV, "0");
        assertEquals(Set.of("pub1", "pub2"), Set.copyOf(allPages(m, "foryou", 10)));
    }

    @Test
    void someoneElsesMembershipRow_doesNotCount() {
        mixedPosts();
        DreamUser me = user("me", "normalUser");
        member("other", PRIV, "1");
        assertFalse(allPages(me, "foryou", 10).contains("priv1"));
    }

    @Test
    void owner_seesTheirPrivateAndUnlistedTopics() {
        mixedPosts();
        DreamUser owner = user(OWNER, "normalUser");
        assertEquals(Set.of("pub1", "pub2", "priv1", "unl1"), Set.copyOf(allPages(owner, "foryou", 10)));
    }

    @Test
    void unlistedPublicTopic_onlyItsMembersSeeIt() {
        mixedPosts();
        DreamUser m = user("m1", "normalUser");
        member("m1", UNLISTED, null);
        assertTrue(allPages(m, "latest", 10).contains("unl1"));
        assertFalse(allPages(user("m2", "normalUser"), "latest", 10).contains("unl1"));
    }

    /** 选项 A 只放「我所在的」专题：超管不是成员也刷不到（超管自己点进专题照样能看，这里不管） */
    @Test
    void superManagerWhoIsNotAMember_doesNotGetPrivatePosts() {
        mixedPosts();
        DreamUser boss = user("boss", "superManager");
        assertEquals(Set.of("pub1", "pub2"), Set.copyOf(allPages(boss, "foryou", 10)));
    }

    @Test
    void browsingBan_getsNothing() {
        mixedPosts();
        DreamUser banned = user("banned", "normalUser");
        when(userPerms.canBrowse("banned")).thenReturn(false);
        assertTrue(allPages(banned, "foryou", 10).isEmpty());
    }

    @Test
    void forumSwitchedOff_getsNothing_unlessSuperManager() {
        mixedPosts();
        user("off", "normalUser").setFeatForum("0");
        assertTrue(allPages(users.get("off"), "latest", 10).isEmpty());
        user("bossOff", "superManager").setFeatForum("0");
        assertEquals(List.of("pub1", "pub2"), allPages(users.get("bossOff"), "latest", 10));
    }

    @Test
    @SuppressWarnings("unchecked")
    void topicFilter_onATopicYouCannotSee_returnsNothingAndIsNotOffered() {
        mixedPosts();
        Map<String, Object> page = svc.feed(null, "foryou", null, 10, PRIV, null);
        assertTrue(idsOf(page).isEmpty());
        List<Map<String, String>> topics = (List<Map<String, String>>) page.get("topics");
        assertEquals(List.of(PUB), topics.stream().map(t -> t.get("topicId")).collect(Collectors.toList()));
    }

    @Test
    void following_isEmptyForVisitors_andOnlyFolloweesForMembers() {
        post("byPal", PUB, 1).setAuthorId("pal");
        post("byOther", PUB, 2);
        assertTrue(allPages(null, "following", 10).isEmpty());
        when(followMapper.selectObjs(any())).thenReturn(List.of("pal"));
        assertEquals(List.of("byPal"), allPages(user("fan", "normalUser"), "following", 10));
    }

    // ───────────────────────────── 翻页

    @Test
    void forYou_pagesThroughOneSnapshotWithoutRepeats() {
        for (int i = 0; i < 5; i++) {
            post("p" + i, PUB, i);
        }
        List<String> got = allPages(null, "foryou", 2);
        assertEquals(5, got.size());
        assertEquals(5, new HashSet<>(got).size(), "没有重复");
        assertEquals(1, redisStore.size(), "三页只建了一份快照");
    }

    /** 快照建好以后有人发了新帖：这一轮翻页不受影响，新帖下次刷新才出现 */
    @Test
    @SuppressWarnings("unchecked")
    void forYou_aNewPostDoesNotShiftTheCurrentSnapshot() {
        for (int i = 0; i < 4; i++) {
            post("p" + i, PUB, i + 1);
        }
        Map<String, Object> page1 = svc.feed(null, "foryou", null, 2, null, null);
        post("brandNew", PUB, 0);
        Map<String, Object> page2 = svc.feed(null, "foryou", (String) page1.get("nextCursor"), 2, null, null);
        Set<String> seen = new HashSet<>(idsOf(page1));
        assertTrue(idsOf(page2).stream().noneMatch(seen::contains), "第二页不重复第一页");
        assertFalse(idsOf(page2).contains("brandNew"));
    }

    /** 别人的游标拿来用：快照的主人对不上，重算一份自己的，不会拿到别人能看的私密帖 */
    @Test
    void forYou_anotherViewersCursorDoesNotLeakTheirPosts() {
        post("pub1", PUB, 1);
        post("pub2", PUB, 2);
        post("priv1", PRIV, 30);   // 最旧，排在成员的第二页
        DreamUser m = user("m1", "normalUser");
        member("m1", PRIV, "1");
        Map<String, Object> memberPage1 = svc.feed(m, "foryou", null, 2, null, null);
        String cursor = (String) memberPage1.get("nextCursor");
        assertEquals(Set.of("priv1"), idsOf(svc.feed(m, "foryou", cursor, 2, null, null)), "成员自己的第二页是私密帖");
        assertFalse(idsOf(svc.feed(null, "foryou", cursor, 2, null, null)).contains("priv1"), "访客拿着成员的游标也看不到");
    }

    @Test
    @SuppressWarnings("unchecked")
    void latest_aNewPostBetweenPagesIsNotRepeated() {
        for (int i = 1; i <= 5; i++) {
            post("p" + i, PUB, 10 - i);   // p5 最新
        }
        Map<String, Object> page1 = svc.feed(null, "latest", null, 2, null, null);
        assertEquals(new LinkedHashSet<>(List.of("p5", "p4")), idsOf(page1));
        post("p6", PUB, 0);
        Map<String, Object> page2 = svc.feed(null, "latest", (String) page1.get("nextCursor"), 2, null, null);
        assertEquals(new LinkedHashSet<>(List.of("p3", "p2")), idsOf(page2));
    }

    @Test
    void latestCursor_rejectsGarbage() {
        assertNull(FeedService.parseTimeCursor("t.abc.p1"));
        assertNull(FeedService.parseTimeCursor("t.123.p1;drop table"));
        assertEquals(new FeedRanker.Cursor(123L, "p1"), FeedService.parseTimeCursor("t.123.p1"));
    }

    // ───────────────────────────── 卡片内容

    @Test
    @SuppressWarnings("unchecked")
    void card_carriesExcerptCoverTopicAndPickedLabel() {
        DreamNews p = post("pick1", PUB, 1);
        p.setContent("<p><img src=\"/picImg/a.png\">Hello &amp; welcome&nbsp;to <b>Dream</b></p>");
        p.setGoodNum(1);
        p.setCommentNum(2);
        user(OWNER, "normalUser").setUserNickname("epoch");
        DreamNewsComment c = new DreamNewsComment();
        c.setNewsId("pick1");
        c.setUserId(OWNER);
        when(commentMapper.selectList(any())).thenReturn(List.of(c));
        FeedItemDto it = ((List<FeedItemDto>) svc.feed(null, "foryou", null, 10, null, null).get("items")).get(0);
        assertEquals("Hello & welcome to Dream", it.getExcerpt());
        assertEquals("/picImg/a.png", it.getCover());
        assertEquals("Public", it.getTopicName());
        assertEquals(8, it.getHotScore(), "1×2 + 2×3");
        assertEquals("picked", it.getReason());
        assertEquals("Picked by epoch", it.getReasonLabel());
    }

    @Test
    void ownerCommentingOnTheirOwnPost_isNotAPick() {
        DreamNews own = post("own", PUB, 10);
        own.setAuthorId(OWNER);
        DreamNewsComment c = new DreamNewsComment();
        c.setNewsId("own");
        c.setUserId(OWNER);
        when(commentMapper.selectList(any())).thenReturn(List.of(c));
        assertTrue(svc.pickedIds(List.of(own), Map.of(PUB, topic(PUB, "Public", "public", "1"))).isEmpty());
    }

    @Test
    void excerpt_stripsTagsDecodesEntitiesAndTruncatesSafely() {
        assertEquals("a < b & c 'd' 中", FeedService.excerptOf("<p>a &lt; b &amp; c &#39;d&#39; &#x4e2d;</p>", 50));
        assertEquals("abc…", FeedService.excerptOf("<div>abcdef</div>", 3));
        assertEquals("😀😀…", FeedService.excerptOf("😀😀😀", 2), "按字符截，不会把表情切成半个");
        assertEquals("", FeedService.excerptOf(null, 10));
        assertNull(FeedService.coverOf("<p>no image</p>"));
    }

    @Test
    void labels() {
        assertEquals("Featured", FeedService.labelOf("picked", true, "epoch"));
        assertEquals("Picked by the topic owner", FeedService.labelOf("picked", false, null));
        assertEquals("From people you follow", FeedService.labelOf("following", false, null));
        assertEquals("Hot this week", FeedService.labelOf("hot", false, null));
        assertEquals("New", FeedService.labelOf("new", false, null));
        assertNull(FeedService.labelOf("because", false, null));
    }
}
