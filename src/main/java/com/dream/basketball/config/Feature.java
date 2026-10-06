package com.dream.basketball.config;

import com.dream.basketball.entity.DreamUser;

/**
 * 按用户开关的功能模块。规则写在这里一处，接口侧只挂 {@link RequiresFeature}。
 *
 * 目前只有 NBA 数据一项挂了后端门禁。它和百家说、新闻、私信、日程现在是同一套语义：
 * **默认开**——谁都能用，包括没登录的访客；超管可以对某个登录用户显式关掉（值为 '0'）。
 *
 * {@link #granted} 收到 null 表示「没登录的访客」。返回 true 的模块，拦截器对访客直接放行，
 * 不再回 401。
 */
public enum Feature {

    /**
     * NBA 数据模块（dream_user.FEAT_DATA）：联盟概览 / 数据概览 / 联盟排行 / 每日赛场 /
     * 历史数据 / 球员对比。
     *
     * **对所有人公开（2026-10-06）**：访客不登录也能看。空值 = 没设置过 = 能用；
     * 超管仍可对个别登录用户写 '0'，效果是对这个人隐藏（他退出登录照样能看，所以这只是
     * 「不想看就别显示」，不是访问控制）。
     *
     * 演变：最早公开 → 「默认关、超管逐个放行」→ 「必须登录 + 默认放行」（入口挪进 NBA 专题）
     * → 现在对访客也公开，为了让从简历点进来的人不登录就能看到这个模块。
     * 原来要求登录，一个理由是挡住「匿名一口气拖走整库」的请求；现在换成了别的办法：
     * 没登录的请求按 IP 限流（{@link GuestRateLimitInterceptor}），单次最多返回 2,000 行
     * （见 PlayerController.MAX_PAGE_SIZE）。
     *
     * 数据来自 Basketball-Reference 和 ESPN，页面底部标注了来源；Sports Reference 的条款
     * 要求转用数据时注明来源，详见 vault《79-推荐首页规划》第九章。
     */
    NBA_DATA {
        @Override
        public boolean granted(DreamUser user) {
            return user == null || !"0".equals(user.getFeatData());
        }
    };

    /**
     * 该用户能不能用这个模块。user 为 null 表示没登录的访客。
     * 超管豁免由调用方负责（拦截器里先判了超管，不会走到这里）。
     */
    public abstract boolean granted(DreamUser user);
}
