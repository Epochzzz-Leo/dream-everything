import { ConfigProvider, Segmented } from 'antd'

/**
 * 品牌色胶囊分段器（全站统一的"现代化 Tab"）：
 * options: [{ value, icon, label }]。选中=主色圆角滑块白字，浅灰内凹轨道。
 */
export default function PillTabs({ value, onChange, options, style }) {
  return (
    <ConfigProvider
      theme={{
        token: { borderRadius: 22, borderRadiusSM: 18 },
        components: {
          Segmented: {
            itemSelectedBg: '#1677ff',
            itemSelectedColor: '#ffffff',
            trackBg: '#efefef',
            itemColor: '#666',
            itemHoverColor: '#1677ff',
            itemHoverBg: 'rgba(22,119,255,0.08)',
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
