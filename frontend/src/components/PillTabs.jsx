import { ConfigProvider, Segmented } from 'antd'

/**
 * 品牌色胶囊分段器（全站统一的"现代化 Tab"）：
 * options: [{ value, icon, label }]。选中=白色圆角滑块深色字，浅灰内凹轨道。
 */
export default function PillTabs({ value, onChange, options, style }) {
  return (
    <ConfigProvider
      theme={{
        token: { borderRadius: 22, borderRadiusSM: 18 },
        components: {
          Segmented: {
            // 选中 = 灰轨道上一块白色滑块、深色字（2026-10-08 起不再用实心主色块）
            itemSelectedBg: '#ffffff',
            itemSelectedColor: '#1f1f1f',
            trackBg: '#efefef',
            itemColor: '#666',
            itemHoverColor: '#1f1f1f',
            itemHoverBg: 'rgba(0,0,0,0.04)',
          },
        },
      }}
    >
      <Segmented
        size="large"
        value={value}
        onChange={onChange}
        style={{ marginBottom: 16, padding: 4, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.04)', ...style }}
        options={options.map((o) => ({
          value: o.value,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
              {o.icon} {o.label}
            </span>
          ),
        }))}
      />
    </ConfigProvider>
  )
}
