#!/usr/bin/env python3
"""建五个技术专题，并把 tech_digest_items.py 里的 50 条内容通过网站自己的接口发出去。

和 nba_news_seed.py 的区别：那个脚本直接往 MySQL 和 ES 里写；这个走网站的正式接口
（/topic/*、/news/save、/news/comment），由应用自己负责两个库的同步、计数和通知，
不会因为少写一边出现「列表里有、点进去 404」这种对不上的帖子。

怎么以某个账号的身份调接口：在 Redis 里放一个临时 App 令牌（dream:token:<sha256> → userId，
有效期 1 小时），请求带 Authorization: Bearer。注意 TokenStore.resolve 每用一次就把有效期
续成 30 天，所以有效期不是保险，脚本结束时一定要删干净（finally 里删，并逐个核对已不存在）。
用令牌请求会顺带续期这个人的 App 登录指针（SingleSessionGuard.touchApp，只改 TTL 不改指向），
脚本开头记下原 TTL、结束时恢复。网页端登录用的是 Cookie 会话，和这里完全不相干，不会被挤掉。

谁发什么：
  - 帖子：机器人账号 Tech Digest（头衔 Bot，密码是无效占位，没人能登录），卡片上一眼看得出是转载
  - 点评：站长账号，作为每帖的第一条评论
  - 建专题、建类别：超管账号
站长和超管的登录名不写在代码里（仓库是公开的），运行时从环境变量读，见下面的用法。
帖子 id = uuid5(固定命名空间, 规范化后的原文链接)：重复跑不会出现第二份，撤销也按同一批 id。

正文的规矩：标题照原文（超过 100 字会截断，正文里给完整标题）；摘要是自己写的；
arXiv 的摘要按 CC0 原样照录；末尾一行是出处和原文链接。正文里的 @ 一律写成 &#64;，
否则后端会把它当成 @ 某人去发通知（显示效果一样）。

用法（在服务器上，和本文件、tech_digest_items.py 放在同一目录）：
  export SEED_OWNER_LOGIN=<站长登录名> SEED_ADMIN_LOGIN=<超管登录名>
        setup、delete 两个都要；publish、verify 只要站长的；check、retouch 都不用
  python3 tech_digest_seed.py setup [--dry-run]      建机器人账号、Tech 类别、五个专题、帖子类别、成员
  python3 tech_digest_seed.py publish [--dry-run]    发 50 帖 + 50 条点评（已存在的帖子按编辑处理，已有点评跳过）
  python3 tech_digest_seed.py verify                 核对 MySQL / ES / 公开接口三方一致
  python3 tech_digest_seed.py delete [--all] [--dry-run]
        只删帖子（连同评论、评论的 ES 文档、通知、浏览记录、收藏）；--all 再删专题、类别和机器人账号
"""
import argparse
import base64
import hashlib
import html
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tech_digest_items import ITEMS, TOPICS  # noqa: E402

NS = uuid.UUID('9b4c2f6e-5d1a-4c8e-9f3b-7a2d1e6c0b54')   # 只给这批内容用的命名空间，别改
BOT_LOGIN, BOT_NICK = 'techdigest', 'Tech Digest'
BOT_TITLES = '[{"c":"slate","t":"Bot"}]'
# 站长、超管的登录名从环境变量读：仓库是公开的，写死在这里等于告诉所有人超管账号叫什么
OWNER_LOGIN = os.environ.get('SEED_OWNER_LOGIN', '')
ADMIN_LOGIN = os.environ.get('SEED_ADMIN_LOGIN', '')
# 每个命令要用到哪几个登录名；没设就在 main() 里直接停下，不去碰数据库
NEEDS_LOGIN = {'setup': ('SEED_OWNER_LOGIN', 'SEED_ADMIN_LOGIN'), 'delete': ('SEED_OWNER_LOGIN', 'SEED_ADMIN_LOGIN'),
               'publish': ('SEED_OWNER_LOGIN',), 'verify': ('SEED_OWNER_LOGIN',)}
CATEGORY_NAME, CATEGORY_SORT = 'Tech', -1
TOPIC_SORT = -1                       # 排在已有专题前面（已有的都是 0）；改回 0 就回到按创建时间排
ENV_FILE = os.path.expanduser('~/docker-services/dream-app/.env')
CJK = re.compile(r'[　-〿㐀-䶿一-鿿＀-￯]')


# ------------------------------------------------------------------ 基础设施
_ENV = {}


def env(key):
    """用到时才读服务器上的 .env（在本机跑 check 时不需要它）。"""
    if not _ENV:
        for line in open(ENV_FILE, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                _ENV[k.strip()] = v.strip().strip("'").strip('"')
    return _ENV[key]


def mysql(sql):
    """跑一句 SQL，返回行（每行是按 tab 切开的列表）。密码只走环境变量，不进命令行参数。"""
    p = subprocess.run(
        ['docker', 'exec', '-i', '-e', 'MYSQL_PWD=' + env('DB_PASSWORD'), 'mysql', 'mysql', '-uepoch', 'dream',
         '--default-character-set=utf8mb4', '-N', '-B'],
        input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError('mysql: ' + p.stderr.strip())
    return [line.split('\t') for line in p.stdout.splitlines() if line != '']


def q(s):
    return "'" + str(s).replace('\\', '\\\\').replace("'", "''") + "'"


def redis(*args):
    p = subprocess.run(['docker', 'exec', '-e', 'REDISCLI_AUTH=' + env('REDIS_PASSWORD'), 'redis', 'redis-cli', *args],
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError('redis: ' + p.stderr.strip())
    return p.stdout.strip()


def es(method, path, body=None):
    cmd = ['docker', 'exec', '-i', 'elasticsearch', 'curl', '-s', '-X', method, 'localhost:9200' + path,
           '-H', 'Content-Type: application/json']
    if body is not None:
        cmd += ['--data-binary', '@-']
    p = subprocess.run(cmd, input=body, capture_output=True, text=True)
    return json.loads(p.stdout or '{}')


def app_base():
    ip = subprocess.run(['docker', 'inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
                         'dream-app'], capture_output=True, text=True).stdout.strip()
    if not ip:
        raise RuntimeError('拿不到 dream-app 容器地址')
    return f'http://{ip}:8088'


def user_id(login):
    rows = mysql(f'select USER_ID from dream_user where LOGIN_NAME={q(login)};')
    return rows[0][0] if rows else None


def news_id(item):
    return str(uuid.uuid5(NS, item['url']))


# ------------------------------------------------------------------ 临时令牌
class Tokens:
    """进入时给指定账号各发一个临时令牌，退出时全部删掉并核对；顺带恢复 App 登录指针的 TTL。"""

    def __init__(self, logins):
        self.logins = logins
        self.tokens = {}       # login -> token
        self.hashes = []
        self.pointers = {}     # pointer key -> 原 PTTL（毫秒）

    def __enter__(self):
        for login in self.logins:
            uid = user_id(login)
            if not uid:
                raise RuntimeError('账号不存在：' + login)
            pkey = f'dream:login:{uid}:app'
            self.pointers[pkey] = int(redis('PTTL', pkey))
            token = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
            h = base64.urlsafe_b64encode(hashlib.sha256(token.encode()).digest()).decode().rstrip('=')
            redis('SET', 'dream:token:' + h, uid, 'EX', '3600')
            self.tokens[login] = token
            self.hashes.append(h)
        self.started = time.time()
        return self

    def __exit__(self, *exc):
        for h in self.hashes:
            redis('DEL', 'dream:token:' + h)
        left = sum(int(redis('EXISTS', 'dream:token:' + h)) for h in self.hashes)
        elapsed = int((time.time() - self.started) * 1000)
        for pkey, pttl in self.pointers.items():
            if pttl > 0:                       # 原来有指针：把被续成 30 天的 TTL 还回去（扣掉已过去的时间）
                redis('PEXPIRE', pkey, str(max(pttl - elapsed, 1000)))
        print(f'[令牌] 已删除 {len(self.hashes)} 个临时令牌，残留 {left} 个；'
              f'恢复了 {sum(1 for v in self.pointers.values() if v > 0)} 个 App 登录指针的 TTL')
        if left:
            raise RuntimeError('临时令牌没删干净，请手动处理')
        return False


def call(base, token, path, params=None, method='POST'):
    data = urllib.parse.urlencode(params or {}).encode() if method == 'POST' else None
    url = base + path + ('' if method == 'POST' or not params else '?' + urllib.parse.urlencode(params))
    req = urllib.request.Request(url, data=data, method=method)
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    if data is not None:
        req.add_header('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{path} -> HTTP {e.code}: {e.read()[:300]!r}')
    ok = (body.get('code') == 0) if 'code' in body else bool(body.get('result'))
    if not ok:
        raise RuntimeError(f'{path} 失败：{body.get("msg")}')
    return body.get('data') if 'code' in body else body


# ------------------------------------------------------------------ 内容
def esc(text):
    # & < > 转义；@ 写成实体，后端看不到 @ 就不会当成 @ 某人
    return html.escape(text, quote=False).replace('@', '&#64;')


def fmt_date(iso):
    y, m, d = iso.split('-')
    return f'{int(d)} {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(m) - 1]} {y}'


def short_title(t):
    if len(t) <= 100:
        return t
    cut = t[:99].rsplit(' ', 1)[0].rstrip(':,;- ')
    return cut + '…'


def build_content(item):
    parts = []
    if short_title(item['title']) != item['title']:
        parts.append(f'<p><em>Full title: {esc(item["title"])}</em></p>')
    for para in item['summary'].strip().split('\n\n'):
        parts.append(f'<p>{esc(para.strip())}</p>')
    if item.get('abstract'):
        parts.append('<p><strong>Abstract</strong> (arXiv metadata, CC0):</p>')
        parts.append(f'<blockquote>{esc(item["abstract"].strip())}</blockquote>')
    # arXiv 的条目直接以编号开头（"arXiv:2610.02749 [cs.IR]"），不再单独写一个 "arXiv" 来源
    meta = ['arXiv:' + item['arxiv']] if item.get('arxiv') else [item['source']]
    if item.get('authors'):
        meta.append(item['authors'])
    meta.append(fmt_date(item['published']))
    link_text = item.get('link_text') or ('arXiv abstract page' if item.get('arxiv') else 'Read the original')
    parts.append('<p><em style="color:#8c8c8c;font-size:13px">' + esc(' · '.join(meta)) + ' · '
                 f'<a href="{html.escape(item["url"])}" target="_blank" rel="noopener noreferrer">{esc(link_text)}</a></em></p>')
    return ''.join(parts)


def check_items():
    """发之前把能想到的问题全查一遍，有一条不过就不发。"""
    problems = []
    topic_keys = {t['key']: {c[0] for c in t['categories']} for t in TOPICS}
    seen_urls = set()
    for i, it in enumerate(ITEMS):
        tag = f'#{i + 1} {it["title"][:40]}'
        if it['topic'] not in topic_keys:
            problems.append(f'{tag}: 未知专题 {it["topic"]}')
        elif it['category'] not in topic_keys[it['topic']]:
            problems.append(f'{tag}: 专题 {it["topic"]} 没有类别 {it["category"]}')
        if it['url'] in seen_urls:
            problems.append(f'{tag}: 链接重复')
        seen_urls.add(it['url'])
        for field in ('title', 'summary', 'comment', 'source', 'authors'):
            v = it.get(field) or ''
            if CJK.search(v):
                problems.append(f'{tag}: {field} 含中文')
            if '—' in v or '–' in v:
                problems.append(f'{tag}: {field} 含破折号')
        # 正文（摘要、arXiv 摘要）里的 @ 发帖时会被写成 &#64;，后端看不到；
        # 点评是纯文本、标题不经过转义，这两处一个 @ 都不能有
        for field in ('comment', 'title'):
            if '@' in (it.get(field) or ''):
                problems.append(f'{tag}: {field} 含 @')
        if '@' in build_content(it).replace('&#64;', ''):
            problems.append(f'{tag}: 正文转义后仍有 @')
        if len(it['comment']) > 500:
            problems.append(f'{tag}: 点评 {len(it["comment"])} 字，超过评论框的 500')
        tags = ','.join(it['tags'])
        if len(tags) > 300:
            problems.append(f'{tag}: 标签超过 300')
        if not re.match(r'^https://', it['url']):
            problems.append(f'{tag}: 链接不是 https')
    per_topic = {}
    for it in ITEMS:
        per_topic[it['topic']] = per_topic.get(it['topic'], 0) + 1
    return problems, per_topic


# ------------------------------------------------------------------ setup
def ensure_bot(dry):
    uid = user_id(BOT_LOGIN)
    if uid:
        print(f'[账号] 机器人已存在 {BOT_LOGIN} ({uid})')
        return uid
    if mysql(f'select count(*) from dream_user where USER_NICKNAME={q(BOT_NICK)};')[0][0] != '0':
        raise RuntimeError('昵称 Tech Digest 已被别人占用')
    uid = str(uuid.uuid4())
    # 对齐 /user/regist 的写法：状态 1、角色 normalUser、功能开关全部留空（= 默认放行）。
    # 密码放一个不是 BCrypt 的占位串：PasswordUtil.matches 对任何输入都返回 false，没人能用密码登录它。
    # 私信策略 following + 它不关注任何人 = 谁也私信不了它；建专题关掉。
    sql = ('insert into dream_user (USER_ID, REGIST_TIME, LOGIN_NAME, USER_NICKNAME, PASSWORD, USER_STATUS, '
           'USER_ROLE, TITLES, PM_POLICY, CAN_CREATE_TOPIC) values '
           f'({q(uid)}, now(), {q(BOT_LOGIN)}, {q(BOT_NICK)}, {q("BOT-NO-LOGIN-" + secrets.token_hex(12))}, 1, '
           f"'normalUser', {q(BOT_TITLES)}, 'following', '0');")
    if dry:
        print('[账号] 将新建机器人账号', BOT_LOGIN, BOT_NICK)
        return None
    mysql(sql)
    print(f'[账号] 已新建机器人账号 {BOT_LOGIN} / {BOT_NICK} ({uid})')
    return uid


def cmd_setup(dry):
    problems, per_topic = check_items()
    if problems:
        print('\n'.join(problems))
        raise SystemExit('内容检查没通过，先改 tech_digest_items.py')
    bot = ensure_bot(dry)
    owner = user_id(OWNER_LOGIN)
    base = app_base()
    if dry:
        print('[演练] 类别', CATEGORY_NAME, '；专题', [t['name'] for t in TOPICS], '；题主 epoch', owner)
        return
    with Tokens([ADMIN_LOGIN, OWNER_LOGIN]) as tk:
        rows = mysql(f'select CATEGORY_ID from forum_category where NAME={q(CATEGORY_NAME)};')
        if rows:
            cat_id = rows[0][0]
            print(f'[类别] {CATEGORY_NAME} 已存在 ({cat_id})')
        else:
            cats = call(base, tk.tokens[ADMIN_LOGIN], '/topic/saveCategory', {'name': CATEGORY_NAME, 'sort': CATEGORY_SORT})
            cat_id = next(c['categoryId'] for c in cats if c['name'] == CATEGORY_NAME)
            print(f'[类别] 已新建 {CATEGORY_NAME} ({cat_id})，排序 {CATEGORY_SORT}')
        for t in TOPICS:
            rows = mysql(f'select TOPIC_ID from forum_topic where NAME={q(t["name"])} and OWNER_ID={q(owner)};')
            if rows:
                tid = rows[0][0]
                print(f'[专题] {t["name"]} 已存在 ({tid})')
            else:
                tid = call(base, tk.tokens[ADMIN_LOGIN], '/topic/create', {
                    'name': t['name'], 'description': t['description'], 'ownerId': owner,
                    'visibility': 'public', 'openPost': '0', 'openComment': '1', 'listed': '1',
                    'categoryId': cat_id})
                print(f'[专题] 已新建 {t["name"]} ({tid})')
                time.sleep(1.1)        # 同排序值下按创建时间排，错开一秒保证顺序就是 TOPICS 的顺序
            # 题主自己配帖子类别（id 用固定值，重复跑不会生成新 id）
            call(base, tk.tokens[OWNER_LOGIN], '/topic/setPostCategories', {
                'topicId': tid, 'categories': json.dumps([{'id': c[0], 'name': c[1]} for c in t['categories']])})
            # 机器人：可看、可发帖、可评论
            call(base, tk.tokens[OWNER_LOGIN], '/topic/setMember', {
                'topicId': tid, 'userId': bot, 'canView': '1', 'canPost': '1', 'canComment': '1'})
            mysql(f'update forum_topic set SORT={TOPIC_SORT} where TOPIC_ID={q(tid)};')
            print(f'        帖子类别 {len(t["categories"])} 个，机器人已加为可发帖成员，排序 {TOPIC_SORT}')


# ------------------------------------------------------------------ publish
def topic_ids():
    owner = user_id(OWNER_LOGIN)
    out = {}
    for t in TOPICS:
        rows = mysql(f'select TOPIC_ID from forum_topic where NAME={q(t["name"])} and OWNER_ID={q(owner)};')
        if not rows:
            raise RuntimeError(f'专题 {t["name"]} 还没建，先跑 setup')
        out[t['key']] = rows[0][0]
    return out


def ordered_items():
    # 同一专题内按原文日期从旧到新发：列表按发帖时间倒序，最新的原文就排在最上面
    order = {t['key']: i for i, t in enumerate(TOPICS)}
    return sorted(ITEMS, key=lambda it: (order[it['topic']], it['published'], it['title']))


def cmd_publish(dry, update=False):
    problems, per_topic = check_items()
    if problems:
        print('\n'.join(problems))
        raise SystemExit('内容检查没通过')
    print('[检查] 通过；每个专题条数：', per_topic)
    tids = topic_ids()
    epoch = user_id(OWNER_LOGIN)
    items = ordered_items()
    if dry:
        for it in items:
            c = build_content(it)
            print(f'{it["topic"]:12s} {news_id(it)}  {short_title(it["title"])[:70]}  ({len(c)} 字节正文, 点评 {len(it["comment"])} 字)')
        print('\n--- 示例正文 ---\n' + build_content(items[0]) + '\n--- 示例点评 ---\n' + items[0]['comment'])
        return
    base = app_base()
    with Tokens([BOT_LOGIN, OWNER_LOGIN]) as tk:
        for n, it in enumerate(items, 1):
            nid = news_id(it)
            # 已经在库里的帖子默认跳过：再调一次保存，后端会当成「作者编辑」，给帖子打上「最后编辑于」
            if not update and mysql(f'select count(*) from dream_news where NEWS_ID={q(nid)};')[0][0] != '0':
                print(f'[发帖 {n:2d}/{len(items)}] 已存在，跳过')
                continue
            call(base, tk.tokens[BOT_LOGIN], '/news/save', {
                'newsId': nid, 'title': short_title(it['title']), 'content': build_content(it),
                'topicId': tids[it['topic']], 'newsChannel': 'forum', 'tags': ','.join(it['tags']),
                'categoryId': it['category'], 'draft': '0'})
            print(f'[发帖 {n:2d}/{len(items)}] {it["topic"]:12s} {short_title(it["title"])[:70]}')
            time.sleep(1.1)            # 发帖时间错开，列表顺序稳定
        for n, it in enumerate(items, 1):
            nid = news_id(it)
            have = mysql(f"select count(*) from dream_news_comment where news_id={q(nid)} and user_id={q(epoch)} "
                         f"and level='1' and ifnull(DELETED,'0')<>'1';")[0][0]
            if have != '0':
                print(f'[点评 {n:2d}/{len(items)}] 已有，跳过')
                continue
            call(base, tk.tokens[OWNER_LOGIN], '/news/comment', {'newsId': nid, 'content': it['comment'], 'level': '1'})
            print(f'[点评 {n:2d}/{len(items)}] {short_title(it["title"])[:70]}')
            time.sleep(0.3)


# ------------------------------------------------------------------ verify
def cmd_verify():
    ids = [news_id(it) for it in ITEMS]
    inlist = ','.join(q(i) for i in ids)
    epoch = user_id(OWNER_LOGIN)
    bot = user_id(BOT_LOGIN)
    tids = topic_ids()
    print('[MySQL] 帖子：', mysql(f'select count(*) from dream_news where NEWS_ID in ({inlist});')[0][0], '/', len(ids))
    print('[MySQL] 作者都是机器人：', mysql(f'select count(*) from dream_news where NEWS_ID in ({inlist}) and AUTHOR_ID={q(bot)};')[0][0])
    print('[MySQL] 草稿/隐藏：', mysql(f"select count(*) from dream_news where NEWS_ID in ({inlist}) and (DRAFT='1' or HIDDEN='1');")[0][0])
    print('[MySQL] epoch 的点评：', mysql(f"select count(*) from dream_news_comment where news_id in ({inlist}) and user_id={q(epoch)} and level='1';")[0][0])
    print('[MySQL] 评论数计数器=1 的帖子：', mysql(f'select count(*) from dream_news where NEWS_ID in ({inlist}) and COMMENT_NUM=1;')[0][0])
    mget = es('POST', '/news/_mget', json.dumps({'ids': ids}))
    found = sum(1 for d in mget.get('docs', []) if d.get('found'))
    print('[ES] news 文档：', found, '/', len(ids))
    cids = [r[0] for r in mysql(f'select comment_id from dream_news_comment where news_id in ({inlist});')]
    cget = es('POST', '/comment/_mget', json.dumps({'ids': cids})) if cids else {'docs': []}
    print('[ES] comment 文档：', sum(1 for d in cget.get('docs', []) if d.get('found')), '/', len(cids))
    by_topic = {}
    for it in ITEMS:
        by_topic.setdefault(it['topic'], []).append(news_id(it))
    for key, nids in by_topic.items():
        cnt = mysql(f"select count(*) from dream_news where NEWS_ID in ({','.join(q(i) for i in nids)}) and TOPIC_ID={q(tids[key])};")[0][0]
        print(f'[MySQL] 专题 {key:12s}：{cnt}/{len(nids)} 帖挂对了专题')
    base = app_base()
    req = urllib.request.Request(base + '/topic/list')
    with urllib.request.urlopen(req, timeout=30) as r:
        topics = json.loads(r.read())['data']
    print('[公开接口·游客] 专题：', [(t['name'], t.get('categoryName'), t.get('postCount')) for t in topics])
    left = redis('--scan', '--pattern', 'dream:token:*')
    print('[Redis] 当前令牌总数（含真实用户的）：', len([x for x in left.splitlines() if x]))


# ------------------------------------------------------------------ retouch
def cmd_retouch(dry):
    """发出去之后只改正文的排版（不改标题、作者、时间）：直接同时改 MySQL 和 ES 两处。

    为什么不走 /news/save：那是「作者编辑」，会写 LAST_EDIT_TIME，帖子上会挂一个「最后编辑于」。
    这里只处理库里正文和 build_content() 结果不一致的帖子，改完逐篇核对两边一致。
    """
    changed = []
    for it in ITEMS:
        nid = news_id(it)
        rows = mysql(f'select CONTENT from dream_news where NEWS_ID={q(nid)};')
        if not rows:
            continue
        want = build_content(it)
        if rows[0][0] != want.replace('\t', '\\t').replace('\n', '\\n'):
            changed.append((it, nid, want))
    print(f'[修正] 正文需要更新的帖子：{len(changed)} 篇')
    for it, nid, want in changed:
        print('   ', short_title(it['title'])[:80])
    if dry or not changed:
        return
    for it, nid, want in changed:
        mysql(f'update dream_news set CONTENT={q(want)} where NEWS_ID={q(nid)};')
        r = es('POST', f'/news/_update/{nid}', json.dumps({'doc': {'content': want}}))
        if r.get('result') not in ('updated', 'noop'):
            raise RuntimeError(f'ES 更新失败 {nid}: {r}')
    es('POST', '/news/_refresh')
    bad = 0
    for it, nid, want in changed:
        db = mysql(f'select CONTENT from dream_news where NEWS_ID={q(nid)};')[0][0]
        doc = es('GET', f'/news/_doc/{nid}').get('_source', {}).get('content')
        if doc != want or db.replace('\\n', '\n').replace('\\t', '\t') != want:
            bad += 1
            print('    不一致：', nid)
    print(f'[修正] 已更新 {len(changed)} 篇，MySQL 与 ES 和期望正文不一致的：{bad} 篇')


# ------------------------------------------------------------------ delete
def cmd_delete(all_, dry):
    ids = [news_id(it) for it in ITEMS]
    inlist = ','.join(q(i) for i in ids)
    have = mysql(f'select NEWS_ID from dream_news where NEWS_ID in ({inlist});')
    cids = [r[0] for r in mysql(f'select comment_id from dream_news_comment where news_id in ({inlist});')]
    print(f'[撤销] 在库帖子 {len(have)} 篇，评论 {len(cids)} 条')
    if dry:
        return
    base = app_base()
    with Tokens([OWNER_LOGIN, ADMIN_LOGIN]) as tk:
        for (nid,) in have:
            call(base, tk.tokens[OWNER_LOGIN], '/news/deletePost', {'newsId': nid})   # 删 MySQL 行、ES 文档、上传目录
        # deletePost 不管评论：ES 里按 _id 删（id 是 UUID，不能按分词字段去匹配），再删 MySQL
        if cids:
            bulk = ''.join(json.dumps({'delete': {'_index': 'comment', '_id': c}}) + '\n' for c in cids)
            es('POST', '/_bulk', bulk)
            es('POST', '/comment/_refresh')
        mysql(f'delete from dream_news_comment where news_id in ({inlist});')
        mysql(f'delete from user_information where msg_id in ({inlist}) or msg_id_second in ({inlist});')
        mysql(f'delete from news_viewer where NEWS_ID in ({inlist});')
        mysql(f'delete from news_favorite where NEWS_ID in ({inlist});')
        print('[撤销] 帖子、评论、通知、浏览记录、收藏已清理')
        if all_:
            owner = user_id(OWNER_LOGIN)
            for t in TOPICS:
                rows = mysql(f'select TOPIC_ID from forum_topic where NAME={q(t["name"])} and OWNER_ID={q(owner)};')
                if rows:
                    call(base, tk.tokens[ADMIN_LOGIN], '/topic/delete', {'topicId': rows[0][0]}, method='DELETE')
                    mysql(f'delete from forum_topic_member where TOPIC_ID={q(rows[0][0])};')
            rows = mysql(f'select CATEGORY_ID from forum_category where NAME={q(CATEGORY_NAME)};')
            if rows:
                call(base, tk.tokens[ADMIN_LOGIN], '/topic/deleteCategory', {'categoryId': rows[0][0]})
    if all_:
        bot = user_id(BOT_LOGIN)
        if bot:
            mysql(f'delete from user_information where receiver_id={q(bot)} or operator_id={q(bot)};')
            mysql(f'delete from dream_user where USER_ID={q(bot)};')
        print('[撤销] 专题、类别、机器人账号已删除')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['setup', 'publish', 'verify', 'delete', 'check', 'retouch'])
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--update', action='store_true', help='publish 时对已存在的帖子也重新保存（会留下编辑记录）')
    a = ap.parse_args()
    missing = [k for k in NEEDS_LOGIN.get(a.cmd, ()) if not os.environ.get(k)]
    if missing:
        raise SystemExit('先设置环境变量 ' + '、'.join(missing) + '（站长 / 超管的登录名，不写进代码）')
    if a.cmd == 'check':
        problems, per_topic = check_items()
        print('\n'.join(problems) or '内容检查：全部通过', per_topic)
    elif a.cmd == 'setup':
        cmd_setup(a.dry_run)
    elif a.cmd == 'publish':
        cmd_publish(a.dry_run, a.update)
    elif a.cmd == 'verify':
        cmd_verify()
    elif a.cmd == 'retouch':
        cmd_retouch(a.dry_run)
    else:
        cmd_delete(a.all, a.dry_run)


if __name__ == '__main__':
    main()
