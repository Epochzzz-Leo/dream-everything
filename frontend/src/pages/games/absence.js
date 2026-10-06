/**
 * 「没上场」的两种身份，以及 B-R 给的英文原因怎么说成人话。
 *
 * 这两类在 B-R 页面上是两个不同的位置，含义也不同，合成一句「未出场」会丢掉信息：
 * 一个是**能上而没上**（教练没派），一个是**根本上不了**（伤病、没报名）。
 * 赛后想吐槽的往往正是前者。
 */
export const KIND_LABEL = {
  DNP: 'Did not play (bench)',
  INACTIVE: 'Inactive',
}

/** 短标签，贴在名字后面用 */
export const KIND_TAG = {
  DNP: 'DNP',
  INACTIVE: 'Inactive',
}

/**
 * B-R 的原因文案 → 统一的短说法（原来是翻成中文；2026-10-06 网站只留英文后改成整理大小写和措辞）。
 *
 * 只处理常见的那几条，其余原样显示。把 B-R 的全部措辞抄一份进来既抄不全
 * （伤病描述是自由文本），抄进来的那一刻也开始过期了。
 * 'DNP' 这个结果会被比赛页拿去比较（等于 DNP 就不再重复显示原因），改它要一起改那两处。
 */
const REASON_MAP = [
  [/coach'?s decision/i, 'Coach\'s decision'],
  [/did not dress/i, 'Did not dress'],
  [/not with team/i, 'Not with team'],
  [/suspend/i, 'Suspended'],
  [/personal/i, 'Personal reasons'],
  [/did not play/i, 'DNP'],
  [/inactive/i, 'Inactive'],
]

export const reasonText = (raw) => {
  const s = String(raw || '').trim()
  if (!s) return ''
  const hit = REASON_MAP.find(([re]) => re.test(s))
  return hit ? hit[1] : s
}

/** 按 DNP / INACTIVE 分组，顺序固定：能上没上的排前面 */
export const groupByKind = (rows) => {
  const dnp = (rows || []).filter((r) => r.kind === 'DNP')
  const inactive = (rows || []).filter((r) => r.kind !== 'DNP')
  return [
    ['DNP', dnp],
    ['INACTIVE', inactive],
  ].filter(([, list]) => list.length > 0)
}
