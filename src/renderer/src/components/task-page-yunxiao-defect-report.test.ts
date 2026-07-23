// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  extractYunxiaoFileId,
  hasStructuredDefectReport,
  parseYunxiaoDefectReport,
  splitReproductionSteps
} from './task-page-yunxiao-defect-report'

// The shape 云效's editor actually emits: unclosed <p> tags, a fullwidth colon
// after every label, trailing spaces, and an authenticated attachment URL.
const REAL_DEFECT = `<article class="4ever-article">
<p style="text-align:left">复现步骤：登录管理端，进入商户服务-商户管理，点击新增商户，输入随机数字的联系电话和邮箱
<p style="text-align:left">
<p style="text-align:left">预期结果：提示输入正确手机号 和输入正确的邮箱
<p style="text-align:left">
<p style="text-align:left">实际结果：输入任何字符和数字都能保存
<p style="text-align:left">
<p style="text-align:left">环境：测试环境
<p style="text-align:left">
<p style="text-align:left">账号：管理端：xuxiangtan
<p style="text-align:left">
<p style="text-align:left">影响范围：管理端
<p style="text-align:left">
<p style="text-align:left">日志/截图：
<p style="text-align:left"><img src="https://devops.aliyun.com/projex/api/workitem/file/url?fileIdentifier=aacd" name="image.png" style="width:600px">
<p style="text-align:left">
<p style="text-align:left">接口名称：contactPhone，contactEmail
<p style="text-align:left">
</article>`

describe('yunxiao defect report parsing', () => {
  it('recovers the reporting template from flattened paragraphs', () => {
    const report = parseYunxiaoDefectReport(REAL_DEFECT)

    expect(report.fields.steps).toBe(
      '登录管理端，进入商户服务-商户管理，点击新增商户，输入随机数字的联系电话和邮箱'
    )
    expect(report.fields.expected).toBe('提示输入正确手机号 和输入正确的邮箱')
    expect(report.fields.actual).toBe('输入任何字符和数字都能保存')
    expect(report.fields.environment).toBe('测试环境')
    expect(report.fields.scope).toBe('管理端')
    expect(report.fields.api).toBe('contactPhone，contactEmail')
    expect(hasStructuredDefectReport(report)).toBe(true)
  })

  it('keeps everything after the first colon, so a nested label survives', () => {
    // 账号：管理端：xuxiangtan — splitting on every colon would lose the account.
    expect(parseYunxiaoDefectReport(REAL_DEFECT).fields.account).toBe('管理端：xuxiangtan')
  })

  it('pulls the file id out of the guarded proxy url so it can be resolved', () => {
    const report = parseYunxiaoDefectReport(REAL_DEFECT)
    expect(report.images).toEqual([
      {
        fileId: 'aacd',
        src: 'https://devops.aliyun.com/projex/api/workitem/file/url?fileIdentifier=aacd',
        name: 'image.png'
      }
    ])
    // The label paragraph was empty and the next block is an image, so the
    // field itself stays empty rather than absorbing stray text.
    expect(report.fields.attachments).toBeUndefined()
  })

  it('absorbs continuation paragraphs into a label left empty', () => {
    const report = parseYunxiaoDefectReport(
      '<p>复现步骤：</p><p>打开页面</p><p>点击保存</p><p>预期结果：不报错</p>'
    )
    expect(report.fields.steps).toBe('打开页面\n点击保存')
    expect(report.fields.expected).toBe('不报错')
  })

  it('leaves a freeform description as prose so nothing is dropped', () => {
    const report = parseYunxiaoDefectReport('<p>登录以后偶发白屏，日志里没有报错。</p>')
    expect(report.fields).toEqual({})
    expect(report.prose).toEqual(['登录以后偶发白屏，日志里没有报错。'])
    expect(hasStructuredDefectReport(report)).toBe(false)
  })

  it('does not treat an unrelated colon sentence as a template field', () => {
    const report = parseYunxiaoDefectReport('<p>备注：这个问题下个版本再看</p>')
    expect(report.fields).toEqual({})
    expect(report.prose).toEqual(['备注：这个问题下个版本再看'])
  })
})

describe('reproduction step splitting', () => {
  it('splits the comma-separated action list reporters actually write', () => {
    expect(
      splitReproductionSteps(
        '登录管理端，进入商户服务-商户管理，点击新增商户，输入随机数字的联系电话和邮箱'
      )
    ).toEqual([
      '登录管理端',
      '进入商户服务-商户管理',
      '点击新增商户',
      '输入随机数字的联系电话和邮箱'
    ])
  })

  it('prefers explicit line breaks and strips the hand-typed markers', () => {
    expect(splitReproductionSteps('1. 打开页面\n2. 点击保存\n3. 刷新')).toEqual([
      '打开页面',
      '点击保存',
      '刷新'
    ])
  })

  it('splits inline numbering written on one line', () => {
    expect(splitReproductionSteps('1、打开页面 2、点击保存 3、刷新')).toEqual([
      '打开页面',
      '点击保存',
      '刷新'
    ])
  })

  it('leaves one sentence whole rather than inventing a sequence', () => {
    // Two clauses read as a sentence, not a list — the caller renders prose.
    expect(splitReproductionSteps('点击保存，页面白屏')).toEqual(['点击保存，页面白屏'])
    expect(splitReproductionSteps('登录后进入商户管理页面')).toEqual(['登录后进入商户管理页面'])
  })

  it('keeps a long narrative intact even when it has three commas', () => {
    const narrative =
      '在测试环境用管理员账号登录之后再进入商户服务下面的商户管理列表页，' +
      '然后点击右上角那个新增商户的蓝色按钮打开弹窗，' +
      '在联系电话一栏里随便输入一串没有规律的数字字符，最后点保存'
    expect(splitReproductionSteps(narrative)).toEqual([narrative])
  })
})

describe('yunxiao embedded file ids', () => {
  it('reads the identifier out of the description proxy url', () => {
    expect(
      extractYunxiaoFileId(
        'https://devops.aliyun.com/projex/api/workitem/file/url?fileIdentifier=aacdf8b4da'
      )
    ).toBe('aacdf8b4da')
  })

  it('returns null for an image hosted somewhere else, which needs no resolving', () => {
    expect(extractYunxiaoFileId('https://example.com/shot.png')).toBeNull()
    expect(extractYunxiaoFileId('not a url')).toBeNull()
  })

  it('names an unnamed image by position so the viewer has something to show', () => {
    const report = parseYunxiaoDefectReport(
      '<p>环境：测试</p><p>账号：a</p><p><img src="https://example.com/a.png"></p>'
    )
    expect(report.images).toEqual([
      { fileId: null, src: 'https://example.com/a.png', name: 'image-1' }
    ])
  })
})
