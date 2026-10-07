/**
 * 全站主题（antd v5 Design Token）。
 * antd v5 不再用 less 覆盖样式，而是"设计令牌"：在 ConfigProvider 上改一份 token，
 * 按钮/链接/选中态/表头等所有组件的派生色（hover、浅色底、边框）自动跟着算出来。
 * 主色是浅一档的蓝（blue-5 #4096ff）。2026-10-08 以前是「篮球橙」（volcano-6 #fa541c），按用户要求整站换成蓝色；
 * 当天又按用户要求调浅、并收着用：大色块改成淡蓝底配深色字，NBA 页面的名字和数字用正文黑色（见 vault 84）。
 * 第一次换色时，代码里写死的橘色按同一档位换成了蓝色，带含义的颜色（头衔调色板、评分分档、对比页两侧等）没动，见 vault 83。
 */
export const themeConfig = {
  token: {
    colorPrimary: '#4096ff', // 浅一档的蓝（blue-5）
    colorInfo: '#4096ff',
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Layout: {
      bodyBg: '#f5f5f5', // 内容区灰底，让白色卡片"浮"出来
      // antd 的 Layout.Sider 默认底色是深藏青 #001529（后台系统的经典深色侧栏）。
      // 桌面端 ProLayout 自己的白底盖住了它，但移动端菜单是 Drawer，盖不住——
      // 于是浅色主题的深灰菜单字压在藏青底上，整片菜单看不清。从根上改成白底。
      siderBg: '#ffffff',
    },
    Card: {
      borderRadiusLG: 12,
    },
  },
}
