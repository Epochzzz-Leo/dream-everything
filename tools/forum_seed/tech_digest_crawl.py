#!/usr/bin/env python3
"""给五个技术专题找候选文章：只抓标题、链接、日期、作者这些元数据，不抓正文。

来源只有三种，都是对方明确提供给别人订阅或调用的出口：
  1. 技术博客的 RSS / Atom 订阅源（Engineering / AI & ML / Web & Frontend）
  2. GitHub 官方 REST API 的 releases 接口（Release Notes：本站在用的那些组件）
  3. arXiv 的 RSS（Search & RecSys：cs.IR 分类，标题/作者/摘要按 CC0 开放）

规矩：
  - 抓之前先读对方的 robots.txt。401/403 当整站禁止，404/410 当没有限制，其它读不到的保守跳过。
    export.arxiv.org 的 robots.txt 是 `Disallow: /`，所以 arXiv 不走它的 API，只拉一次 rss.arxiv.org。
  - 同一个站点两次请求之间至少隔 3 秒；arxiv.org 声明了 Crawl-delay: 15，整个脚本只碰它一次。
  - 链接先规范化（去掉 utm_ 这类跟踪参数、Medium 的 ?source=rss…、#锚点），再按规范化后的链接去重。
    发帖用的 id 也是从这个规范化链接推出来的，同一篇文章永远对应同一个帖子。

输出是一个候选清单 JSON，供人工挑选。挑中的条目、摘要和点评写在 tech_digest_items.json 里，
由 tech_digest_seed.py 通过网站自己的发帖接口发出去。

用法：
  python3 tech_digest_crawl.py out.json            # 博客近 60 天、releases 近 150 天
  python3 tech_digest_crawl.py out.json --days 90
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = 'DreamEverythingDigest/1.0 (+https://www.dream-everything.com)'

FEEDS = {
    'engineering': [
        'https://blog.cloudflare.com/rss/',
        'https://github.blog/engineering/feed/',
        'https://netflixtechblog.com/feed',
        'https://engineering.fb.com/feed/',
        'https://slack.engineering/feed/',
        'https://dropbox.tech/feed',
        'https://engineering.atspotify.com/feed/',
        'https://martinfowler.com/feed.atom',
        'https://aws.amazon.com/blogs/architecture/feed/',
        'https://stripe.com/blog/feed.rss',
        'https://redis.io/blog/feed/',
        'https://www.elastic.co/blog/feed',
        'https://spring.io/blog.atom',
    ],
    'ai': [
        'https://huggingface.co/blog/feed.xml',
        'https://openai.com/news/rss.xml',
        'https://deepmind.google/blog/rss.xml',
        'https://research.google/blog/rss/',
        'https://simonwillison.net/atom/everything/',
    ],
    'web': [
        'https://react.dev/rss.xml',
        'https://developer.chrome.com/static/blog/feed.xml',
        'https://webkit.org/feed/',
        'https://developer.mozilla.org/en-US/blog/rss.xml',
        'https://www.smashingmagazine.com/feed/',
        'https://css-tricks.com/feed/',
        'https://web.dev/static/blog/feed.xml',
        'https://nextjs.org/feed.xml',
    ],
    'papers': [
        'https://rss.arxiv.org/rss/cs.IR',
    ],
}

# 本站真实在用的组件（版本见 pom.xml / package.json / docker-compose），只看它们的发布
RELEASE_REPOS = [
    'spring-projects/spring-boot', 'spring-projects/spring-framework', 'facebook/react', 'vitejs/vite',
    'elastic/elasticsearch', 'redis/redis', 'rabbitmq/rabbitmq-server', 'docker/compose',
    'cloudflare/cloudflared', 'ant-design/ant-design', 'baomidou/mybatis-plus', 'i18next/react-i18next',
    'axios/axios', 'ionic-team/capacitor', 'remix-run/react-router',
]

NS = {'a': 'http://www.w3.org/2005/Atom', 'dc': 'http://purl.org/dc/elements/1.1/'}
TRACKING = re.compile(r'^(utm_[a-z]+|source|ref|ref_src|fbclid|gclid|mc_cid|mc_eid)$', re.I)

_robots = {}
_last_hit = {}


def canonical(url):
    """规范化链接：小写主机、去跟踪参数、去锚点。去重和推帖子 id 都靠它。"""
    p = urllib.parse.urlsplit(url.strip())
    query = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path, urllib.parse.urlencode(query), ''))


def polite_get(url, accept):
    host = urllib.parse.urlsplit(url).netloc
    wait = 3 - (time.time() - _last_hit.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    finally:
        _last_hit[host] = time.time()


def allowed(url):
    p = urllib.parse.urlsplit(url)
    base = f'{p.scheme}://{p.netloc}'
    if base not in _robots:
        try:
            body = polite_get(base + '/robots.txt', 'text/plain')
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(body.decode('utf-8', 'replace').splitlines())
            _robots[base] = rp
        except urllib.error.HTTPError as e:
            _robots[base] = None if e.code in (404, 410) else 'deny'
        except Exception:
            _robots[base] = 'deny'
    rp = _robots[base]
    if rp is None:
        return True
    if rp == 'deny':
        return False
    return rp.can_fetch(UA, url)


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)
    except Exception:
        try:
            d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def text_of(el):
    return re.sub(r'\s+', ' ', ''.join(el.itertext())).strip() if el is not None else ''


def parse_feed(body):
    root = ET.fromstring(body)
    out = []
    if root.find('channel') is not None:
        for it in root.iter('item'):
            authors = [text_of(a) for a in it.findall('dc:creator', NS)] or ([it.findtext('author')] if it.findtext('author') else [])
            out.append({
                'title': text_of(it.find('title')),
                'url': (it.findtext('link') or '').strip(),
                'date': parse_date(it.findtext('pubDate') or it.findtext('dc:date', namespaces=NS)),
                'authors': [a for a in authors if a],
                'tags': [text_of(c) for c in it.findall('category')][:6],
                'snippet': text_of(it.find('description'))[:600],
            })
    else:
        for e in root.findall('a:entry', NS):
            link = ''
            for l in e.findall('a:link', NS):
                if l.get('rel') in (None, 'alternate'):
                    link = l.get('href')
                    break
            out.append({
                'title': text_of(e.find('a:title', NS)),
                'url': link or '',
                'date': parse_date(e.findtext('a:published', namespaces=NS) or e.findtext('a:updated', namespaces=NS)),
                'authors': [text_of(a.find('a:name', NS)) for a in e.findall('a:author', NS)],
                'tags': [c.get('term') for c in e.findall('a:category', NS) if c.get('term')][:6],
                # Element 的真假看的是「有没有子节点」，不是「存不存在」：纯文本的 <summary> 会被当成假。
                # 所以必须显式和 None 比，不能写 a or b
                'snippet': text_of(e.find('a:summary', NS) if e.find('a:summary', NS) is not None else e.find('a:content', NS))[:600],
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--days', type=int, default=60)
    ap.add_argument('--release-days', type=int, default=150)
    args = ap.parse_args()
    now = datetime.now(timezone.utc)
    seen, cands, log = set(), [], []

    def add(group, source, item):
        if not item['url'] or not item['title']:
            return
        c = canonical(item['url'])
        if c in seen:
            return
        seen.add(c)
        d = item['date']
        cands.append({**item, 'group': group, 'source': source, 'url': c,
                      'date': d.isoformat() if d else None})

    for group, urls in FEEDS.items():
        for url in urls:
            if not allowed(url):
                log.append(f'skip (robots) {url}')
                continue
            try:
                items = parse_feed(polite_get(url, 'application/rss+xml, application/atom+xml, application/xml;q=0.9'))
            except Exception as e:
                log.append(f'fail {url}: {type(e).__name__} {e}')
                continue
            kept = 0
            for it in items:
                # arXiv 的 RSS 只有当天的公告，不按日期筛
                if group != 'papers' and (it['date'] is None or now - it['date'] > timedelta(days=args.days)):
                    continue
                add(group, url, it)
                kept += 1
            log.append(f'ok {url}: {len(items)} items, {kept} within window')

    for repo in RELEASE_REPOS:
        api = f'https://api.github.com/repos/{repo}/releases?per_page=15'
        if not allowed(api):
            log.append(f'skip (robots) {api}')
            continue
        try:
            rels = json.loads(polite_get(api, 'application/vnd.github+json'))
        except Exception as e:
            log.append(f'fail {api}: {type(e).__name__} {e}')
            continue
        kept = 0
        for r in rels:
            if r.get('draft') or r.get('prerelease'):
                continue
            d = parse_date(r.get('published_at'))
            if d is None or now - d > timedelta(days=args.release_days):
                continue
            add('releases', repo, {
                'title': f"{repo.split('/')[1]} {r.get('name') or r.get('tag_name')}".strip(),
                'url': r.get('html_url') or '', 'date': d, 'authors': [],
                'tags': [r.get('tag_name') or ''], 'snippet': (r.get('body') or '')[:600],
            })
            kept += 1
        log.append(f'ok {repo}: {len(rels)} releases, {kept} stable within window')

    cands.sort(key=lambda x: (x['group'], x['date'] or ''), reverse=False)
    json.dump({'generated': now.isoformat(), 'log': log, 'candidates': cands}, open(args.out, 'w'), ensure_ascii=False, indent=1)
    print('\n'.join(log))
    by = {}
    for c in cands:
        by[c['group']] = by.get(c['group'], 0) + 1
    print('\ncandidates:', by, 'total', len(cands))


if __name__ == '__main__':
    sys.exit(main())
