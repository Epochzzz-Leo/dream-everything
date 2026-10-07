import { useState } from 'react'
import { Col, Modal, Row, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import useIsMobile from '../../hooks/useIsMobile'

/**
 * 高阶数据说明书：全站唯一一份解释文案。
 *
 * 三个出口共用同一份定义，改文案只改这里：
 *   · <GlossaryIcon />        资料卡「高阶数据」标题旁的问号
 *   · <GlossaryButton />      数据表工具条上的「指标说明」
 *   · withGlossary(columns)   表头虚下划线，悬停/点按出小卡片
 *
 * 口径全部跟 Basketball-Reference 官网一致（数据也是从那儿来的），
 * 刻度取 B-R 自己给的参考线，不是我们自己拍的。
 */

const GROUPS = [
  {
    group: 'Overall Value',
    color: '#4096ff',
    intro: 'One number for overall contribution, comparable across positions',
    items: [
      {
        field: 'playerPerReal', label: 'PER', en: 'Player Efficiency Rating',
        desc: 'Adds up the good things (points, rebounds, assists, steals, blocks), subtracts missed shots, turnovers and fouls, then puts it on a per-minute basis. It is recalibrated every season so the league average is exactly 15, which makes different eras directly comparable.',
        scale: [['15', 'League avg'], ['18', 'Team\'s #2'], ['22', 'All-Star'], ['25', 'MVP candidate'], ['30+', 'Historic season']],
      },
      {
        field: 'playerBpm', label: 'BPM', en: 'Box Plus/Minus',
        desc: 'How many more points per 100 possessions the team gets with him on the floor than an average team would. It is estimated from box score stats rather than real plus-minus, which has the upside of depending less on how good his teammates are.',
        scale: [['0', 'League avg'], ['+2', 'Quality starter'], ['+4', 'All-Star'], ['+8', 'MVP season'], ['+10', 'Historic']],
      },
      {
        field: 'playerObpm', label: 'OBPM', en: 'Offensive BPM',
        desc: 'The offensive half of BPM: how many extra points per 100 possessions he adds to the team\'s offense.',
        scale: [['0', 'League avg'], ['+5', 'Elite scorer']],
      },
      {
        field: 'playerDbpm', label: 'DBPM', en: 'Defensive BPM',
        desc: 'The defensive half of BPM. Offensive BPM + Defensive BPM = BPM.',
        scale: [['0', 'League avg'], ['+3', 'Elite defender']],
      },
      {
        field: 'playerVorp', label: 'VORP', en: 'Value Over Replacement Player',
        desc: 'How much more he contributes than a "replacement player" who could be signed from the G League at any time. The baseline is set at a BPM of −2.0, then multiplied by his share of minutes and the length of the season, so players who stay healthy and play a lot score higher.',
        scale: [['0', 'Replacement level'], ['2', 'Starter'], ['5', 'All-Star'], ['8+', 'MVP level']],
      },
      {
        field: 'playerWs', label: 'Win Shares', en: 'Win Shares (WS)',
        desc: 'Splits the team\'s wins among its players according to their contribution. Added up across the roster it comes to roughly the team\'s win total, so it is closely tied to team record, and the best players on weak teams lose out.',
        scale: [['5', 'Starter'], ['10', 'All-Star'], ['15+', 'MVP level']],
      },
      {
        field: 'playerOws', label: 'Off. Win Shares', en: 'Offensive Win Shares',
        desc: 'The part of Win Shares earned on offense.',
      },
      {
        field: 'playerDws', label: 'Def. Win Shares', en: 'Defensive Win Shares',
        desc: 'The part earned on defense. Offensive + Defensive = Win Shares.',
      },
      {
        field: 'playerWs48', label: 'WS/48', en: 'Win Shares per 48 Minutes',
        desc: 'Wins contributed per full game (48 minutes). It takes playing time out of the picture, so bench players and starters can be compared fairly.',
        scale: [['.100', 'League avg'], ['.200', 'All-Star'], ['.250+', 'Historic']],
      },
    ],
  },
  {
    group: 'Scoring & Efficiency',
    color: '#4096ff',
    intro: 'Who gets more points per attempt',
    items: [
      {
        field: 'playerTsPct', label: 'True Shooting %', en: 'True Shooting % (TS%)',
        desc: 'A shooting percentage that puts twos, threes and free throws on the same scale: PTS ÷ (2 × (FGA + 0.44 × FTA)). Plain FG% misses the extra point from a three and the value of drawing fouls to get to the line; true shooting counts them.',
        scale: [['55%', 'League avg'], ['60%', 'Efficient'], ['65%+', 'Elite'] ],
      },
      {
        field: 'playerUsgPct', label: 'USG%', en: 'Usage % (USG%)',
        desc: 'While he is on the floor, the share of team possessions he finishes (with a shot, free throws or a turnover). Five players splitting evenly would get 20% each, so 20% is the natural average. It says how much of the ball he gets, not how well he uses it.',
        scale: [['20%', 'Even share'], ['25%', 'Primary scorer'], ['30%+', 'Focal point']],
      },
      {
        field: 'playerOffEff', label: 'ORtg', en: 'Offensive Rating (ORtg)',
        desc: 'Points he produces for the team per 100 possessions he uses. B-R only reports whole numbers, so ties are common.',
        scale: [['113', 'Recent league avg'], ['120+', 'Elite']],
      },
      {
        field: 'playerDefEff', label: 'DRtg', en: 'Defensive Rating (DRtg)',
        desc: 'Points the opponent scores per 100 possessions while he is on the floor; lower is better. A player\'s defensive rating carries a lot of team effect, so don\'t read too much into it.',
        scale: [['113', 'Recent league avg'], ['105', 'Good']],
      },
      {
        field: 'playerNetEff', label: 'Net Rtg', en: 'Net Rating',
        desc: 'Offensive rating minus defensive rating. Both are whole numbers, so net rating is too, and dozens of players tying in one season is normal. To tell small gaps apart, look at BPM.',
        scale: [['0', 'Even'], ['+10', 'Strong']],
      },
    ],
  },
  {
    group: 'Involvement',
    color: '#52c41a',
    intro: 'Share of these events he accounts for while on court',
    items: [
      {
        field: 'playerTrbPct', label: 'REB%', en: 'Total Rebound % (TRB%)',
        desc: 'The percentage of available rebounds he grabs while on the floor. It is fairer than rebounds per game: fewer minutes, or a team that shoots well (leaving fewer rebounds to grab), won\'t drag it down.',
        scale: [['10%', 'High for a guard'], ['20%+', 'Elite big']],
      },
      { field: 'playerOrbPct', label: 'ORB%', en: 'Offensive Rebound %', desc: 'The share of his team\'s missed shots that he pulls down as offensive rebounds.' },
      { field: 'playerDrbPct', label: 'DRB%', en: 'Defensive Rebound %', desc: 'The share of the opponent\'s missed shots that he secures as defensive rebounds.' },
      {
        field: 'playerAstPct', label: 'AST%', en: 'Assist % (AST%)',
        desc: 'The share of teammates\' made field goals he assisted while on the floor.',
        scale: [['20%', 'Average'], ['40%+', 'Playmaker']],
      },
      {
        field: 'playerStlPct', label: 'STL%', en: 'Steal % (STL%)',
        desc: 'The percentage of opponent possessions that end with him stealing the ball.',
        scale: [['1.5%', 'League avg'], ['3%+', 'Elite']],
      },
      {
        field: 'playerBlkPct', label: 'BLK%', en: 'Block % (BLK%)',
        desc: 'The share of the opponent\'s two-point attempts that he blocks.',
        scale: [['2%', 'Average big'], ['6%+', 'Elite rim protector']],
      },
      {
        field: 'playerTovPct', label: 'TOV%', en: 'Turnover % (TOV%)',
        desc: 'Turnovers per 100 possessions he uses; lower is better. Players who handle the ball a lot naturally run higher, so read it together with usage rate.',
        scale: [['13%', 'League avg'], ['10%', 'Very secure']],
      },
    ],
  },
]

/** field → 词条，供表头 tooltip 直接查 */
const BY_FIELD = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.field, { ...i, color: g.color }])))

// 刻度是 [数值, 档位说明]（League average、All-Star …）
function Scale({ items, color, size = 11 }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {items.map(([v, label]) => (
        <span
          key={v}
          style={{
            fontSize: size, color: '#8c8c8c', background: '#fafafa',
            border: '1px solid #f0f0f0', borderRadius: 4, padding: '1px 6px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <b style={{ color }}>{v}</b> {label}
        </span>
      ))}
    </div>
  )
}

/** 说明书弹窗本体 */
export function StatGlossaryModal({ open, onClose }) {
  const isMobile = useIsMobile()
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '94vw' : 860}
      title={
        <span>
          Advanced Stats Guide
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#bbb' }}>
            Definitions match Basketball-Reference
          </span>
        </span>
      }
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 6 } }}
    >
      {GROUPS.map((g) => (
        <div key={g.group}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px' }}>
            <span style={{ width: 3, height: 14, background: g.color, borderRadius: 2 }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{g.group}</span>
            <span style={{ fontSize: 12, color: '#bbb' }}>{g.intro}</span>
          </div>
          <Row gutter={[10, 10]}>
            {g.items.map((it) => (
              <Col key={it.field} xs={24} lg={12}>
                <div
                  style={{
                    height: '100%', background: '#fff', borderRadius: 8,
                    border: '1px solid #f0f0f0', borderLeft: `3px solid ${g.color}`,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{it.label}</span>
                    <span style={{ fontSize: 11, color: '#bbb' }}>{it.en}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.75, marginTop: 4 }}>{it.desc}</div>
                  {it.scale && <Scale items={it.scale} color={g.color} />}
                </div>
              </Col>
            ))}
          </Row>
        </div>
      ))}
      <div style={{ marginTop: 20, fontSize: 12, color: '#bbb', lineHeight: 1.8 }}>
        Reference scales are rough positions of typical levels, not hard cutoffs. Cells without data show "/": career totals have no advanced stats (B-R publishes them per season only); 1976-77 has no league-wide turnovers or offensive rebounds, so ORtg/DRtg can't be computed that year.
      </div>
    </Modal>
  )
}

/** 资料卡标题旁的问号；也可当通用触发器用 */
export function GlossaryIcon({ style }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <QuestionCircleOutlined
        onClick={() => setOpen(true)}
        style={{ color: '#bbb', fontSize: 14, cursor: 'pointer', marginLeft: 6, ...style }}
      />
      <StatGlossaryModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** 数据表工具条上的「指标说明」入口（手机上表头 tooltip 不好点，主要靠它） */
export function GlossaryButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <a onClick={() => setOpen(true)} style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>
        <QuestionCircleOutlined style={{ marginRight: 4 }} />
        Stat Guide
      </a>
      <StatGlossaryModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * 单条释义的悬停卡片。不是高阶项就原样返回，调用方不用自己判断。
 *
 * 表头不加任何视觉标记（虚下划线、悬停浮出的 ⓘ 都试过，都嫌脏），只保留悬停出解释
 * 这一件事。发现入口靠工具条上的「指标说明」——手机也只能走那儿。
 */
export function GlossaryTip({ field, children }) {
  const it = BY_FIELD[field]
  if (!it) return children
  return (
    <Tooltip
      trigger={['hover', 'click']}
      overlayStyle={{ maxWidth: 320 }}
      title={
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700 }}>
            {it.label}
            <span style={{ fontWeight: 400, opacity: 0.65, marginLeft: 5 }}>{it.en}</span>
          </div>
          <div style={{ marginTop: 2 }}>{it.desc}</div>
          {it.scale && (
            <div style={{ marginTop: 4, opacity: 0.8 }}>
              {/* 原来是 map(([v, t]) => …) 再用全角空格 join 成一个字符串：解构出来的 t 遮住了翻译函数，
                  拼接的又是翻译后的文字。改成一段一段渲染；只有英文以后间隔改用「 · 」 */}
              {it.scale.map(([v, label], i) => (
                <span key={v}>{i > 0 ? ' · ' : ''}{v} {label}</span>
              ))}
            </div>
          )}
        </div>
      }
    >
      <span className="stat-tip">{children}</span>
    </Tooltip>
  )
}

/** 批量给数据列的表头挂上释义 */
export function withGlossary(columns) {
  return columns.map((c) =>
    !BY_FIELD[c.dataIndex] || typeof c.title !== 'string'
      ? c
      : { ...c, title: <GlossaryTip field={c.dataIndex}>{c.title}</GlossaryTip> },
  )
}
