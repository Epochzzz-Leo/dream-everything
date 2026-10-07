package com.dream.basketball.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.dream.basketball.config.Role;
import com.dream.basketball.config.TopicPermissionService;
import com.dream.basketball.config.UserPermService;
import com.dream.basketball.dto.FeedItemDto;
import com.dream.basketball.entity.DreamNews;
import com.dream.basketball.entity.DreamNewsComment;
import com.dream.basketball.entity.DreamUser;
import com.dream.basketball.entity.ForumTopic;
import com.dream.basketball.entity.ForumTopicMember;
import com.dream.basketball.entity.NewsFavorite;
import com.dream.basketball.entity.NewsViewer;
import com.dream.basketball.entity.UserEvent;
import com.dream.basketball.entity.UserFollow;
import com.dream.basketball.mapper.DreamNewsCommentMapper;
import com.dream.basketball.mapper.DreamNewsMapper;
import com.dream.basketball.mapper.ForumTopicMapper;
import com.dream.basketball.mapper.ForumTopicMemberMapper;
import com.dream.basketball.mapper.NewsFavoriteMapper;
import com.dream.basketball.mapper.NewsViewerMapper;
import com.dream.basketball.mapper.UserEventMapper;
import com.dream.basketball.mapper.UserFollowMapper;
import com.dream.basketball.mapper.UserMapper;
import com.dream.basketball.utils.HotScore;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static com.dream.basketball.utils.Constants.NEWS_CHANNEL_FORUM;

/**
 * 首页推荐流（GET /feed）：决定「这个人能看哪些帖子」，把它们交给 {@link FeedRanker} 排序，再分页、填卡片。
 *
 * <p><b>谁能看到什么（选项 A，2026-10-06 用户定的）</b>：公开且没下架的专题，所有人都能刷到；
 * 私密专题或下架专题，只有「属于」这个专题的人（题主、小题主、有查看权的成员）能在自己的首页刷到。
 * 超管不是成员的话也刷不到——超管本来就能点进去看，但首页只放「我所在的」。
 * 隐藏帖、草稿任何人都刷不到。这些条件 SQL 里写一遍，取回来以后 Java 里再挡一遍（{@link #visibleInFeed}），
 * 单测测的是 Java 这一道。
 *
 * <p><b>翻页</b>：「最新」「关注」按时间倒序，游标就是上一页最后一篇的（发帖时刻, id）。
 * 「为你推荐」的顺序是算出来的，会随点赞、时间变化，所以第一页时把整条排好的顺序存进 Redis 30 分钟
 * （快照），游标是（快照编号, 已经给到第几篇），翻页只是从快照里往下取，不会重复也不会漏。
 * 快照过期了就重算一份，从同一个位置接着给（这时可能有一两篇重复，记录在 vault 82 里）。
 *
 * <p>快照里只存帖子 id，填卡片时按当前这个人的权限重新查一遍，过滤掉这期间被隐藏、删掉、或他已经没权限看的。
 */
@Service
public class FeedService {

    private static final Logger log = LoggerFactory.getLogger(FeedService.class);

    public static final String TAB_FOR_YOU = "foryou";
    public static final String TAB_LATEST = "latest";
    public static final String TAB_FOLLOWING = "following";

    static final String SNAP_PREFIX = "dream:feed:snap:";
    static final Duration SNAP_TTL = Duration.ofMinutes(30);
    /** 候选池最多拿最新的多少篇。现在全站一两百篇，这个数是给以后留的上限 */
    static final int POOL_CAP = 1000;
    /** 一次「为你推荐」最多排多少篇（快照里存这么多） */
    static final int FOR_YOU_CAP = 300;
    public static final int DEFAULT_LIMIT = 10;
    public static final int MAX_LIMIT = 30;
    /** 摘要最多多少个字 */
    static final int EXCERPT_MAX = 160;

    private static final Pattern SNAP_CURSOR = Pattern.compile("^f\\.([0-9a-f]{32})\\.(\\d{1,4})$");
    private static final Pattern TIME_CURSOR = Pattern.compile("^t\\.(\\d{1,15})\\.([A-Za-z0-9-]{1,100})$");
    private static final Pattern ANON_ID = Pattern.compile("^[A-Za-z0-9-]{8,64}$");
    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern IMG_SRC = Pattern.compile("<img[^>]+src=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x?)([0-9a-fA-F]{1,6});");

    @Autowired
    private DreamNewsMapper newsMapper;
    @Autowired
    private ForumTopicMapper topicMapper;
    @Autowired
    private ForumTopicMemberMapper memberMapper;
    @Autowired
    private DreamNewsCommentMapper commentMapper;
    @Autowired
    private UserFollowMapper followMapper;
    @Autowired
    private NewsViewerMapper viewerMapper;
    @Autowired
    private UserEventMapper eventMapper;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private NewsFavoriteMapper favoriteMapper;
    @Autowired
    private TopicPermissionService topicPerms;
    @Autowired
    private UserPermService userPerms;
    @Autowired
    private StringRedisTemplate redis;

    /** 测试里换成固定时钟 */
    LongSupplier clock = System::currentTimeMillis;

    /**
     * 一页推荐流。
     *
     * @param viewer  登录用户，访客为 null
     * @param tab     foryou（默认）/ latest / following
     * @param cursor  上一页给的 nextCursor，第一页不传
     * @param topicId 只看某个专题（可选）；不是这个人能看的专题就返回空
     * @param anonId  浏览器里的匿名编号，访客用它找「自己点开过的帖子」
     */
    public Map<String, Object> feed(DreamUser viewer, String tab, String cursor, int limit, String topicId, String anonId) {
        int n = Math.max(1, Math.min(limit, MAX_LIMIT));
        String t = TAB_LATEST.equals(tab) || TAB_FOLLOWING.equals(tab) ? tab : TAB_FOR_YOU;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tab", t);
        out.put("items", List.of());
        out.put("nextCursor", null);
        if (!mayBrowse(viewer) || (TAB_FOLLOWING.equals(t) && viewer == null)) {
            return out;
        }
        String anon = anonId != null && ANON_ID.matcher(anonId).matches() ? anonId : null;
        Map<String, ForumTopic> topics = eligibleTopics(viewer);
        Set<String> scope = topics.keySet();
        if (StringUtils.isNotBlank(topicId)) {
            scope = topics.containsKey(topicId) ? Set.of(topicId) : Set.of();
        }
        boolean firstPage = StringUtils.isBlank(cursor);
        if (firstPage) {
            out.put("topics", topicOptions(topics));
        }
        if (scope.isEmpty()) {
            return out;
        }

        List<String> pageIds = new ArrayList<>();
        Map<String, String> reasons = new HashMap<>();
        String next;
        if (TAB_FOR_YOU.equals(t)) {
            String key = (viewer != null ? "u:" + viewer.getUserId() : "a:" + (anon == null ? "-" : anon))
                    + "|t:" + StringUtils.defaultString(topicId);
            String snapId = null;
            int offset = 0;
            List<String[]> snap = null;
            Matcher m = cursor == null ? null : SNAP_CURSOR.matcher(cursor);
            if (m != null && m.matches()) {
                snapId = m.group(1);
                offset = Integer.parseInt(m.group(2));
                snap = readSnapshot(snapId, key);
            }
            if (snap == null) {
                // 第一页，或者快照过期 / 对不上了：现算一份，存起来
                snap = rankForYou(viewer, anon, topics, scope);
                snapId = UUID.randomUUID().toString().replace("-", "");
                writeSnapshot(snapId, key, snap);
            }
            int end = Math.min(snap.size(), offset + n);
            for (int i = offset; i < end; i++) {
                pageIds.add(snap.get(i)[0]);
                if (!snap.get(i)[1].isEmpty()) {
                    reasons.put(snap.get(i)[0], snap.get(i)[1]);
                }
            }
            next = end < snap.size() ? "f." + snapId + "." + end : null;
        } else {
            List<FeedRanker.Post> pool = toPosts(loadPool(scope), Set.of());
            if (TAB_FOLLOWING.equals(t)) {
                Set<String> followees = followees(viewer);
                pool = pool.stream().filter(p -> followees.contains(p.authorId())).collect(Collectors.toList());
            }
            List<FeedRanker.Post> page = FeedRanker.latestAfter(pool, parseTimeCursor(cursor), n + 1);
            boolean more = page.size() > n;
            if (more) {
                page = page.subList(0, n);
            }
            page.forEach(p -> pageIds.add(p.newsId()));
            FeedRanker.Post last = page.isEmpty() ? null : page.get(page.size() - 1);
            next = more ? "t." + last.publishMillis() + "." + last.newsId() : null;
        }
        out.put("items", fill(pageIds, reasons, topics, scope));
        out.put("nextCursor", next);
        return out;
    }

    // ───────────────────────────── 谁能看什么

    /** 被禁止浏览的用户、关掉了论坛模块的用户（超管除外）：一篇都不给，和热帖榜同一套判断。 */
    boolean mayBrowse(DreamUser viewer) {
        if (viewer == null) {
            return true;
        }
        DreamUser fresh = userMapper.selectById(viewer.getUserId());
        if (fresh == null || !userPerms.canBrowse(viewer.getUserId())) {
            return false;
        }
        return Role.fromUserRole(fresh.getUserRole()) == Role.SUPER_MANAGER || !"0".equals(fresh.getFeatForum());
    }

    /** 这个人的首页能出现哪些专题的帖子（选项 A）。保持专题表的顺序。 */
    Map<String, ForumTopic> eligibleTopics(DreamUser viewer) {
        List<ForumTopic> all = topicMapper.selectList(null);
        List<ForumTopicMember> mine = viewer == null ? List.of()
                : memberMapper.selectList(new QueryWrapper<ForumTopicMember>().eq("USER_ID", viewer.getUserId()));
        Set<String> ids = eligibleTopicIds(all, mine, viewer == null ? null : viewer.getUserId(), topicPerms);
        Map<String, ForumTopic> out = new LinkedHashMap<>();
        for (ForumTopic t : all) {
            if (ids.contains(t.getTopicId())) {
                out.put(t.getTopicId(), t);
            }
        }
        return out;
    }

    /**
     * 选项 A 的规则本身（纯函数，单测直接测它）：
     * 公开且没下架 → 人人可见；否则只有题主、小题主、成员能见——私密专题的成员还得有查看权（CAN_VIEW='1'）。
     * 访客（me 为 null）只能见第一种。
     */
    static Set<String> eligibleTopicIds(List<ForumTopic> all, List<ForumTopicMember> mine, String me,
                                        TopicPermissionService perms) {
        Map<String, ForumTopic> byId = new HashMap<>();
        all.forEach(t -> byId.put(t.getTopicId(), t));
        Set<String> belongs = new HashSet<>();
        if (me != null) {
            for (ForumTopic t : all) {
                if (perms.ownerIds(t).contains(me) || perms.subOwnerIds(t).contains(me)) {
                    belongs.add(t.getTopicId());
                }
            }
            for (ForumTopicMember m : mine) {
                ForumTopic t = byId.get(m.getTopicId());
                if (t != null && me.equals(m.getUserId()) && (perms.isPublic(t) || "1".equals(m.getCanView()))) {
                    belongs.add(t.getTopicId());
                }
            }
        }
        Set<String> out = new HashSet<>();
        for (ForumTopic t : all) {
            boolean openToAll = perms.isPublic(t) && !"0".equals(t.getListed());
            if (openToAll || belongs.contains(t.getTopicId())) {
                out.add(t.getTopicId());
            }
        }
        return out;
    }

    /** 第二道门：取回来的每一篇再确认一次——在能看的专题里、没隐藏、不是草稿、是论坛帖。 */
    static boolean visibleInFeed(DreamNews n, Set<String> scope) {
        return n != null && n.getTopicId() != null && scope.contains(n.getTopicId())
                && !"1".equals(n.getHidden()) && !"1".equals(n.getDraft())
                && (n.getNewsChannel() == null || NEWS_CHANNEL_FORUM.equals(n.getNewsChannel()));
    }

    // ───────────────────────────── 候选池和「为你推荐」

    /** 候选池：能看的专题里最新的 POOL_CAP 篇，只取排序要用的列（不带正文）。 */
    List<DreamNews> loadPool(Set<String> scope) {
        if (scope.isEmpty()) {
            return List.of();
        }
        List<DreamNews> rows = newsMapper.selectList(new QueryWrapper<DreamNews>()
                .select("NEWS_ID", "TOPIC_ID", "AUTHOR_ID", "TITLE", "PUBLISH_DATE", "GOOD_NUM", "COMMENT_NUM",
                        "ESSENCE", "HIDDEN", "DRAFT", "NEWS_CHANNEL")
                .in("TOPIC_ID", scope)
                .and(w -> w.isNull("NEWS_CHANNEL").or().eq("NEWS_CHANNEL", NEWS_CHANNEL_FORUM))
                .and(w -> w.isNull("HIDDEN").or().ne("HIDDEN", "1"))
                .and(w -> w.isNull("DRAFT").or().ne("DRAFT", "1"))
                .orderByDesc("PUBLISH_DATE").orderByDesc("NEWS_ID")
                .last("limit " + POOL_CAP));
        return rows.stream().filter(r -> visibleInFeed(r, scope)).collect(Collectors.toList());
    }

    static List<FeedRanker.Post> toPosts(List<DreamNews> rows, Set<String> picked) {
        List<FeedRanker.Post> out = new ArrayList<>(rows.size());
        for (DreamNews r : rows) {
            long millis = r.getPublishDate() == null ? 0L : r.getPublishDate().getTime();
            out.add(new FeedRanker.Post(r.getNewsId(), r.getTopicId(), r.getAuthorId(), r.getTitle(), millis,
                    HotScore.raw(r.getGoodNum(), r.getCommentNum()), picked.contains(r.getNewsId()), "1".equals(r.getEssence())));
        }
        return out;
    }

    /** 算一份「为你推荐」的完整顺序：[帖子 id, 理由代码（没有就是空串）] */
    List<String[]> rankForYou(DreamUser viewer, String anon, Map<String, ForumTopic> topics, Set<String> scope) {
        List<DreamNews> rows = loadPool(scope);
        Set<String> picked = pickedIds(rows, topics);
        FeedRanker.Viewer v = new FeedRanker.Viewer(viewer == null, followees(viewer), opened(viewer, anon));
        List<String[]> out = new ArrayList<>();
        for (FeedRanker.Ranked r : FeedRanker.forYou(toPosts(rows, picked), v, clock.getAsLong(), FOR_YOU_CAP)) {
            out.add(new String[]{r.post().newsId(), r.reason() == null ? "" : r.reason()});
        }
        return out;
    }

    /** 题主在下面评论过的帖子（题主评论自己的帖不算）。 */
    Set<String> pickedIds(List<DreamNews> rows, Map<String, ForumTopic> topics) {
        Map<String, Set<String>> ownersByTopic = new HashMap<>();
        Set<String> owners = new HashSet<>();
        for (ForumTopic t : topics.values()) {
            Set<String> o = topicPerms.ownerIds(t);
            ownersByTopic.put(t.getTopicId(), o);
            owners.addAll(o);
        }
        if (rows.isEmpty() || owners.isEmpty()) {
            return Set.of();
        }
        Map<String, DreamNews> byId = new HashMap<>();
        rows.forEach(r -> byId.put(r.getNewsId(), r));
        Set<String> out = new HashSet<>();
        for (DreamNewsComment c : commentMapper.selectList(new QueryWrapper<DreamNewsComment>()
                .select("NEWS_ID", "USER_ID")
                .in("NEWS_ID", byId.keySet()).in("USER_ID", owners)
                .and(w -> w.isNull("DELETED").or().ne("DELETED", "1")))) {
            DreamNews post = byId.get(c.getNewsId());
            if (post != null && !StringUtils.equals(c.getUserId(), post.getAuthorId())
                    && ownersByTopic.getOrDefault(post.getTopicId(), Set.of()).contains(c.getUserId())) {
                out.add(post.getNewsId());
            }
        }
        return out;
    }

    Set<String> followees(DreamUser viewer) {
        if (viewer == null) {
            return Set.of();
        }
        return strings(followMapper.selectObjs(new QueryWrapper<UserFollow>()
                .select("FOLLOWEE_ID").eq("FOLLOWER_ID", viewer.getUserId())));
    }

    /** 点开看过的帖子：登录用户看浏览记录表，访客看自己匿名编号下的点开记录（最近 500 条）。 */
    Set<String> opened(DreamUser viewer, String anon) {
        if (viewer != null) {
            return strings(viewerMapper.selectObjs(new QueryWrapper<NewsViewer>()
                    .select("NEWS_ID").eq("VIEWER_ID", viewer.getUserId())));
        }
        if (anon == null) {
            return Set.of();
        }
        return strings(eventMapper.selectObjs(new QueryWrapper<UserEvent>()
                .select("NEWS_ID").eq("ANON_ID", anon).eq("EVENT_TYPE", "click")
                .orderByDesc("CREATE_TIME").last("limit 500")));
    }

    private static Set<String> strings(List<Object> objs) {
        Set<String> out = new HashSet<>();
        for (Object o : objs) {
            if (o != null) {
                out.add(o.toString());
            }
        }
        return out;
    }

    // ───────────────────────────── 快照和游标

    void writeSnapshot(String snapId, String key, List<String[]> items) {
        StringBuilder sb = new StringBuilder(key).append('\n');
        for (String[] it : items) {
            sb.append(it[0]).append(':').append(it[1]).append(',');
        }
        try {
            redis.opsForValue().set(SNAP_PREFIX + snapId, sb.toString(), SNAP_TTL);
        } catch (RuntimeException e) {
            log.warn("推荐流快照写不进 Redis，翻页时会重算: {}", e.toString());
        }
    }

    /** 读快照；不存在、Redis 出错、或者不是这个人这次筛选条件下建的，都返回 null（调用方会重算）。 */
    List<String[]> readSnapshot(String snapId, String key) {
        String v;
        try {
            v = redis.opsForValue().get(SNAP_PREFIX + snapId);
        } catch (RuntimeException e) {
            log.warn("推荐流快照读不出来，重算: {}", e.toString());
            return null;
        }
        if (v == null) {
            return null;
        }
        int nl = v.indexOf('\n');
        if (nl < 0 || !v.substring(0, nl).equals(key)) {
            return null;
        }
        List<String[]> out = new ArrayList<>();
        for (String part : v.substring(nl + 1).split(",")) {
            int c = part.indexOf(':');
            if (c > 0) {
                out.add(new String[]{part.substring(0, c), part.substring(c + 1)});
            }
        }
        return out;
    }

    static FeedRanker.Cursor parseTimeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        Matcher m = TIME_CURSOR.matcher(cursor);
        return m.matches() ? new FeedRanker.Cursor(Long.parseLong(m.group(1)), m.group(2)) : null;
    }

    // ───────────────────────────── 填卡片

    /** 按 ids 的顺序填卡片。这里重新查库、重新过一遍权限：快照里的帖子可能这期间被隐藏或删了。 */
    List<FeedItemDto> fill(List<String> ids, Map<String, String> reasons, Map<String, ForumTopic> topics, Set<String> scope) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<String, DreamNews> byId = new HashMap<>();
        for (DreamNews r : newsMapper.selectBatchIds(ids)) {
            if (visibleInFeed(r, scope)) {
                byId.put(r.getNewsId(), r);
            }
        }
        if (byId.isEmpty()) {
            return List.of();
        }
        Set<String> userIds = new HashSet<>();
        byId.values().forEach(r -> userIds.add(r.getAuthorId()));
        for (String id : byId.keySet()) {
            if ("picked".equals(reasons.get(id))) {
                userIds.addAll(topicPerms.ownerIds(topics.get(byId.get(id).getTopicId())));
            }
        }
        userIds.remove(null);
        Map<String, DreamUser> users = new HashMap<>();
        if (!userIds.isEmpty()) {
            userMapper.selectBatchIds(userIds).forEach(u -> users.put(u.getUserId(), u));
        }
        Map<String, Integer> favs = new HashMap<>();
        for (Map<String, Object> m : favoriteMapper.selectMaps(new QueryWrapper<NewsFavorite>()
                .select("NEWS_ID AS newsId", "COUNT(*) AS cnt").in("NEWS_ID", byId.keySet()).groupBy("NEWS_ID"))) {
            favs.put(String.valueOf(m.get("newsId")), ((Number) m.get("cnt")).intValue());
        }
        List<FeedItemDto> out = new ArrayList<>();
        for (String id : ids) {
            DreamNews r = byId.get(id);
            if (r == null) {
                continue;
            }
            ForumTopic topic = topics.get(r.getTopicId());
            DreamUser author = users.get(r.getAuthorId());
            FeedItemDto it = new FeedItemDto();
            it.setNewsId(r.getNewsId());
            it.setTitle(r.getTitle());
            it.setExcerpt(excerptOf(r.getContent(), EXCERPT_MAX));
            it.setCover(coverOf(r.getContent()));
            it.setTopicId(r.getTopicId());
            it.setTopicName(topic == null ? null : topic.getName());
            it.setAuthorId(r.getAuthorId());
            it.setAuthor(author != null && StringUtils.isNotBlank(author.getUserNickname()) ? author.getUserNickname() : r.getAuthor());
            if (author != null) {
                it.setAuthorAvatar(author.getAvatar());
                it.setAuthorTitles(author.getTitles());
                it.setAuthorSuperManager(Role.fromUserRole(author.getUserRole()) == Role.SUPER_MANAGER);
            }
            it.setPublishDate(r.getPublishDate());
            it.setGoodNum(r.getGoodNum() == null ? 0 : r.getGoodNum());
            it.setCommentNum(r.getCommentNum() == null ? 0 : r.getCommentNum());
            it.setFavoriteCount(favs.getOrDefault(id, 0));
            it.setHotScore(HotScore.raw(r.getGoodNum(), r.getCommentNum()));
            String reason = reasons.get(id);
            if (reason != null) {
                it.setReason(reason);
                it.setReasonLabel(labelOf(reason, "1".equals(r.getEssence()), ownerNick(topic, users)));
            }
            out.add(it);
        }
        return out;
    }

    private String ownerNick(ForumTopic topic, Map<String, DreamUser> users) {
        if (topic == null) {
            return null;
        }
        for (String id : topicPerms.ownerIds(topic)) {
            DreamUser u = users.get(id);
            if (u != null && StringUtils.isNotBlank(u.getUserNickname())) {
                return u.getUserNickname();
            }
        }
        return null;
    }

    /** 理由代码 → 卡片上的字。精华帖写 Featured，题主点评过的写 Picked by 题主昵称。 */
    static String labelOf(String reason, boolean essence, String ownerNick) {
        switch (reason) {
            case "following":
                return "From people you follow";
            case "picked":
                return essence ? "Featured" : "Picked by " + (ownerNick == null ? "the topic owner" : ownerNick);
            case "hot":
                return "Hot this week";
            case "new":
                return "New";
            default:
                return null;
        }
    }

    /** 筛选下拉框用：能看的专题里有帖子的那些，按名字排。 */
    List<Map<String, String>> topicOptions(Map<String, ForumTopic> topics) {
        if (topics.isEmpty()) {
            return List.of();
        }
        Set<String> withPosts = new HashSet<>();
        for (Map<String, Object> m : newsMapper.selectMaps(new QueryWrapper<DreamNews>()
                .select("TOPIC_ID AS topicId").in("TOPIC_ID", topics.keySet())
                .and(w -> w.isNull("NEWS_CHANNEL").or().eq("NEWS_CHANNEL", NEWS_CHANNEL_FORUM))
                .and(w -> w.isNull("HIDDEN").or().ne("HIDDEN", "1"))
                .and(w -> w.isNull("DRAFT").or().ne("DRAFT", "1"))
                .groupBy("TOPIC_ID"))) {
            withPosts.add(String.valueOf(m.get("topicId")));
        }
        Collection<ForumTopic> list = topics.values();
        return list.stream().filter(t -> withPosts.contains(t.getTopicId()))
                .sorted(Comparator.comparing((ForumTopic t) -> StringUtils.defaultString(t.getName()).toLowerCase()))
                .map(t -> Map.of("topicId", t.getTopicId(), "name", StringUtils.defaultString(t.getName())))
                .collect(Collectors.toList());
    }

    /** 正文 HTML → 纯文字摘要：去标签、还原常见字符实体、合并空白，超过 max 个字就截断加省略号。 */
    static String excerptOf(String html, int max) {
        if (html == null) {
            return "";
        }
        String text = TAG.matcher(html).replaceAll(" ");
        text = unescape(text).replaceAll("\\s+", " ").trim();
        if (text.codePointCount(0, text.length()) > max) {
            text = text.substring(0, text.offsetByCodePoints(0, max)).trim() + "…";
        }
        return text;
    }

    static String coverOf(String html) {
        if (html == null) {
            return null;
        }
        Matcher m = IMG_SRC.matcher(html);
        return m.find() ? m.group(1) : null;
    }

    private static String unescape(String s) {
        Matcher m = NUMERIC_ENTITY.matcher(s);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            int cp;
            try {
                cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16);
            } catch (NumberFormatException e) {
                cp = -1;
            }
            m.appendReplacement(sb, cp > 0 && Character.isValidCodePoint(cp)
                    ? Matcher.quoteReplacement(new String(Character.toChars(cp))) : "");
        }
        m.appendTail(sb);
        return sb.toString().replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&");
    }
}
