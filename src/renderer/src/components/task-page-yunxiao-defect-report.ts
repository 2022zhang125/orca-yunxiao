/**
 * 云效 defects are authored against a fixed reporting template — 复现步骤,
 * 预期结果, 实际结果, 环境, and so on — which the editor then flattens into a
 * run of `<p>标签：内容</p>`. Reading that back as prose throws away the record
 * the reporter actually filled in, so recover the fields here and let the UI
 * lay them out as what they are.
 *
 * Anything the template does not account for survives as `prose`; a defect that
 * matches nothing yields only prose, and the caller renders it verbatim.
 */

export type YunxiaoDefectFieldId =
  | 'steps'
  | 'expected'
  | 'actual'
  | 'environment'
  | 'account'
  | 'scope'
  | 'api'
  | 'attachments'

export type YunxiaoDefectAttachment = {
  /** 云效 file id, resolvable to a pre-signed download URL. Null when the image
   *  came from somewhere else and its `src` is already directly usable. */
  fileId: string | null
  src: string
  name: string
}

export type YunxiaoDefectReport = {
  fields: Partial<Record<YunxiaoDefectFieldId, string>>
  /** Paragraphs that carried no recognised label, in document order. */
  prose: string[]
  images: YunxiaoDefectAttachment[]
}

/**
 * 云效 embeds description images as `…/workitem/file/url?fileIdentifier=<id>`,
 * a session-guarded proxy. The id behind it is what the file endpoint takes, so
 * pull it out and let the viewer trade it for a link that actually loads.
 */
export function extractYunxiaoFileId(src: string): string | null {
  try {
    return new URL(src).searchParams.get('fileIdentifier')
  } catch {
    return null
  }
}

// Both the Chinese labels 云效 ships and the English an org may rename them to.
const FIELD_LABELS: { id: YunxiaoDefectFieldId; labels: string[] }[] = [
  { id: 'steps', labels: ['复现步骤', '重现步骤', '操作步骤', 'steps to reproduce', 'steps'] },
  { id: 'expected', labels: ['预期结果', '期望结果', '预期', 'expected result', 'expected'] },
  { id: 'actual', labels: ['实际结果', '实际表现', '实际', 'actual result', 'actual'] },
  { id: 'environment', labels: ['环境', '测试环境', 'environment', 'env'] },
  { id: 'account', labels: ['账号', '帐号', 'account'] },
  { id: 'scope', labels: ['影响范围', '影响', 'impact', 'scope'] },
  { id: 'api', labels: ['接口名称', '接口', 'api', 'endpoint'] },
  { id: 'attachments', labels: ['日志/截图', '日志', '截图', 'logs', 'screenshots'] }
]

// 云效 writes a fullwidth colon; a hand-edited description may use either.
const LABEL_SEPARATOR = /^\s*([^：:]{1,12})\s*[：:]\s*(.*)$/s

function matchFieldId(label: string): YunxiaoDefectFieldId | null {
  const normalized = label.trim().toLowerCase()
  for (const field of FIELD_LABELS) {
    if (field.labels.some((candidate) => candidate.toLowerCase() === normalized)) {
      return field.id
    }
  }
  return null
}

function collectImages(root: ParentNode): YunxiaoDefectAttachment[] {
  return [...root.querySelectorAll('img')].flatMap((image, index) => {
    const src = image.getAttribute('src')?.trim()
    if (!src) {
      return []
    }
    const name = image.getAttribute('name')?.trim() || image.getAttribute('alt')?.trim()
    return [{ fileId: extractYunxiaoFileId(src), src, name: name || `image-${index + 1}` }]
  })
}

/**
 * Splits a description into template fields plus leftover prose. Blocks are
 * read in document order so a label with an empty body can absorb the
 * paragraphs that follow it — the editor produces that shape whenever someone
 * presses Enter after the label.
 */
export function parseYunxiaoDefectReport(description: string): YunxiaoDefectReport {
  const report: YunxiaoDefectReport = { fields: {}, prose: [], images: [] }
  if (typeof DOMParser === 'undefined') {
    report.prose.push(description)
    return report
  }
  const parsed = new DOMParser().parseFromString(description, 'text/html')
  report.images = collectImages(parsed.body)

  const blocks = [...parsed.body.querySelectorAll('p, li, div')].filter(
    (element) => !element.querySelector('p, li, div')
  )
  const texts = (blocks.length > 0 ? blocks : [parsed.body]).map((element) =>
    (element.textContent ?? '').replaceAll(' ', ' ').trim()
  )

  let openField: YunxiaoDefectFieldId | null = null
  for (const text of texts) {
    if (!text) {
      continue
    }
    const separated = LABEL_SEPARATOR.exec(text)
    const fieldId = separated ? matchFieldId(separated[1]) : null
    if (fieldId) {
      const body = separated![2].trim()
      report.fields[fieldId] = body
      // An empty body means the value continues in the following paragraphs.
      openField = body ? null : fieldId
      continue
    }
    if (openField) {
      const existing = report.fields[openField]
      report.fields[openField] = existing ? `${existing}\n${text}` : text
      continue
    }
    report.prose.push(text)
  }

  for (const [id, value] of Object.entries(report.fields)) {
    if (!value.trim()) {
      delete report.fields[id as YunxiaoDefectFieldId]
    }
  }
  return report
}

/** True when enough of the template survived to be worth laying out as a record. */
export function hasStructuredDefectReport(report: YunxiaoDefectReport): boolean {
  return Object.keys(report.fields).length >= 2
}

// Leading list markers reporters type by hand: "1." "1、" "1)" "(1)" "①".
const STEP_MARKER = /(?:^|\s)(?:[(（]?\d{1,2}[).、.]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/g
// A clause list only reads as steps when every clause is a terse imperative
// ("点击新增商户"). Past this length it is narrative punctuation, not a list,
// and splitting it would shred one sentence into fake steps.
const MAX_CLAUSE_LENGTH = 20
const MIN_CLAUSES = 3

/**
 * Recovers the ordered actions from a 复现步骤 field. Reporters write them three
 * ways, so try the explicit signals first and fall back to comma-separated
 * clauses only when the shape is unambiguous — a wrong split reads worse than
 * no split at all.
 *
 * Returns a single entry when the text is one action; the caller renders that
 * as prose, since numbering a list of one encodes a sequence that isn't there.
 */
export function splitReproductionSteps(steps: string): string[] {
  const lines = steps
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length > 1) {
    return lines.map((line) => line.replace(STEP_MARKER, '').trim()).filter(Boolean)
  }
  const single = lines[0] ?? ''
  const marked = single
    .split(STEP_MARKER)
    .map((part) => part.trim())
    .filter(Boolean)
  if (marked.length > 1) {
    return marked
  }
  const clauses = single
    .split(/[，,]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
  const readsAsActionList =
    clauses.length >= MIN_CLAUSES && clauses.every((clause) => clause.length <= MAX_CLAUSE_LENGTH)
  return readsAsActionList ? clauses : [single].filter(Boolean)
}
