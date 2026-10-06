import { fmtNum as f } from './rankConfig'

/** 荣誉小字：进攻类=得分/篮板/助攻；防守类=抢断/盖帽/篮板 */
const offSub = (r) => `${f(r.playerAvgScore)} PTS ${f(r.playerAvgReb)} REB ${f(r.playerAvgAss)} AST`
const defSub = (r) => `${f(r.playerAvgSteal)} STL ${f(r.playerAvgBlock)} BLK ${f(r.playerAvgReb)} REB`

// 空名次垫底（数据源只给获奖者名次；手工补 2-10 名后自然按名次排）
const byMvp = (a, b) => (a.mvpRank ?? 999) - (b.mvpRank ?? 999)
const byDpoy = (a, b) => (a.dpoyRank ?? 999) - (b.dpoyRank ?? 999)

// 该季存在官方投票名次时只列名次内球员（并列共享名次）；一个名次都没有的
// 赛季回退为全员预览前 10——避免"8 个正主 + 2 个凑数行"的混排
const ranked = (rows, rankOf, by) => rows.filter((r) => rankOf(r) != null).sort(by)
const pickVoted = (rankOf, by, cap) => (rows) => {
  const rk = ranked(rows, rankOf, by)
  return rk.length ? (cap ? rk.slice(0, cap) : rk) : [...rows].sort(by).slice(0, 10)
}

/**
 * 赛季荣誉分组：pick(rows) 取该组成员（已排序），sub(row) 出小字，rankOf(row) 出名次角标；
 * MVP/DPOY 另有 pickFull（完整数据页不截前 10，得票并列一并展示）。
 * key 同时用于完整数据页路由 /rankings/honors/:key。
 */
export const HONOR_GROUPS = [
  { key: 'mvp', title: 'MVP', note: 'Regular season MVP voting', span: 12,
    pick: pickVoted((r) => r.mvpRank, byMvp, 10), pickFull: pickVoted((r) => r.mvpRank, byMvp, 0),
    sub: offSub, rankOf: (r) => r.mvpRank },
  { key: 'dpoy', title: 'DPOY', note: 'Defensive Player voting', span: 12,
    pick: pickVoted((r) => r.dpoyRank, byDpoy, 10), pickFull: pickVoted((r) => r.dpoyRank, byDpoy, 0),
    sub: defSub, rankOf: (r) => r.dpoyRank },
  // 入阵是"当选"不是"名次"——阵容卡不带名次角标（无 rankOf），只按投票名次排个顺
  { key: 'all1', title: 'All-NBA 1st', span: 8,
    pick: (rows) => rows.filter((r) => r.allDbaTeam === '1st Team').sort(byMvp), sub: offSub },
  { key: 'all2', title: 'All-NBA 2nd', span: 8,
    pick: (rows) => rows.filter((r) => r.allDbaTeam === '2nd Team').sort(byMvp), sub: offSub },
  { key: 'all3', title: 'All-NBA 3rd', span: 8,
    pick: (rows) => rows.filter((r) => r.allDbaTeam === '3rd Team').sort(byMvp), sub: offSub },
  // 现实中最佳防守阵容只评一/二阵，不存在三阵
  { key: 'def1', title: 'All-Defensive 1st', span: 12,
    pick: (rows) => rows.filter((r) => r.allDefTeam === '1st Team').sort(byDpoy), sub: defSub },
  { key: 'def2', title: 'All-Defensive 2nd', span: 12,
    pick: (rows) => rows.filter((r) => r.allDefTeam === '2nd Team').sort(byDpoy), sub: defSub },
]

// 生涯荣誉柜 / 赛季资料卡共用的荣誉元数据（gold=顶级荣誉金卡）
export const CAREER_AWARDS = [
  { key: 'champion', label: 'Champion', icon: '🏆', gold: true },
  { key: 'fmvp', label: 'Finals MVP', icon: '🏅', gold: true },
  { key: 'mvp', label: 'MVP', icon: '👑', gold: true },
  { key: 'dpoy', label: 'Defensive Player of the Year', icon: '🛡️', gold: true },
  { key: 'smoy', label: 'Sixth Man of the Year', icon: '🪑' },
  { key: 'mip', label: 'Most Improved Player', icon: '📈' },
  { key: 'roy', label: 'Rookie of the Year', icon: '🌱' },
  { key: 'scoring', label: 'Scoring Leader', icon: '🔥' },
  { key: 'rebounds', label: 'Rebounding Leader', icon: '💪' },
  { key: 'assists', label: 'Assists Leader', icon: '🎯' },
  { key: 'steals', label: 'Steals Leader', icon: '⚡' },
  { key: 'blocks', label: 'Blocks Leader', icon: '🚫' },
  { key: 'all1', label: 'All-NBA 1st', icon: '⭐' },
  { key: 'all2', label: 'All-NBA 2nd', icon: '✨' },
  { key: 'all3', label: 'All-NBA 3rd', icon: '🌟' },
  { key: 'def1', label: 'All-Def 1st', icon: '🔒' },
  { key: 'def2', label: 'All-Def 2nd', icon: '🔐' },
]
