/**
 * 云效 files 暂不修复 ("won't fix") and 重新打开 ("reopened") under workflow
 * stages that claim the work is finished or not started, which is wrong for
 * triage: both are defects still waiting on someone. The names are the only
 * signal the API gives, so both the list ranking and the row styling key off
 * these sets rather than the stage id.
 */
const REOPENED_STATUS_NAMES = new Set(['重新打开', '再次打开', 'reopened', 'reopen'])

const UNFIXED_STATUS_NAMES = new Set([
  '未修复',
  '暂不修复',
  '不修复',
  'not fixed',
  'unfixed',
  "won't fix",
  'wont fix',
  'deferred fix'
])

// 待确认 sits in an unstarted stage, but the defect is already filed and
// actionable — fixing it is how it gets confirmed.
const PENDING_CONFIRM_STATUS_NAMES = new Set([
  '待确认',
  'to be confirmed',
  'pending confirmation',
  'unconfirmed'
])

export function isYunxiaoReopenedStatus(statusName: string): boolean {
  return REOPENED_STATUS_NAMES.has(statusName.trim().toLowerCase())
}

export function isYunxiaoPendingConfirmStatus(statusName: string): boolean {
  return PENDING_CONFIRM_STATUS_NAMES.has(statusName.trim().toLowerCase())
}

export function isYunxiaoUnfixedStatus(statusName: string): boolean {
  return UNFIXED_STATUS_NAMES.has(statusName.trim().toLowerCase())
}

/** True while the defect still needs someone, whatever stage 云效 filed it under. */
export function isYunxiaoOutstandingStatus(statusName: string): boolean {
  return isYunxiaoReopenedStatus(statusName) || isYunxiaoUnfixedStatus(statusName)
}
