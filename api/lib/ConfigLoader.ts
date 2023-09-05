import * as HTMLChecker from 'fast-html-checker'
import {CheckResult} from 'fast-html-checker'
import path from 'path'
import SeedRandom from 'seedrandom'
import {DataType} from '../import-mongodb'
import {AuthCodeEmailInfo, CommentPostEmailInfo, CommentReplyEmailInfo, EmailBasicConfig, EmailConfig} from './Email'
import {calcHash} from './utils'

let loaded: KmentsConfig

/** 加载配置 */
export function loadConfig(): KmentsConfig {
    if (!loaded) {
        const configPath = path.resolve('.', `kmentsConfig.ts`)
        loaded = loadConfigFrom(configPath)
    }
    return loaded
}

/** 从指定路径下加载配置 */
export function loadConfigFrom(path: string): KmentsConfig {
    const config = require(path).default
    function merge(src: any, def: any) {
        for (let key in def) {
            const defValue = def[key]
            if (!(key in src)) src[key] = defValue
            else if (typeof defValue == 'object') {
                merge(src[key], defValue)
            }
        }
    }
    merge(config, defaultConfig)
    initEmail(config)
    if (typeof config.encrypt == 'string') {
        const seed = config.encrypt as string
        config.encrypt = (text: string) => {
            const random = SeedRandom.tychei(text + seed)
            const index = Math.floor(random.double() * text.length)
            const slot = random.int32().toString(36)
            return text.substring(0, index) + slot + text.substring(index)
        }
    }
    return config
}

function initEmail(config: any) {
    const keyList = ['replyEmail', 'authCodeEmail', 'noticeEmail']
    for (let key of keyList) {
        if (!(key in config)) config[key] = {}
    }
    const {email} = config
    if (!email) return
    for (let key in email) {
        const value = email[key]
        for (let item of keyList) {
            if (!(key in config[item])) config[item][key] = value
        }
    }
}

/**
 * + admin - 管理员登录
 * + gets - 评论获取（包含最近评论）
 * + post - 评论发布、回复
 * + login - 用户认证
 * + logout - 取消认证
 * + delete - 删除评论
 * + hide - 隐藏评论
 * + count - 访问量统计
 * + import - 数据导入
 */
export type RateLimitKeys = 'base' | 'admin' | 'gets' | 'post' | 'login' | 'logout' | 'delete' | 'hide' | 'count' | 'import'

export interface KmentsConfig extends KmentsConfigTemplate {
    commentChecker: CommentChecker
    encrypt: (text: string) => string
    unique: (url: string) => string
}

export interface KmentsConfigTemplate {
    /** 管理员设置 */
    admin: {
        /** 管理员邮箱 */
        email: string
        /** 管理员密码（后台密码，不是邮箱密码） */
        password: string
        /** 前端的 URL */
        domUrl: URL
        /** 网站名称 */
        siteTitle: string
    }
    mongodb: string
    redis: {
        url?: string,
        host?: string,
        port?: number,
        password?: string,
        tls: boolean
    }
    /**
     * 当类型为函数时，用于单向加密指定的字符串
     *
     * 当类型为字符串时，表示这是一个用于计算随机种子的字符串，可以使用字符串模板嵌套一些内容
     *
     * 注意：尽量保证**同样的输入产生同样的输出**，每次结果不同目前并不会有问题，但是不能保证永远不会出问题。
     * 如果你是使用字符串的话建议向其中插入随机的内容，确保每次生成不同的内容，以提高加密的可靠性。
     */
    encrypt: ((text: string) => string) | string
    /** 对指定的 URL（仅包含 pathname）计算一个稳定且唯一的 ID，长度不得超过 62，仅允许包含字母和数字 */
    unique?: (url: string) => string
    /** 缺省的邮箱配置 */
    email?: EmailBasicConfig
    /** 博主评论通知配置 */
    noticeEmail?: EmailConfig<CommentPostEmailInfo>
    /** 评论通知邮箱配置 */
    replyEmail?: EmailConfig<CommentReplyEmailInfo>
    /** 用户认证验证码邮箱配置 */
    authCodeEmail?: EmailConfig<AuthCodeEmailInfo>
    /** 访问频率限制 */
    rateLimit?: {[propName in RateLimitKeys]: RateLimitExp}
    /**
     * 评论检查器，不通过的评论将被拦截
     *
     * 当检查通过时返回 undefined，检查失败返回字符串标明失败原因
     */
    commentChecker?: CommentChecker
    /** 非管理员用户评论修改时间限制（单位 s） */
    commentUpdateTimeLimit?: number
    importer?: {
        /** url 映射器 */
        urlMapper?: (type: DataType, url: string) => string
    }
}

export interface CommentChecker {
    /**
     * 用户检查器
     * @param name 用户名
     * @param email 用户邮箱
     * @param link 用户主页地址
     */
    user?: (name: string, email: string, link?: string) => CheckResult
    /** 评论体检查器 */
    content?: (content: string) => CheckResult
    /** 评论体 XSS 安全检查器 */
    xss?: (content: string) => CheckResult
}

export interface RateLimitExp {
    /** 统计周期（ms） */
    cycle: number
    /** 访问地区限制 */
    region: 'main' | 'china' | 'all' | 'none'
    /**
     * 限制等级，数组应该按照 [0] 的值从大到小排列
     *
     * + [0] - 表示触发该该等级限制的访问次数
     * + [1] - 表示触发该等级限制后访问延迟的时间（-1 表示直接阻断，单位 ms）
     * + [2] - 表示触发该等级限制后黑名单时间（-2 表示永久，-1 表示跟随 Serverless Function 的声明周期，0 表示不启用黑名单，单位 s）
     */
    level: ([number, number, number])[]
}

// noinspection JSUnusedGlobalSymbols
const defaultConfig = {
    unique: (url: string) => calcHash('md5', url),
    commentChecker: {
        user: (name: string, email: string, link?: string): CheckResult => {
            const nameBlackList = ['节点', '免费', '机场', 'clash']
            const emailBlackList = [
                'us.to', 'eu.org', 'tk', 'ml', 'ga', 'cf',
                'gq', 'nom.za', 'iz.rs', 'ze.cs', 'zik.dj',
                'slx.nl', 'ipq.co', 'biz.ly'
            ]
            if (nameBlackList.find(it => name.includes(it)))
                return '用户名包含非法内容'
            if (link && /^(https?:\/\/|\/\/)?k?github\.com/i.test(link))
                return '用户主页地址被屏蔽'
            email = email.toLowerCase()
            if (emailBlackList.find(it => email.endsWith(it)))
                return '用户邮箱被屏蔽'
            return undefined
        },
        xss: (content: string): CheckResult => {
            const common = ['class', 'id', 'type', 'title']
            const batchKeys = [
                'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'strong', 'b', 'em', 'ul', 'li', 'ol',
                'blockquote', 'code', 'pre', 'hr', 'del', 'p'
            ]
            const batch: any[] = []
            batchKeys.forEach(key => batch.push({name: key, allowAttrs: common}))
            return HTMLChecker.check(content, {
                allowTags: [
                    {name: 'a', allowAttrs: [...common, 'href', 'tabindex', 'nick']},
                    {name: 'img', allowAttrs: [...common, 'src']},
                    ...batch
                ]
            })
        }
    },
    noticeEmail: {
        text: (info: CommentPostEmailInfo): string =>
            `尊敬的博主，有人在您的网站（${loadConfig().admin.siteTitle}）内发布了新的评论：\n` +
            `${info.body.rawText}\n` +
            `如需回复或管理评论，请前往 ${info.pageUrl}。\n` +
            `请勿转发该邮件，可能导致他人以您的身份发布评论！`,
        html: (info: CommentPostEmailInfo): string => {
            const siteTitle = loadConfig().admin.siteTitle
            const {body, pageUrl, page} = info
            return `<div style=margin:auto;width:90%;max-width:600px><p style=text-align:center;font-size:1.25rem;font-weight:700;margin:0>${siteTitle} 评论通知</p><p style=text-align:center;color:#666;font-size:.85rem>有人在 ${page} 中发布新的评论了呦~</p><div style="border-radius:12px;border:1px solid #6cf;box-shadow:1px 2px 4px 2px #6cf;padding:15px 25px;width:100%;box-sizing:border-box"><div style="margin:10px 0;display:flex;align-items:center"><img src="https://cravatar.cn/avatar/${body.email}" alt=avatar style=width:30px;height:30px;border-radius:50%;margin-right:10px> <strong>${body.name}</strong></div><div style="margin:10px 0;word-break:break-word">${body.rawText}</div><div style=width:100%;text-align:center;margin-top:20px><a href="${pageUrl.href}"  target=_blank style="text-decoration:none;background:#57bd6a;color:#f5f5f5;font-size:1.1rem;font-weight:700;padding:8px 6px 8px 10px;letter-spacing:4px;border-radius:8px;transition:all .3s">查看详情</a></div></div><p style=text-align:center;font-size:.85rem;color:#6a6a6a>该邮件由系统自动发送，回复评论请前往站内进行回复，请勿回复邮件。<br><strong>邮件内部包含不可见的隐私信息，请勿将邮件转发给他人。</strong></p></div><style>a:hover{background:#5f75fd!important}</style>`
        }
    },
    replyEmail: {
        text: (info: CommentReplyEmailInfo): string =>
            `您在 ${loadConfig().admin.siteTitle} 发布的评论：\n` +
            `${info.replied.rawText}\n` +
            `收到了来自 ${info.newly.name} 的回复：\n` +
            `${info.newly.rawText}\n` +
            `-~~-~~-~~-~~-~~-~~-~~-~~-~~-\n` +
            `如需回复，请前往 ${info.pageUrl.href} (￣▽￣)"\n` +
            `请勿转发该邮件，这可能导致他人以您的身份发布评论！`,
        html: (info: CommentReplyEmailInfo): string => {
            const siteTitle = loadConfig().admin.siteTitle
            const {replied, newly, pageUrl, page} = info
            return `<div style=margin:auto;width:90%;max-width:600px><p style=text-align:center;font-size:1.25rem;font-weight:700;margin:0>${siteTitle} 评论通知</p><p style=text-align:center;color:#666;font-size:.85rem>你在 ${page} 中发布的评论有人回复了哟~</p><div style="border-radius:12px;border:1px solid #6cf;box-shadow:1px 2px 4px 2px #6cf;padding:15px 25px;width:100%;box-sizing:border-box"><div class=head><img src="https://cravatar.cn/avatar/${replied.email}" alt=avatar> <strong>${replied.name}</strong></div><div style="margin:10px 0;word-break:break-word">${replied.rawText}</div><div style="width:100%;height:0;border:2px dashed #6f6f6f;margin-bottom:10px"></div><div class=head><img src="https://cravatar.cn/avatar/${newly.email}" alt=avatar> <strong>${newly.name}</strong></div><div style="margin:10px 0;word-break:break-word">${newly.rawText}</div><div style=width:100%;text-align:center;margin-top:20px><a href="${pageUrl.href}"  target=_blank style="text-decoration:none;background:#57bd6a;color:#f5f5f5;font-size:1.1rem;font-weight:700;padding:8px 6px 8px 10px;letter-spacing:4px;border-radius:8px;transition:all .3s">查看详情</a></div></div><p style=text-align:center;font-size:.85rem;color:#6a6a6a>该邮件由系统自动发送，回复评论请前往站内进行回复，请勿回复邮件。<br><strong>邮件内部包含不可见的隐私信息，请勿将邮件转发给他人。</strong></p></div><style>.head{margin:10px 0;display:flex;align-items:center}.head img{width:30px;height:30px;border-radius:50%;margin-right:10px}a:hover{background:#5f75fd!important}</style>`
        },
        // TODO: 在这里写评论通知的 AMP 内容，需要最外部的 <html> 标签
        // amp: (info: CommentReplyEmailInfo): string => ``
    },
    authCodeEmail: {
        text: (info: AuthCodeEmailInfo): string =>
            `您好！这是用于${info.msg}的验证码，请您接收：${info.code}\n` +
            `请勿将该验证码告知他人，以防您的个人信息泄露或身份被顶替！\n` +
            `如果您没有在本站（${loadConfig().admin.domUrl}）进行${info.msg}，可能是由于有人误用您的邮箱或冒名顶替您的身份，您可以与我沟通协商解决。`,
        html: (info: AuthCodeEmailInfo): string => {
            const siteTitle = loadConfig().admin.siteTitle
            const {code, msg, name} = info
            return `<div style="text-align:center;width:90%;max-width:625px;border-radius:16px;border:1px solid #6cf;box-shadow:1px 2px 4px 2px #6cf;overflow:hidden;margin:10px auto"><strong style=display:block;width:100%;line-height:50px;background:#2196f3;color:#fff;font-weight:700;font-size:1.2rem>${siteTitle} - 验证码</strong><div style="text-align:left;padding:10px 25px"><p>亲爱的 <strong>${name}</strong>：</p><p>这是您的用于${msg}的验证码，如果并非您本人操作请忽略该邮件：</p><div style=display:inline-block;text-align:center;width:100%><p style="display:inline-block;background:#2196f3;color:#fff;font-size:1.5rem;font-weight:700;padding:10px 24px 10px 30px;border-radius:10px;letter-spacing:6px;margin:5px 0">${code}</p></div><p>感谢您选择 ${siteTitle}。</p></div></div><p style=text-align:center;color:#778899;font-size:.8rem>此邮件由系统自动发送，请勿回复。<br>请勿将验证码告知他人。</p>`
        }
    },
    updateCommentTimeLimit: 5 * 60
}