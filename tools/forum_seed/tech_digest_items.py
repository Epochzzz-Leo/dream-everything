"""五个技术专题的定义和 50 条导入内容，由 tech_digest_seed.py 读取。

每条的约定（详见 tech_digest_seed.py 文件头）：
  - title    用原文标题（澳洲判例 Fairfax v Reed [2010] FCA 984：标题一般不构成受保护的作品）
  - summary  自己写的摘要，不摘抄原文句子；多段用空行分隔
  - abstract 只有 arXiv 论文有：标题/作者/摘要按 CC0 开放，原样照录
  - comment  epoch 账号发在帖子下面的第一条评论，纯文本，不能出现 @（会被当成 @ 某人）
  - url      原文链接（已去掉跟踪参数），帖子 id 由它推出来，同一篇永远是同一个帖子
"""

TOPICS = [
    {
        'key': 'engineering', 'name': 'Engineering',
        'description': 'How real systems get built, scaled and fixed.',
        'categories': [('eng-java', 'Java'), ('eng-db', 'Databases'), ('eng-infra', 'Infra'),
                       ('eng-rel', 'Reliability'), ('eng-sec', 'Security'), ('eng-practice', 'Practices')],
    },
    {
        'key': 'ai', 'name': 'AI & ML',
        'description': 'Models, evals and research worth a closer look.',
        'categories': [('ai-eval', 'Evaluation'), ('ai-research', 'Research'), ('ai-models', 'Models'),
                       ('ai-tools', 'Tools'), ('ai-privacy', 'Privacy'), ('ai-practice', 'Practice')],
    },
    {
        'key': 'web', 'name': 'Web & Frontend',
        'description': 'Browsers, CSS, React and the web platform.',
        'categories': [('web-perf', 'Performance'), ('web-css', 'CSS & HTML'), ('web-a11y', 'A11y'),
                       ('web-platform', 'Platform')],
    },
    {
        'key': 'recsys', 'name': 'Search & RecSys',
        'description': 'Retrieval, ranking, recommendation and papers.',
        'categories': [('rs-rec', 'Recommender'), ('rs-search', 'Search'), ('rs-rag', 'RAG'),
                       ('rs-exp', 'Experiments')],
    },
    {
        'key': 'releases', 'name': 'Release Notes',
        'description': 'New versions of the stack this site runs on.',
        'categories': [('rel-backend', 'Backend'), ('rel-frontend', 'Frontend'), ('rel-data', 'Data'),
                       ('rel-ops', 'Ops')],
    },
]

ITEMS = [
    # =====================================================================  Engineering
    {
        'topic': 'engineering', 'category': 'eng-java', 'tags': ['Java', 'Modules', 'Tooling'],
        'title': 'Leave the Class Path in the Rearview Mirror',
        'url': 'https://netflixtechblog.com/leave-the-class-path-in-the-rearview-mirror-67a85b15b6be',
        'source': 'Netflix TechBlog', 'authors': 'Danny Thomas', 'published': '2026-09-18',
        'summary': """Netflix's JVM team previewed ja, a set of command-line tools that make module-info.java the whole description of a project. Dependency versions sit in a comment next to each requires line, and runtime permissions such as final-field mutation or native access are declared by the library but have to be approved by the application before it will resolve.

Each piece also works on its own: jig resolves versions and builds, jfmt formats, jist does symbol search and jdocserver serves API docs. Part of the motivation is coding agents, which struggle to find dependencies, sources and docs without an IDE. A survey in the post: of the 1,000 most popular artifacts on Maven Central, 232 ship an explicit module, 248 only declare an automatic module name and 520 say nothing.""",
        'comment': """My backend is one Spring Boot 2.7 jar on Java 17 and every dependency sits on the class path, which is how most Spring apps run. Those Maven Central numbers make me feel less guilty about that. The piece I'd actually take is module-info.hash: nothing in my build pins the hashes of the jars it resolves, so a swapped dependency would go straight through.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-sec', 'tags': ['Identity', 'mTLS', 'Spark'],
        'title': 'Trading a Cloud Identity for Your Own: Workload Attestation on Managed Compute',
        'url': 'https://netflixtechblog.com/trading-a-cloud-identity-for-your-own-workload-attestation-on-managed-compute-516d5a29b252',
        'source': 'Netflix TechBlog', 'authors': 'Dhruv Pratap', 'published': '2026-09-25',
        'summary': """Spark jobs on Amazon EMR start with nothing but an AWS IAM role, while Netflix's internal services only trust their own short-lived X.509 certificates over mutual TLS. The bridge rests on a 1:1 mapping from each data project to a dedicated IAM role, plus two claims that are checked against each other.

The first is a payload signed by the one control plane allowed to launch jobs. The second is a pre-signed sts:GetCallerIdentity URL, which only the holder of the role could have produced. The identity service fetches that URL from AWS, verifies the signature and issues a certificate only when both point at the same workload. Executors receive credentials from the driver over encrypted Spark RPC instead of each attesting separately, and the driver re-attests on a timer.""",
        'comment': """The line I'd pin on a wall: "attestation has to be a repeatable operation rather than a bootstrap step". On my site an app login token is a random string checked against Redis with a 30-day sliding expiry, and "changing your password signs out every other device" only arrived months after launch. Starting from short-lived credentials plus renewal would have saved me that retrofit.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-infra', 'tags': ['Flink', 'Autoscaling', 'Streaming'],
        'title': 'A Tale of Two Flink Autoscalers',
        'url': 'https://netflixtechblog.com/a-tale-of-two-flink-autoscalers-e9f6a1b1492b',
        'source': 'Netflix TechBlog', 'authors': 'Samuel Yeboah, Francesco Di Chiara, Mingliang Liu', 'published': '2026-08-21',
        'summary': """Netflix runs more than 30,000 Flink jobs and, for now, two autoscalers. The homegrown one from 2019 watched container metrics from outside and could only change the total number of TaskManagers. It cut resource use by 25 to 45% on simple pipelines but couldn't reason about stateful jobs with many operators.

The Apache Flink Autoscaler works per operator instead. It divides observed throughput by the fraction of time the operator was busy (700 records a second at 70% busy means roughly 1,000 records a second of real capacity) and sizes every vertex so none becomes the bottleneck. Netflix runs it as a Spring Boot service with one Temporal workflow per job. One team cut its Flink spend by 58%, about $1.1M a year, and Netflix targets 45% utilization rather than the default 70%, trading some efficiency for fewer restarts.""",
        'comment': """The "true processing rate" trick is worth stealing even outside Flink: throughput divided by how busy the worker was. I could apply it to my own RabbitMQ consumer for likes, which I've never measured beyond checking that the queue drains. Also nice to see a Spring Boot service at the centre, with one durable workflow per job because a single slow job used to stall the whole batch loop.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-db', 'tags': ['Proxy', 'Key-value store', 'Connections'],
        'title': 'ZGateway: Learnings from Putting a Proxy in Front of ZippyDB',
        'url': 'https://engineering.fb.com/2026/09/03/core-infra/zgateway-proxy-zippydb-meta/',
        'source': 'Engineering at Meta', 'authors': 'Rittik Banik, Yunhao Cao', 'published': '2026-09-03',
        'summary': """ZippyDB, Meta's most widely used key-value store, used to take TLS connections straight from clients, so each client host held tens of thousands of connections and a large restart could exhaust file descriptors on the database side.

ZGateway is a stateless proxy tier in between. It now carries about 40% of ZippyDB traffic at over a billion operations per second, cuts per-host connection counts by roughly 97 to 98% (about 19 times fewer persistent connections overall), coalesces requests for hot keys and keeps reconnection storms away from storage. The price is an extra network hop and about 6% more compute.""",
        'comment': """Connection pools solve this inside one process; ZGateway solves it across a fleet. My Spring Boot app reaches MySQL through HikariCP, which caps itself at 10 connections by default, so the database never sees more than that from the app. Meta's problem is what happens when thousands of processes each make that same reasonable choice at once.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-infra', 'tags': ['Optimization', 'Open source', 'Scheduling'],
        'title': 'Open-Sourcing Rebalancer: A Generic, High-Performance Library for Solving Assignment Problems',
        'url': 'https://engineering.fb.com/2026/09/21/open-source/rebalancer-generic-high-performance-library-assignment-problems/',
        'source': 'Engineering at Meta', 'authors': 'Richard Barnes, Neeraj Kumar, Pol Mauri Ruiz', 'published': '2026-09-21',
        'summary': """Meta open-sourced Rebalancer, the library it has used for over nine years to decide where things go: racks to data centers, shards and tasks to servers, user traffic to regions. You describe objects, bins, constraints and goals once. It then either compiles the problem into a mixed-integer program for a solver such as HiGHS, Gurobi or FICO Xpress, or runs a local search that evaluates millions of moves per second.

Inside Meta it handles around 40 million assignment problems a day, with a P99 solve time of 12 seconds for 265k objects across 3.2k bins. It's Apache 2.0, on GitHub and PyPI, with a UI for debugging solutions.""",
        'comment': """I'm about to build a much smaller version of this problem: a home feed with a fixed number of slots, posts competing for them, and rules like "no more than two in a row from the same topic". My plan was a greedy loop. What I'm taking from Rebalancer is to write the rules down as explicit constraints first and keep the solver swappable, even if the solver stays a greedy loop for a long time.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-rel', 'tags': ['AWS', 'Resilience', 'Disaster recovery'],
        'title': 'Running multi-day AZ evacuation drills with ARC Zonal Shift',
        'url': 'https://aws.amazon.com/blogs/architecture/running-multi-day-az-evacuation-drills-with-arc-zonal-shift/',
        'source': 'AWS Architecture Blog', 'authors': 'Antoine Boucherie, Hisyam Jukifli, George Agiasoglou', 'published': '2026-09-30',
        'summary': """AWS's point is that a failover test lasting a few minutes can't show how a system behaves after days at reduced capacity. Running on N-1 Availability Zones for 48 to 72 hours exposes the slow problems: scaling policies never tuned for N-1, deploy pipelines placing work in the evacuated zone, database connections pinned to one AZ, and certificate rotations or backups scheduled against the full topology.

The post walks through ARC zonal shift for ECS, EKS, RDS and Aurora with concrete settings, such as a 60-second load balancer deregistration delay, pre-scaling about 50% above baseline peak, and keeping an Aurora reader in a healthy zone so failover takes under 30 seconds.""",
        'comment': """I've only done the short version of this. I restored my nightly MySQL dump from S3 and timed it: about 19 seconds to download and 95 to import, so roughly two minutes for the data, with up to 24 hours of loss. What this post makes clear is everything that drill doesn't cover, like the backup job itself quietly failing some night two weeks later.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-rel', 'tags': ['SQS', 'Fault injection', 'Queues'],
        'title': 'Testing application resilience with Amazon SQS and AWS Fault Injection Service',
        'url': 'https://aws.amazon.com/blogs/architecture/testing-application-resilience-with-amazon-sqs-and-aws-fault-injection-service/',
        'source': 'AWS Architecture Blog', 'authors': 'Richard Whitworth, Hans Nesbitt', 'published': '2026-09-09',
        'summary': """A recipe for breaking SQS on purpose. AWS Fault Injection Service attaches a temporary IAM deny on SendMessage, ReceiveMessage, DeleteMessage and related calls in four escalating phases of 2, 5, 7 and 15 minutes, while you check whether the app trips its circuit breaker, parks messages somewhere durable, drains the backlog without duplicates and keeps CPU, memory and connection pools bounded.

The authors flag one catch: a deny comes back as AccessDenied, which isn't retryable, so this experiment tests fail-fast behaviour rather than retry and backoff. And never deny the queue's control-plane actions, or you can lock yourself out of it.""",
        'comment': """Likes on my site go through RabbitMQ: the request publishes a message and a consumer updates the counter later. I checked what happens if the broker is down, and it isn't great: the publish throws, the request catches it and returns an error, and the like is simply lost. The four-phase idea works without FIS too. Stop the broker container for 2 minutes, then 5, then 15, and watch what the app does.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-sec', 'tags': ['Cloudflare', 'Tunnels', 'Authentication'],
        'title': 'Protected Quick Tunnels: simple accountless authentication for your next dev project',
        'url': 'https://blog.cloudflare.com/protected-quick-tunnels/',
        'source': 'The Cloudflare Blog', 'authors': 'Nikita Cano, Hugo Vicente, Alessandro Frigerio', 'published': '2026-10-02',
        'summary': """Quick Tunnels, the trycloudflare.com links that need no account, have always been open to anyone holding the URL. A new --allowed-mail flag puts a Cloudflare Access sign-in in front. The visitor gets a one-time PIN by email, and cloudflared checks the verified address against the allow list on your own machine, so the list never leaves it.

Several addresses can be listed, or a whole email domain allowed with a wildcard. Sessions last up to four hours or until cloudflared stops, the feature is free, and it needs cloudflared 2026.9.3 or later.""",
        'comment': """This whole site reaches the internet through a named Cloudflare Tunnel running on a mini PC, so I know how little it takes to expose something by accident. The cloudflared I'm running is 2026.7.3, older than the 2026.9.3 this needs. Where I'd use it: showing an unfinished branch to one reviewer without putting it on the open internet.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-practice', 'tags': ['Practices', 'Teams'],
        'title': 'Bliki: Sensible Default',
        'url': 'https://martinfowler.com/bliki/SensibleDefault.html',
        'source': 'martinfowler.com', 'authors': 'Martin Fowler', 'published': '2026-09-29',
        'summary': """Fowler makes the case for saying "sensible default" instead of "best practice". A sensible default is the known-good starting point a team is expected to use unless something specific argues against it, and the word default leaves room to override it.

His examples are version control, keeping UI logic apart from domain logic, and automated deployment pipelines. The framing comes from Evan Bottcher at Thoughtworks: do this, or do better, and be ready to explain why you chose another way.""",
        'comment': """Scoring my own project against his three examples: version control yes, UI separated from domain logic yes (React front end, Spring Boot API). Automated deployment pipeline, no. I still build the jar on my laptop and copy it to the server, and once that cost me a deploy that silently kept running the old jar because I left out --build. By his own test I'd need a reason for that choice, and I don't have a good one.""",
    },
    {
        'topic': 'engineering', 'category': 'eng-practice', 'tags': ['Quality', 'Incidents', 'AI tools'],
        'title': 'AI Changed How Spotify Builds. What We Learned (and Fixed) About Quality at Higher Velocity',
        'url': 'https://engineering.atspotify.com/2026/9/ai-changed-how-spotify-builds-what-we-learned-and-fixed-about-quality-at-higher-velocity/',
        'source': 'Spotify Engineering', 'authors': 'Tyson Singer', 'published': '2026-09-16',
        'summary': """Spotify's head of technology looks back at a year in which merged pull requests went from about 8,100 to 17,000 as AI coding tools took hold. The incidents that followed weren't caused by AI-written code in any material way, he says; the volume of change simply outgrew the systems meant to verify it.

Examples include a content pipeline that failed silently for hours, an automated dependency upgrade that passed its checks and then broke in production, and small mobile regressions that never crossed a monitored threshold. The fixes were mostly unglamorous: end-to-end failure monitoring, stronger rollback, scheduling risky changes during working hours and doubling reserved edge capacity.""",
        'comment': """On my side the verification layer is small: some JUnit tests (21 just for the auth interceptor), lint, and opening the page in a real browser before calling something done. The lesson carries over at any size. When shipping gets faster, checking has to get faster too, or it quietly becomes the bottleneck.""",
    },

    # =====================================================================  AI & ML
    {
        'topic': 'ai', 'category': 'ai-eval', 'tags': ['Agents', 'Evaluation', 'Benchmarks'],
        'title': 'The Agent Said It Was Done. The Database Disagreed.',
        'url': 'https://huggingface.co/blog/microsoft/thinkingbox',
        'source': 'Hugging Face Blog', 'authors': 'Tuhin Kundu (Microsoft) and co-authors', 'published': '2026-10-03',
        'summary': """ThinkingBox scores agents on what they leave behind in the backend rather than on what they say. Its benchmark has 507 stateful business workflows across five domains (retail, auto insurance, travel, a neobank and consulting), and every task runs 20 times from a clean backend, which gives a single-try pass rate, a solved-at-least-once rate and a solved-every-time rate.

Across 18 models and about 122,000 trials, roughly two thirds of failures were runs that finished cleanly, reported no errors and still left the wrong state behind. The gap between "solved once" and "solved every time" is huge for some models: one solved about 94% of tasks at least once but only about 13% on all 20 attempts.""",
        'comment': """"A trajectory is a claim. Database state is the evidence." That line applies well beyond agents. When I import posts into this site I check the rows in MySQL and the documents in Elasticsearch afterwards, because the API saying "success" and both stores agreeing are two different facts. I learned that the hard way: four older posts here still exist in one store and not the other.""",
    },
    {
        'topic': 'ai', 'category': 'ai-eval', 'tags': ['Benchmarks', 'Psychometrics'],
        'title': 'BenchMIRT: What are LLM benchmarks actually measuring?',
        'url': 'https://huggingface.co/blog/allenai/benchmirt',
        'source': 'Hugging Face Blog', 'authors': 'Ai2 (Allen Institute for AI)', 'published': '2026-09-01',
        'summary': """Ai2 applied multidimensional item response theory, a tool from psychometrics, to more than 34,000 questions from 16 benchmarks answered by 100 language models, to see which abilities actually drive a correct answer.

Without being told what each benchmark is for, the method recovered two main dimensions, safety and general reasoning, and some benchmarks landed on the unexpected one: scores on BBQ (social bias) and WMDP (hazardous knowledge) track general reasoning more than safety. Keeping just 10% of the questions usually preserved model rankings, and the model predicted held-out answers correctly 79% of the time against a 70% baseline.""",
        'comment': """The takeaway for me isn't really about LLMs: a score can measure something other than what its name says. My planned feed ranking will be judged by a hit rate on simulated users, and this is a good warning that a number like that might mostly measure how I built the simulator.""",
    },
    {
        'topic': 'ai', 'category': 'ai-eval', 'tags': ['Evaluation', 'Confidential computing'],
        'title': "Piloting the world's first double-blind AI evaluations",
        'url': 'https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/',
        'source': 'Google DeepMind Blog', 'authors': 'William Isaac, Sol Messing, Kristian Lum', 'published': '2026-08-27',
        'summary': """Benchmarks usually force a trade: either the evaluators hand their test prompts to the model provider, or the provider hands its weights to the evaluators. Google DeepMind piloted a setup where neither happens.

The evaluation runs inside Google Cloud's Confidential Space, so the provider never sees the prompts and the evaluator never sees the weights, with cryptographic verification of what actually ran. The pilot tested a Gemini Flash Lite model on confidential benchmarks with partners including the Singapore AI Safety Institute, OpenMined, AVERI and MLCommons. The post shares no results; it is about the mechanism.""",
        'comment': """The trick is the same one behind any confidential computing story: both sides trust the hardware enclave instead of each other. It's a better answer to benchmark contamination than the usual one, which is keeping the test set secret and hoping.""",
    },
    {
        'topic': 'ai', 'category': 'ai-research', 'tags': ['Reproducibility', 'Agents', 'Research'],
        'title': 'What We Learned by Reproducing 2,200 papers from ICML',
        'url': 'https://huggingface.co/blog/icml-2026-open-reproductions',
        'source': 'Hugging Face Blog', 'authors': 'Hugging Face and alphaXiv', 'published': '2026-08-13',
        'summary': """In a community hackathon that ran from 15 July to 2 August, 1,221 people used coding agents to try to reproduce claims from ICML 2026 papers, covering 2,226 of the 6,352 accepted papers. An automated judge sorted each claim as verified, falsified, toy-scale or inconclusive.

About half of the examined papers had at least one verified claim (266 were fully reproduced), 23% had falsified or contested claims and 27% only produced inconclusive or toy-scale results. The organisers' main lesson: the most reliable reproductions came from people actively steering the agents, and independent teams often reached opposite verdicts on the same paper.""",
        'comment': """I relate to the "false falsifications" part. Twice in one week my own test setup made working code look broken: once a dev server was proxying to a backend that wasn't running, and once a headless browser window was too narrow to render the header at all. Checking the test setup before blaming the code is most of the skill.""",
    },
    {
        'topic': 'ai', 'category': 'ai-research', 'tags': ['Factuality', 'LLMs'],
        'title': 'Empty shelves or lost keys? Recall is the bottleneck for parametric factuality',
        'url': 'https://research.google/blog/empty-shelves-or-lost-keys-recall-is-the-bottleneck-for-parametric-factuality/',
        'source': 'Google Research Blog', 'authors': 'Nitay Calderon, Gal Yona', 'published': '2026-08-12',
        'summary': """When a model gets a fact wrong, did it never learn it, or can it not retrieve it? Google researchers built WikiProfile, 2,150 Wikipedia facts each probed by 10 tasks, and graded about 4.5 million responses from 13 models.

Frontier models encode 95 to 98% of the facts but fail to recall 26 to 34% of them directly. With thinking enabled the miss rate drops to 11 to 12%, and thinking recovers 40 to 65% of the facts a model knew but couldn't state. Rare facts are encoded about as often as popular ones but are harder to recall.""",
        'comment': """This matches my experience as a user: the answer is often in there, and a better question gets it out. It also reads like a database problem. The data is stored; the index is what's missing.""",
    },
    {
        'topic': 'ai', 'category': 'ai-research', 'tags': ['Experimentation', 'LLMs', 'A/B testing'],
        'title': 'When Can LLMs Replace Humans in A/B Tests?',
        'url': 'https://engineering.atspotify.com/2026/8/when-can-llms-replace-humans-in-a-b-tests/',
        'source': 'Spotify Engineering', 'authors': 'Sebastian Ankargren, Joel Persson, Mårten Schultzberg', 'published': '2026-08-13',
        'summary': """Spotify's data scientists checked whether an LLM can stand in for real users in an A/B test. Using the Upworthy archive of thousands of headline experiments, they asked gpt-4o-mini to predict the click-through rate of each variant.

Raw predictions recovered only 39% of the real treatment effect, and a simple linear calibration failed their falsification test, landing 3.8 standard errors away from the benchmark. Calibrating with machine-learning models such as random forests brought the estimates within sampling error of the human results. Their caveat is the important part: the assumptions can't be proven for a treatment you have never tested, which is exactly when a simulated test would be most useful.""",
        'comment': """This is the study I needed before building my feed's offline evaluation. I was going to simulate users with fixed topic preferences, a much simpler cousin of what they did, and their result says how far to trust it: fine for checking the plumbing, not for predicting what real people will do.""",
    },
    {
        'topic': 'ai', 'category': 'ai-models', 'tags': ['Forecasting', 'Time series', 'Open weights'],
        'title': 'TimesFM-3: A zero-shot foundation model for multivariate forecasting',
        'url': 'https://research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/',
        'source': 'Google Research Blog', 'authors': 'Ayush Jain, Rajat Sen', 'published': '2026-08-31',
        'summary': """TimesFM-3 is the first version of Google's time-series foundation model that forecasts several related series together and can use covariates, both past-only ones and ones known in advance, such as promotions or weather. It has 330 million parameters, was trained on more than a trillion time points, and produces the whole forecast horizon in one forward pass.

The weights are open on GitHub and Hugging Face. BigQuery integration is coming, and TimesFM-2.5 is already available there through AI.FORECAST. Google reports top results on GIFT-Eval and FEV-Bench among others.""",
        'comment': """Forecasting is one of those problems I'd normally hand-roll badly. The obvious small use on my side is disk and traffic growth for the mini PC this site runs on, where the "known future covariates" would be things like the start of a semester.""",
    },
    {
        'topic': 'ai', 'category': 'ai-tools', 'tags': ['Rust', 'Performance', 'Tokenizers'],
        'title': 'tokenizers v1: encode, decode and scaling, measured',
        'url': 'https://huggingface.co/blog/tokenizers-v1',
        'source': 'Hugging Face Blog', 'authors': 'Arthur Zucker, Simon Brandeis, Luc Georges, Lysandre and contributors', 'published': '2026-09-21',
        'summary': """Hugging Face's tokenizers library reached v1 without changing its output: the same token IDs as v0.23, the same API and the same vocabularies. The speed comes from internals: regex pre-tokenization replaced by SIMD bitstream operations, a thread-local cache of pre-token results, a merge loop rewritten to stop allocating, and scratch buffers owned by the caller.

On an Apple M4 Max, single-threaded encoding is 3 to 30 times faster than v0.23 depending on the model family, and eight workers reach 76% of linear scaling. Training support is now an optional feature.""",
        'comment': """What I like is the order of operations: freeze the output first, then go after speed. Getting the same token IDs as before is what makes a 30x speedup safe to ship. It's the rule I used when moving this site's UI text to English: the Chinese screens had to render exactly as before, and I checked that before anything else.""",
    },
    {
        'topic': 'ai', 'category': 'ai-privacy', 'tags': ['Privacy', 'Enclaves', 'Encryption'],
        'title': 'Advancing Private AI Compute with secure, server-side memory',
        'url': 'https://deepmind.google/blog/advancing-private-ai-compute-with-secure-server-side-memory/',
        'source': 'Google DeepMind Blog', 'authors': 'Google Private AI Compute team', 'published': '2026-09-23',
        'summary': """Private AI Compute runs AI tasks for Google devices inside hardware-isolated cloud enclaves, and until now it was stateless: context was wiped when a task ended. The new server-side memory keeps context across sessions and devices while, according to Google, staying unreadable to anyone else, Google included.

Keys are derived on and held by the user's devices, data is decrypted only inside enclave memory, devices check the server software against a tamper-proof public record before sending anything, and an independent audit was carried out. The post has no performance numbers or rollout dates.""",
        'comment': """The design choice that matters is keeping the keys on the device, so the server stores state it can't read. Most web apps, mine included, do the opposite and simply trust whoever runs the database. The public record of server software is the part I hadn't seen before: devices refuse to send data unless the server can show which build it's running.""",
    },
    {
        'topic': 'ai', 'category': 'ai-practice', 'tags': ['Cloud costs', 'AWS', 'Agents'],
        'title': "We're going to need default hard budget caps on pretty much everything",
        'url': 'https://simonwillison.net/2026/Oct/3/default-hard-budget-caps/',
        'source': "Simon Willison's Weblog", 'authors': 'Simon Willison', 'published': '2026-10-03',
        'summary': """With coding agents making it trivial to deploy things onto pay-per-use services, Simon argues that every such service should ship with a hard spending cap switched on by default: one that stops the service when the limit is hit, instead of sending a warning email people sleep through. Opting out should take an explicit "remove the budget cap" choice.

He points to AWS's new spending limits, announced on 16 September and still in limited release, and to Google Cloud's per-service Spend Caps from July, and suggests that agents should steer beginners toward providers that offer hard caps.""",
        'comment': """For now AWS only holds my database backups and a copy of uploaded files in S3, on the Free Plan, which has to become a paid plan by February 2027. When that happens the first thing I'll turn on is a real limit, not just an alert. A related habit I already have: the IAM key on my server can write and read backups but can't delete them, so a runaway script can't wipe them either.""",
    },

    # =====================================================================  Web & Frontend
    {
        'topic': 'web', 'category': 'web-perf', 'tags': ['CSS', 'CSS-in-JS', 'SSR'],
        'title': 'Improving site performance by shipping more CSS',
        'url': 'https://github.blog/engineering/architecture-optimization/improving-site-performance-by-shipping-more-css/',
        'source': 'The GitHub Blog', 'authors': 'Josh Black, Marie Lucca', 'published': '2026-09-25',
        'summary': """GitHub moved its Primer React components, and then github.com itself, off runtime CSS-in-JS (styled-components and the sx prop) to CSS Modules compiled at build time. Shipping more static CSS turned out faster than computing styles in JavaScript.

Server rendering of Primer components got 55% faster, component initialization took 25% less time, and individual pages saw server rendering improve by 1 to 22%. The migration ran from late 2024 to June 2026 behind feature flags and visual regression tests; the last 895 sx props were cleared in about three weeks with Copilot agents.""",
        'comment': """Ant Design 5, which my front end runs on, also generates its styles at runtime through CSS-in-JS, and I've added plenty of inline style objects of my own. My pages render in the browser rather than on a server, so the 55% doesn't transfer directly, but the shape of the cost is the same: style work done in JavaScript on every render instead of once at build time.""",
    },
    {
        'topic': 'web', 'category': 'web-perf', 'tags': ['Virtualization', 'Rendering', 'Scrolling'],
        'title': 'Rendering huge pull requests in the GitHub Copilot app',
        'url': 'https://github.blog/engineering/user-experience/rendering-huge-pull-requests-in-the-github-copilot-app/',
        'source': 'The GitHub Blog', 'authors': 'Alberto Gimeno', 'published': '2026-09-23',
        'summary': """GitHub's test case was a pull request with 2,200 files, over a million changed lines and more than 400 inline comments. Ordinary list virtualization assumes every row's height is known before paint, which breaks when comments contain wrapped markdown, images and expandable sections.

The fix keeps two kinds of geometry: exact, prefix-summed heights for code lines, and estimated heights for comment blocks that get measured lazily, only near the viewport and only when the user is idle or scrolling, never every frame. Positions are anchored to file, line and side instead of pixels, so the view doesn't jump when a comment resizes. The post shares no benchmark numbers.""",
        'comment': """Nothing on my site comes close to this size, so I've never needed to virtualize the comment section. What I took away is how they split the problem: exact, prefix-summed heights for the code, and estimated heights for comments that get corrected lazily rather than every frame. It's the clearest explanation I've read of why variable-height virtual lists are hard.""",
    },
    {
        'topic': 'web', 'category': 'web-perf', 'tags': ['Bundling', 'Turbopack', 'Caching'],
        'title': 'How Turbopack chunks your JavaScript',
        'url': 'https://nextjs.org/blog/turbopack-chunking',
        'source': 'Next.js Blog', 'authors': 'Sam Poder', 'published': '2026-09-03',
        'summary': """Chunking trades request count against wasted bytes: one bundle over-ships, while one chunk per module means hundreds of requests. Turbopack only merges chunks that always load together on a page (a "chunk group") and weighs each merge by how visitors move between pages, assuming two thirds of sessions see a single page.

Measured on nextjs.org: no merging cost 561.6 KiB over 96 requests, Turbopack's defaults 554.8 KiB over 38, and merging everything per group 610.0 KiB over 15, about 10% more code. Next.js 16.3 adds experimental options to emit unmerged chunks alongside merged ones and pick the cheaper set at runtime, plus tuning from real analytics.""",
        'comment': """My Vite build currently emits exactly one JavaScript file for the whole site, the "one chunk for everything" end of their spectrum. It's fine at my size and every later visit is a cache hit, but each new page makes the first visit heavier. The two-thirds-single-page assumption is a number I could measure on my own traffic before deciding where to split.""",
    },
    {
        'topic': 'web', 'category': 'web-perf', 'tags': ['Baseline', 'Dependencies', 'Web platform'],
        'title': 'How Baseline Can Help You Ship Less JavaScript',
        'url': 'https://smashingmagazine.com/2026/08/how-baseline-can-help-ship-less-javascript/',
        'source': 'Smashing Magazine', 'authors': 'Jad Joubran', 'published': '2026-08-07',
        'summary': """Baseline labels web features as limited, newly available (shipped in every major engine) or widely available (30+ months everywhere), which turns it into a checklist for dropping dependencies. The author estimates a typical mid-sized app carries 60 to 90 KB gzipped of replaceable libraries.

His examples: Intl APIs instead of date and number formatting helpers (about 14 KB), fetch with AbortController instead of axios (about 17 KB, but without interceptors or automatic rejection on 4xx and 5xx), dialog and Popover instead of modal and tooltip libraries (about 24 KB), and structuredClone or Object.groupBy instead of lodash pieces. Temporal isn't ready: its polyfill alone is about 44 KB. The suggested habit is to run the audit once a quarter.""",
        'comment': """The axios row is the one I'd argue with for my own app. My axios instance does real work in its interceptors: it attaches the login token, unwraps our {code, msg, data} response shape and sends anyone who gets a 401 back to the login page. Saving 17 KB means rebuilding all three on top of fetch, which is exactly the "does the platform cover my real use case" question in the article.""",
    },
    {
        'topic': 'web', 'category': 'web-css', 'tags': ['CSS', 'Container queries', 'Responsive'],
        'title': 'Stop Treating CSS Container Queries Like Traditional Media Queries',
        'url': 'https://smashingmagazine.com/2026/09/stop-treating-css-container-queries-traditional-media-queries/',
        'source': 'Smashing Magazine', 'authors': 'Victor Ayomipo', 'published': '2026-09-16',
        'summary': """Media queries look outward at the viewport and suit page-level layout; container queries look at the space a component has actually been given, which is what reusable components need. The article shows the basic pattern (container-type: inline-size on a wrapper, then @container rules) and container units such as cqi for type that scales with its box.

The pitfalls it lists: an element can't query itself, so you need a wrapper; size containment collapses height unless you set one; and custom properties can't be used in query conditions. Support is around 94%, yet only 41.4% of developers report using container queries while 86% know about them.""",
        'comment': """Right now my layout code checks the viewport through a useIsMobile hook and then branches inside every component, which is the "macro" tool doing "micro" jobs. Topic cards are the obvious candidate: the same card sits in a three-column grid on desktop and a single column on a phone, and it's really the card's width that matters, not the window's.""",
    },
    {
        'topic': 'web', 'category': 'web-css', 'tags': ['HTML', 'Dialog', 'CSS'],
        'title': 'Using and Styling the Dialog Element',
        'url': 'https://css-tricks.com/using-and-styling-the-dialog-element/',
        'source': 'CSS-Tricks', 'authors': 'Geoff Graham', 'published': '2026-08-07',
        'summary': """A practical tour of the native dialog element. showModal() gives a real modal with a backdrop, Escape to close and an inert background, while show() gives a non-modal popup. Dialogs can be closed with close(), the Escape key, or a form whose method is "dialog".

Style the overlay with ::backdrop and the open state with [open] or :modal, keep scrolling contained with overscroll-behavior or body:has(dialog[open]), and animate entry with @starting-style. Invoker commands (command="show-modal") are still experimental. Compared with the Popover API, dialog brings focus management and the right ARIA wiring for free.""",
        'comment': """All of my site's modals are Ant Design components built from divs. Read next to the aria-hidden article in this topic, it makes a decent case for the native element: showModal() hands you the backdrop, Escape and an inert background, which is the part libraries keep getting subtly wrong.""",
    },
    {
        'topic': 'web', 'category': 'web-a11y', 'tags': ['Accessibility', 'Modals', 'Focus'],
        'title': "Blocked aria-hidden: The Warning is Right, and Every Fix You've Found is Wrong",
        'url': 'https://css-tricks.com/blocked-aria-hidden-fix/',
        'source': 'CSS-Tricks', 'authors': 'Durgesh Rajubhai Pawar', 'published': '2026-08-12',
        'summary': """Chrome's "Blocked aria-hidden" warning means focus stayed inside a region marked hidden, and the browser repaired the accessibility tree by exposing the focused element anyway, so screen readers announce focus on content they were told doesn't exist. The usual fixes make it worse: blur() dumps focus on the body, setTimeout bets on render timing, stripping aria-hidden breaks containment, and modal={false} quietly turns a modal into something else.

The fix is an ordering rule: focus must leave a region before that region becomes hidden or inert. On close, remove inert from the background, return focus to the trigger, then hide the overlay and unmount it; on open, remember document.activeElement first. The article lists which popular libraries show each failure pattern.""",
        'comment': """Ant Design, which my whole UI is built on, appears in the article's list under the open-time version of this bug. So this goes on my list: open a few of my modals with a screen reader running, check where focus lands when they open and where it returns when they close, and resist the blur() one-liner.""",
    },
    {
        'topic': 'web', 'category': 'web-platform', 'tags': ['Safari', 'JavaScript', 'Modules'],
        'title': 'Fixing Top-Level Await in Safari',
        'url': 'https://webkit.org/blog/18227/fixing-top-level-await-in-safari/',
        'source': 'WebKit Blog', 'authors': 'Kai Tamkun', 'published': '2026-09-02',
        'summary': """Safari's module loader was built on the WHATWG Loader proposal, abandoned in 2016, which predates async modules. When ES2022 added top-level await, the loader didn't follow the spec's asynchronous evaluation algorithm, so promises could resolve before a module had finished evaluating and code hit "accessed before initialization" errors.

WebKit rewrote the loader from self-hosted JavaScript into C++, translating the spec's steps directly, and tested it with cases borrowed from Bun, a module-graph fuzzer, test262 and WPT. The fix ships in Safari 27.""",
        'comment': """Bugs like this get blamed on your own code for days. I checked my front end and it has no top-level await anywhere, but it is shipped as ES modules to iPhones, and the iOS app wraps the same build in a WebKit view, so the module loader isn't an abstract concern for me.""",
    },
    {
        'topic': 'web', 'category': 'web-platform', 'tags': ['HTTP', 'Caching', 'Cloudflare'],
        'title': 'We just shipped support for the ugliest part of HTTP: Vary',
        'url': 'https://simonwillison.net/2026/Sep/23/hn-49823961/',
        'source': "Simon Willison's Weblog", 'authors': 'Simon Willison', 'published': '2026-09-23',
        'summary': """Simon highlights Cloudflare finally supporting the HTTP Vary header in its cache. Until now Cloudflare ignored Vary on anything except images, which made content negotiation unsafe behind it: serve JSON or HTML from the same URL depending on the Accept header, and the cache could hand the JSON version to a browser expecting HTML.

He had wanted this for years, but says he has since moved away from the pattern anyway, in favour of URLs that predictably return a single format, such as a .json suffix.""",
        'comment': """Cloudflare sits in front of my site too. Every API path returns JSON and the pages come from a single-page app, so I've never had one URL serving two formats, and after this I don't plan to. Giving each representation its own URL means never having to trust a cache to honour Vary correctly.""",
    },
    {
        'topic': 'web', 'category': 'web-platform', 'tags': ['Privacy', 'Cookies', 'Playwright'],
        'title': 'Testing cookie behavior across hundreds of web surfaces with our in-house auditor',
        'url': 'https://dropbox.tech/security/how-our-inhouse-auditor-tests-cookie-behavior-across-hundreds-of-web-surfaces',
        'source': 'Dropbox Tech Blog', 'authors': 'Yasmin McDowell, Lawrence Good', 'published': '2026-08-31',
        'summary': """Dropbox runs over 200 web surfaces, and checking by hand that cookie banners still honour people's choices after every change didn't scale. Their auditor uses Playwright to load each page in fresh sessions three ways (as a US visitor, as an EU visitor and with the Global Privacy Control signal), records which cookies load before anyone clicks, finds the consent controls in 22 languages, declines non-essential cookies and reloads to confirm the choice stuck.

A companion tool mines traffic data to decide which URLs need auditing, and results go out as weekly reports. The authors say the browser automation was the easy part; defining correct behaviour and weeding out false positives took the real effort.""",
        'comment': """I just checked my own site: a visitor who isn't logged in gets no cookies at all, and logging in adds a session cookie, so there's no banner to audit. What carries over is the method: load each page as different kinds of visitor in a fresh browser, record what happened before any click, then reload and check again. I already do a small version of that with headless Chrome and different browser languages.""",
    },

    # =====================================================================  Search & RecSys
    {
        'topic': 'recsys', 'category': 'rs-rec', 'tags': ['Recommendation', 'Transformers', 'Homepage'],
        'title': 'GenPage: Towards End-to-End Generative Homepage Construction at Netflix',
        'url': 'https://netflixtechblog.com/genpage-towards-end-to-end-generative-homepage-construction-at-netflix-77146fba8a08',
        'source': 'Netflix TechBlog', 'authors': 'Lequn Wang, Jiangwei Pan, Linas Baltrunas', 'published': '2026-06-29',
        'summary': """Netflix replaced parts of its multi-stage homepage stack with a single decoder-only transformer that writes the whole page, rows and the titles inside them, one token at a time, conditioned on the user's history and the request. A custom tokenizer squeezes an event like "watched this show for 50 minutes 30 days ago" into 4 tokens instead of 16 text tokens. Training follows the LLM recipe: next-token pretraining, then weighted binary classification or RL post-training against a page-level reward.

Business rules are enforced with constrained decoding that masks ineligible tokens, new titles get content-based embeddings plus fallback tokens, and only the first few titles of each row are decoded one by one. In a 14-day A/B test it beat the production system on the core engagement metric (p < 0.001) while cutting serving latency by 20%. Offline, enriching the prompt helped far more than scaling the model (about 6.9% lower loss, against 1.3% for going from 120M to 900M parameters), and RL raised page diversity even though diversity wasn't in the objective.""",
        'comment': """This is the post I keep coming back to while planning a cross-topic home feed for this site, at a scale many orders of magnitude smaller. Two ideas survive the shrink. Business rules belong in a separate masking step rather than in the scoring formula, which is how I'll keep private topics out of the public feed. And richer context beating a bigger model says my first job is logging better signals, not picking a clever algorithm.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-search', 'tags': ['Hybrid search', 'Ranking', 'RRF'],
        'title': 'Reciprocal rank fusion: why combining search results is harder than it looks',
        'url': 'https://redis.io/blog/reciprocal-rank-fusion/',
        'source': 'Redis Blog', 'authors': 'Jeff Mills', 'published': '2026-08-09',
        'summary': """Adding BM25 and cosine-similarity scores to merge keyword and vector results usually goes wrong: BM25 has no fixed range and often dwarfs cosine values, normalization is fragile, and both distributions drift as the index or the embedding model changes. Reciprocal rank fusion ignores scores and uses positions only: each list contributes 1/(k + rank), with k usually set to 60.

A document ranked 2nd by keyword search and 5th by vector search scores about 0.0315 and beats one ranked 1st by a single retriever (about 0.016), so agreement wins. The post's practical point is that fusion is cheap arithmetic; retrieval latency is where hybrid search succeeds or fails.""",
        'comment': """I'll probably use RRF for my home feed rather than for search. The candidate lists I'm planning (hottest, newest, editors' picks, people you follow) have completely different scores, and fusing by rank sidesteps that. Worked example to check myself: a post ranked 3rd in hot and 1st in new gets 1/63 + 1/61, about 0.0323, while a post that is only top of hot gets 1/61, about 0.0164.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-search', 'tags': ['Embeddings', 'ColBERT', 'Retrieval'],
        'title': 'Multi-Vector (Late Interaction) Embedding Models with Sentence Transformers',
        'url': 'https://huggingface.co/blog/multi-vector-encoder',
        'source': 'Hugging Face Blog', 'authors': 'Tom Aarsen, Antoine Chaffin, Raphael Sourty and contributors', 'published': '2026-08-18',
        'summary': """Single-vector embedding models squash a whole passage into one vector; multi-vector (late interaction, ColBERT-style) models keep one small vector per token and score with MaxSim: for each query token, take its best match among the document's tokens, then sum. Sentence Transformers v6 adds a MultiVectorEncoder model type alongside dense, sparse and reranker models, with support for existing ColBERT and PyLate checkpoints and ColPali models that match page images without OCR.

The cost is storage. On a 4,874-passage Natural Questions set, the multi-vector index took 311.5 MB against 7.5 to 15 MB for dense models (about 92 MB after PLAID compression). In return, the LateOn model beat its dense sibling on 9 of 13 NanoBEIR datasets at the same 149M parameters.""",
        'comment': """The storage numbers are the honest part: about 42 times the index size for a modest accuracy gain at the same model size. Search on my site runs on Elasticsearch with a Chinese analyzer over fewer than 200 posts, so I'm nowhere near needing this, but MaxSim is a neat idea: exact identifiers survive because each token keeps its own vector instead of being averaged away.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-search', 'tags': ['Query expansion', 'Distillation', 'Diffusion'],
        'title': 'Bypassing inference bottlenecks: Accelerating complex AI search with Retrieve-for-Train',
        'url': 'https://research.google/blog/bypassing-inference-bottlenecks-accelerating-complex-ai-search-with-retrieve-for-train/',
        'source': 'Google Research Blog', 'authors': 'Pengcheng Jiang, Judith Yue Li', 'published': '2026-09-15',
        'summary': """Some searches want a set of results, like a whole outfit or a playlist. Models asked to break such a query into sub-queries tend to produce near-synonyms ("paraphrastic collapse") and are slow to decode. Retrieve-for-Train trains a fan-out language model with RL on a mix of groundedness, diversity and alignment rewards, uses it to synthesize training pairs offline, then distills that behaviour into a 53.9M-parameter diffusion model that produces all the sub-queries in one pass.

The result is 12 to 20 times faster than autoregressive approaches, staying between sub-second and a few seconds where they reach about 50 seconds under large batches, with better diversity and recall. It was evaluated on fashion outfits and music playlists.""",
        'comment': """The pattern is worth remembering even without the diffusion part: do the expensive reasoning offline, keep its output as training data, and serve something small and fast. It's the same split I'm planning for my feed, where scores get recomputed when a like or comment arrives, not when someone opens the page.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-exp', 'tags': ['A/B testing', 'Statistics'],
        'title': 'Why Spotify Is Not Using Bayesian A/B Testing',
        'url': 'https://engineering.atspotify.com/2026/9/why-spotify-is-not-using-bayesian-a-b-testing/',
        'source': 'Spotify Engineering', 'authors': 'Mattias Frånberg, Mårten Schultzberg', 'published': '2026-09-08',
        'summary': """Spotify explains why its experimentation platform stays frequentist. Most Bayesian setups offered by commercial platforms (flat priors with stopping on a posterior probability) give numerically the same answers as frequentist tests, so they add little except a second way to plan, monitor and read experiments.

The configuration that would control false positives under peeking, stopping on a Bayes factor, wasn't offered by the platforms they examined, and expected-loss stopping can produce false positive rates around 50% when there is no real effect. Well-calibrated empirical Bayes priors could help, but they need upward of 200 past experiments per metric and program, and badly pooled priors can make results worse.""",
        'comment': """My site has nowhere near the traffic for an A/B test to mean anything, and I'd rather say that up front than dress up noise. The useful bit for me is the peeking warning: if I ever compare two feed rankings, I'll fix the sample size and the stopping rule before looking at a single number.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-rec', 'tags': ['LLM recommenders', 'Ranking'],
        'title': 'When History Misleads: Asymmetric Margin Supervision for Instruction-Guided LLM Generative Recommendation',
        'url': 'https://arxiv.org/abs/2610.02600',
        'source': 'arXiv', 'arxiv': '2610.02600 [cs.IR]',
        'authors': 'Ming Yin, Yuhan Yang, Chen Chen, Xinyu Lin, Wentao Shi, Fangcong Yin, Chaofei Yang, Chao Yang, Jiyan Yang, Hui Zhang, Ning Jiang, Yiran Chen, Qifan Wang',
        'published': '2026-10-05',
        'summary': """In short: when a user's history and their current request disagree, LLM recommenders tend to follow the history. AIMS turns "what if this history event were removed" into a training signal, and leaves inference unchanged.""",
        'abstract': """In instruction-guided generative recommendation, LLM-based recommenders need to balance two goals: responding to the user's current request and aligning with the preferences in their interaction history. When the two conflict, history events can override the request. We show that turning the effect of individual history events into supervision faces two obstacles. First, the events that most influence a recommendation are not necessarily the ones that support the target item. Second, removing a misleading event can raise the target's score but a competing item's score even more, so a higher target score alone does not guarantee a better ranking. We propose Asymmetric Intervention-Guided Margin Supervision (AIMS), which converts the effect of removing individual history events into ranking supervision. For training requests already ranked correctly, a frozen reference model identifies request-specific deletions that improve both the target's score and its margin over a competitor near the recommendation cutoff. These margins serve as training targets, while the complete history is retained as input. Training combines cross-entropy with an asymmetric auxiliary loss that penalizes margin shortfalls and routes its gradient only through the competitor score. Inference is unchanged, requiring no history editing or deletion search. Across six LLM backbones on an industrial dataset and two public benchmarks, AIMS improves Recall and NDCG over strong baselines. Ablations support request-specific margins and asymmetric supervision, and the selected deletions preferentially remove constraint-violating history.""",
        'comment': """The second obstacle they describe is subtle and worth remembering: removing a misleading event can raise the target item's score and raise a competitor's even more, so a higher score alone doesn't mean a better ranking. Margins over the nearest competitor, not raw scores, decide a top-k list.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-search', 'tags': ['Vector search', 'Theory'],
        'title': 'Learning Query Encoders Can Be Hard Even When Vector Retrieval Is Geometrically Easy',
        'url': 'https://arxiv.org/abs/2610.02749',
        'source': 'arXiv', 'arxiv': '2610.02749 [cs.IR, cs.LG]',
        'authors': 'Anders Wikum, Nina Mishra, Amin Saberi, Tal Wagner', 'published': '2026-10-05',
        'summary': """In short: on several real benchmarks the document index could support far better recall than today's single-vector query encoders reach, and the authors give theoretical evidence that learning a good query encoder can be computationally hard.""",
        'abstract': """Efficient vector retrieval requires both a corpus geometry that supports retrieving the right documents through vector similarity, and a query encoder that can embed queries near their desired documents in the embedding space. Recent work has studied geometric capacity through the lens of the minimum embedding dimension needed to realize all top-$k$ answer sets of $n$ documents. We study a different notion of geometric capacity--the maximum recall achievable for a frozen document index--and explore whether learned query encoders can reach this ceiling. On several real-world retrieval benchmarks, we show that retrieval quality of single-vector query encoders often lies far below what the document indices can support. Motivated by this observation, we give theoretical evidence that learning query encoders can be computationally hard. In particular, we construct a retrieval task that (1) admits a query encoder with perfect recall which is representable by a small one-hidden-layer ReLU network, but (2) any statistical-query learner (a class capturing learners that access training data through aggregate statistics) provably requires exponentially many statistical queries to achieve non-trivial recall advantage over the random baseline $k/n$. Taken together, our results suggest substantial unrealized geometric capacity in retrieval benchmarks and establish query encoder learnability as a possible barrier in embedding-based retrieval.""",
        'comment': """A nice reframing of where retrieval quality gets lost. The index isn't the bottleneck; turning a messy question into the right point in space is. It pairs well with the Google factuality post in the AI topic: the knowledge is stored, and getting to it is the hard part.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-search', 'tags': ['Multilingual', 'LoRA', 'Retrieval'],
        'title': 'Query-aware routing for Cross-lingual performance gains in Encoders',
        'url': 'https://arxiv.org/abs/2610.02875',
        'source': 'arXiv', 'arxiv': '2610.02875 [cs.CL, cs.AI, cs.IR]',
        'authors': 'Akshay Jain, Edward Kim', 'published': '2026-10-05',
        'summary': """In short: a small query-only adapter, used only when the query and the documents are in different languages, lifted cross-lingual retrieval by about 21% without touching the document index or the same-language results.""",
        'abstract': """Multilingual encoders can exhibit reduced retrieval effectiveness when queries and relevant documents differ in language, despite strong same-language performance. We investigate whether Finnish and Swedish cross-lingual retrieval can improve while preserving an encoder's existing same-language performance and document index. We combine a query-only low-rank adapter, trained against frozen document embeddings, with deterministic routing based on query and index languages. Cross-language queries use the adapter, while same-language queries use the original encoder. SampoTron, our fine-tuned low-rank (LoRA) adapter alongwith the Nemotron-3-Embed-1B model, improves average retrieval quality across six English, Finnish, and Swedish directions from 0.241 to 0.291 in normalized discounted cumulative gain (nDCG) at rank ten, a 20.9% relative gain on a sampled financial benchmark. All six cross-lingual directions improve, and routing preserves the original same-language performance, including two full-corpus Finnish evaluations. The approach enables selective cross-language specialization with reusable document embedding vectors.""",
        'comment': """This one maps straight onto my site, which has Chinese posts behind an English interface. Searching in English for a Chinese post usually finds nothing today. The routing idea is pleasantly unglamorous: detect the query language, and only take the special path when it differs from the document's.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-rag', 'tags': ['RAG', 'On-premises', 'Education'],
        'title': 'On-Premises Multi-Course RAG Tutoring for Business Education: Hardware-Software Trade-offs in a Campus AI Tutor',
        'url': 'https://arxiv.org/abs/2610.02510',
        'source': 'arXiv', 'arxiv': '2610.02510 [cs.AI, cs.IR]',
        'authors': 'Sidney Shapiro, Joshua Lindemann', 'published': '2026-10-05',
        'summary': """In short: a university ran its own RAG tutor for six business courses on local hardware (FastAPI, a local vector database and models served by Ollama). Bigger models often failed the classroom speed limit, and the team kept an 8B model until a replacement was shown to be better overall.""",
        'abstract': """Campus AI tutors based on retrieval-augmented generation (RAG) must ground answers in assigned course materials while keeping textbooks and student dialogue on institutional infrastructure. We present CourseChat, an on-premises, multi-course RAG tutor for undergraduate business education, deployed behind a campus web gateway and intended for use embedded in Moodle. Six isolated course offerings, each keyed by its own course reference number (CRN), share twin-edge AI hosts running a FastAPI service, a local vector database, and a local large language model (LLM) served by Ollama. We report two generation-model bake-off rounds, a separate fixed-evidence source-fidelity comparison, and conversation and quiz audits. Several larger models failed the classroom speed gate, but a 12B model and a 7B alternative passed. A separate mixture-of-experts candidate improved some corrections while introducing new factual and continuity errors. We therefore retain the 8B production model pending a demonstrated overall improvement, rather than claiming that 8B is universally optimal. Software changes improved follow-up topic resolution while preserving course scope; 435 prebuilt questions across 65 modules decouple practice from live generation. The results support treating model choice, evidence selection, serving compatibility, and product design as a joint engineering decision. They do not establish learning gains: faculty ratings, peak-load capacity, and complete public-gateway acceptance remain separate evaluation needs.""",
        'comment': """As a student who runs a site on a mini PC, I enjoyed this one more than most. Their refusal to call the 8B model "optimal" is the right instinct, and so is the explicit list of things they did not measure. A few of my course groups already share their materials on this site, so a tutor grounded in exactly those files is a tempting side project.""",
    },
    {
        'topic': 'recsys', 'category': 'rs-search', 'tags': ['Reranking', 'LLMs'],
        'title': 'More Efficient LLM Reranking with Whole-Pool, Setwise, Long-Context Language Models',
        'url': 'https://arxiv.org/abs/2606.01782',
        'source': 'arXiv', 'arxiv': '2606.01782 [cs.IR], version 2',
        'authors': 'Hang Li, Chuting Yu, Bevan Koopman, Guido Zuccon', 'published': '2026-10-05',
        'summary': """In short: when all 100 candidates fit in a long-context model's window, rank from both ends at once. DualEnd builds a full ranking in 50 comparisons, roughly halving tokens and time compared with ranking from the top only.""",
        'abstract': """LLM-based re-rankers produce a rankings through repeated local comparisons (listwise, pairwise or pointwise), requiring many sequential model calls. We study how long-context LLMs can drastically reduce this computation when the entire retrieved candidate pool fits within the context window. We introduce Whole-Pool Setwise re-ranking, where each comparison ranks all the entire candidate pool, and propose DualEnd, which jointly selects the candidates predicted to be most and least relevant. By filling the ranking from both ends, DualEnd constructs a complete ranking of 100 candidates in 50 LLM comparisons. Experiments with nine open-weight LLMs on TREC DL19 and DL20 show that this requires 59.4% fewer comparisons than previous top-oriented windowed Setwise with heapsort and 88.8% fewer than top-oriented windowed Setwise with bubblesort, even though those baselines target only the top-10 rankings while DualEnd targets the full ranking. DualEnd's nDCG@100 is within 0.008 of single-end whole-pool top-oriented approach, while approximately halving its token consumption and ranking time. Across six BEIR datasets, DualEnd reduces mean token consumption and ranking time by 49.4% and 50.8%, respectively, relative to single-end whole-pool top-oriented approach. These results demonstrate that DualEnd Setwise enables complete re-ranking with substantially fewer LLM comparisons and competitive effectiveness across several backbones.""",
        'comment': """Filling a ranking from both ends is the kind of idea that only sounds obvious once someone writes it down. A hundred candidates in fifty comparisons is a good reminder that the cost of LLM reranking is mostly the number of calls, not the size of each one.""",
    },

    # =====================================================================  Release Notes
    {
        'topic': 'releases', 'category': 'rel-backend', 'tags': ['Spring Boot', 'Java'],
        'title': 'Spring Boot 4.1.0',
        'url': 'https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.1-Release-Notes',
        'source': 'Spring Boot release notes', 'authors': '', 'published': '2026-06-10',
        'summary': """Spring Boot 4.1.0 shipped on 10 June 2026. The headline additions include first-class Spring gRPC support (Netty or Servlet over HTTP/2), Jackson read and write features configurable from properties, an InetAddressFilter for blocking outgoing requests to chosen addresses as an SSRF mitigation, lazy JDBC connections through spring.datasource.connection-fetch, @RedisListener auto-configuration and process details such as uptime, timezone and locale in the info endpoint.

Everything that was deprecated in 4.0 has now been removed, Derby support is deprecated, and the old layertools jar mode is gone in favour of tools.""",
        'link_text': 'Spring Boot 4.1 release notes',
        'comment': """My backend is still on Spring Boot 2.7.6, two major versions behind. The official migration guide is clear about the first step: get onto the latest 2.7.x, then move to 3.0, which needs Java 17 and switches every javax.* import to jakarta.*. I'm already on Java 17, so the real work is the namespace change through my servlet filters, MyBatis-Plus and the Elasticsearch client. Of the 4.1 additions, the SSRF filter is the one I'd want first.""",
    },
    {
        'topic': 'releases', 'category': 'rel-frontend', 'tags': ['React'],
        'title': 'React 19.3',
        'url': 'https://react.dev/blog/2026/09/09/react-19-3',
        'source': 'React Blog', 'authors': 'The React Team', 'published': '2026-09-09',
        'summary': """React 19.3 makes two features stable. <ViewTransition> animates components entering, leaving, moving or resizing with the browser's View Transition API, triggered by Transitions, Suspense reveals or useDeferredValue, and addTransitionType allows direction-aware animations such as forward and back. Fragment refs let a ref attach to a <Fragment> and act on its children as a group (events, focus, observers and measurement) without a wrapper element.

React DOM also gains a browser() helper that keeps browser-only components out of server rendering, plus support for Trusted Types, and Server Components can now render a Context directly. The post lists no breaking changes.""",
        'link_text': 'Read the React 19.3 post',
        'comment': """I deleted my site's page-change animation in July because only the incoming page moved while the old one simply vanished, which looked like a glitch. Doing it properly meant keeping both pages on screen during the switch, and that's close to what a stable <ViewTransition> gives you. I'm on 19.2.4, so this is a minor bump I actually want to try.""",
    },
    {
        'topic': 'releases', 'category': 'rel-frontend', 'tags': ['Ant Design', 'React'],
        'title': 'Ant Design 6.6.0',
        'url': 'https://github.com/ant-design/ant-design/releases/tag/6.6.0',
        'source': 'Ant Design release notes', 'authors': '', 'published': '2026-08-10',
        'summary': """Ant Design 6.6.0 introduces Listy, a virtualized list component with grouping, sticky headers and imperative scrolling. ConfigProvider gains a shared focusOutline token, a global variant setting for Input.Search, Input.Password and Input.OTP, and global hover delays for Tooltip, Popover and Popconfirm.

Smaller additions include useTree with scrollTo({ autoExpand: true }) for Tree, a scroll-progress ring on FloatButton.BackTop, expandable.forceRender for Table, an Albanian locale, nativeElement refs on many components, and a fix for the Button layout shift when the loading animation starts.""",
        'link_text': 'Release notes on GitHub',
        'comment': """I'm on Ant Design 5.29, a major version behind, and the whole UI of this site sits on it, so 6.x will be a planned migration rather than a bump. Listy is the feature that would make me schedule it: the cross-topic feed I'm planning will be longer than any list on the site today, and sticky group headers are what a feed grouped by day needs.""",
    },
    {
        'topic': 'releases', 'category': 'rel-frontend', 'tags': ['axios', 'Security'],
        'title': 'axios v1.20.0',
        'url': 'https://github.com/axios/axios/releases/tag/v1.20.0',
        'source': 'axios release notes', 'authors': '', 'published': '2026-08-19',
        'summary': """axios 1.20.0 hardens how runtime options are read against shared and foreign prototype pollution and normalizes unsafe interceptor replacement objects. It adds the RFC 9110 status names ContentTooLarge (413) and UnprocessableContent (422), keeping the old names as deprecated aliases.

Fixes include keep-alive sockets no longer pinning completed response data in Node.js, navigation-cancelled XHR requests rejecting with ECONNABORTED instead of resolving with status 0, ejected interceptors no longer growing the handler array without bound, and a corrected timeoutErrorMessage merge.""",
        'link_text': 'Release notes on GitHub',
        'comment': """I'm on 1.17.0, and my whole API layer runs through one axios instance with request and response interceptors: attach the login token, unwrap our response shape, redirect on 401. I never eject an interceptor, so the unbounded-growth bug doesn't apply, but the prototype-pollution hardening is reason enough to bump.""",
    },
    {
        'topic': 'releases', 'category': 'rel-backend', 'tags': ['MyBatis-Plus', 'Java'],
        'title': 'MyBatis-Plus v3.5.17',
        'url': 'https://github.com/baomidou/mybatis-plus/releases/tag/v3.5.17',
        'source': 'MyBatis-Plus release notes', 'authors': '', 'published': '2026-07-08',
        'summary': """The upstream notes list fixes for the multi-tenant plugin with @Many mappings, a HashMap type-handler error, schema checks in the full-table interception plugin, saveOrUpdateBatch running the ParameterHandler twice, GraalVM native compilation, and duplicate package names under JDK 9+ modules (some packages in the mybatis-plus-spring module were renamed as a result).

New features include XML alias configuration for wrappers, a native-image starter module for GraalVM, automatic typeHandler detection in Wrapper, an eqOrIsNull comparison, Groovy and Kotlin support for LambdaQueryWrapper, and caching in the enum type handler. The SQL injector, the part that generates the built-in CRUD statements, now builds SQL with function calls instead of String.format.""",
        'link_text': 'Release notes on GitHub',
        'comment': """I'm on MyBatis-Plus 3.3.2, old enough that this changelog reads like a different library. Two lines connect to the Netflix modules post in the Engineering topic: duplicate packages under JDK 9+ modules, and a native-image starter. Both only matter once an app leaves the plain class path, which my backend hasn't done yet.""",
    },
    {
        'topic': 'releases', 'category': 'rel-data', 'tags': ['Elasticsearch', 'Search'],
        'title': 'Elasticsearch 9.5.0',
        'url': 'https://www.elastic.co/docs/release-notes/elasticsearch#elasticsearch-9.5.0-release-notes',
        'source': 'Elastic release notes', 'authors': '', 'published': '2026-08-04',
        'summary': """Highlights of Elasticsearch 9.5.0 include batched execution in the query phase, so a search across many shards makes one round trip per data node; reindexing that survives node shutdowns, plus pagination based on point-in-time; data stream lifecycle support for moving ageing data to the frozen tier; and a date_range field type in technical preview.

ES|QL can now read flattened fields and, experimentally, query external data such as files in Amazon S3. Time-series data streams handle cumulative and delta metrics natively, and a columnar index mode is in technical preview for smaller storage.""",
        'link_text': 'Elasticsearch release notes',
        'comment': """Elasticsearch on my side is still 7.17.16 with the IK Chinese analyzer plugin, and since a plugin has to match the server version exactly, upgrading means upgrading both. It stores a few hundred small documents in a single primary shard, so batched shard round trips are nothing I'd notice. When I priced a move to AWS, I chose to replace it with MySQL full-text search rather than upgrade, which says more about my data size than about Elasticsearch.""",
    },
    {
        'topic': 'releases', 'category': 'rel-data', 'tags': ['Redis'],
        'title': 'Redis 8.10',
        'url': 'https://github.com/redis/redis/releases/tag/8.10.0',
        'source': 'Redis release notes', 'authors': '', 'published': '2026-07-29',
        'summary': """Redis 8.10 adds compact hashes, a new encoding that stores field names only once for keys that share the same set of fields, along with HIMPORT for high-throughput bulk insertion into them.

Other additions: TLS certificate-based authentication between servers, LMOVEM and BLMOVEM for moving several list elements at once, SUNIONCARD and SDIFFCARD for set cardinalities, a node-side BACKUP command built on multi-part AOF, MAXCOUNT and MAXSIZE caps for XREAD and XREADGROUP, JSONPath extensions, and new time-series range and query commands.""",
        'link_text': 'Release notes on GitHub',
        'comment': """Redis on my server reports 8.8.1, a version that arrived through the floating redis:alpine tag rather than by choice, which is its own lesson about pinning images. Spring Session stores each login as a hash with the same six fields, exactly the shape compact hashes target, but right now there are four of them, so there's nothing to save. The BACKUP command interests me more: my nightly backup covers MySQL and uploaded files, but not Redis.""",
    },
    {
        'topic': 'releases', 'category': 'rel-data', 'tags': ['RabbitMQ', 'Messaging'],
        'title': 'RabbitMQ 4.3.6',
        'url': 'https://github.com/rabbitmq/rabbitmq-server/releases/tag/v4.3.6',
        'source': 'RabbitMQ release notes', 'authors': '', 'published': '2026-09-14',
        'summary': """A maintenance release in the 4.3 series. It requires Erlang 27.0 or later (nodes won't start on older versions), and the maintainers strongly recommend reading the 4.3.0 notes when upgrading from anything earlier.

Fixes include deleting an exchange now also removing the bindings that pointed to it, quorum queues no longer adding more replicas than the target, and stream max-age values compared as durations, so 1D equals 24h. New settings: channel_tx_message_max caps the publishes buffered in an AMQP 0-9-1 transaction (default 10,000), and listeners.startup_delay holds off client listeners while a node finishes booting. Several channel interceptors can now coexist using priorities.""",
        'link_text': 'Release notes on GitHub',
        'comment': """I'm on 3.13.7 through the rabbitmq:3-management image, so 4.x is a major jump, and these notes make clear it starts with Erlang and the 4.3.0 notes rather than with my code. My app's queue listeners connect to the broker as soon as its container starts, so listeners.startup_delay is the setting I'd look at first.""",
    },
    {
        'topic': 'releases', 'category': 'rel-ops', 'tags': ['Docker', 'Compose'],
        'title': 'Docker Compose v5.6.0',
        'url': 'https://github.com/docker/compose/releases/tag/v5.6.0',
        'source': 'Docker Compose release notes', 'authors': '', 'published': '2026-10-02',
        'summary': """Compose v5.6.0 adds partial support for jobs: manually triggered jobs work now, while scheduled jobs wait on support in Docker Engine. Provider services gain a configuration request, a network relay and on-demand image distribution.

Compose now warns about compose-file attributes it doesn't support, makes PRIVATE_PORT optional for docker compose port, coalesces rebuilds during bursts of file changes in watch mode, and notices containers that were stopped or removed outside Compose while up is running.""",
        'link_text': 'Release notes on GitHub',
        'comment': """Six Compose projects on one mini PC make up my whole stack, deployed with docker compose up -d --build app, so I read these closely. Jobs are the part I'd use: my nightly backup runs from a systemd timer on the host, and once scheduled jobs land it could live next to the containers it backs up. I'm on v5.3.1.""",
    },
    {
        'topic': 'releases', 'category': 'rel-ops', 'tags': ['Cloudflare', 'Tunnels'],
        'title': 'cloudflared 2026.9.3',
        'url': 'https://github.com/cloudflare/cloudflared/releases/tag/2026.9.3',
        'source': 'cloudflared release notes', 'authors': '', 'published': '2026-09-24',
        'summary': """The 2026.9 releases of cloudflared carry the client side of Protected Quick Tunnels. 2026.9.0 negotiates protected mode when a Quick Tunnel is provisioned and reports edge registration errors over QUIC more clearly, and 2026.9.1 deprecates the transport log level option.

2026.9.2 holds most of the authentication work: browser-bound login state, validating and caching the broker's signing keys, enforcing authentication before any request reaches the origin, stripping authentication data before forwarding, and limits on response size and on the supplied email list. 2026.9.3 updates dependencies and is the minimum version for the new --allowed-mail flag.""",
        'link_text': 'Release on GitHub',
        'comment': """The tunnel that carries this whole site runs cloudflared 2026.7.3 from the cloudflare/cloudflared:latest image, and that tag only moves when I explicitly pull it. So I'm a couple of months of fixes behind, including this whole authentication series. Pinning a version and upgrading on purpose would at least make the gap visible.""",
    },
]
