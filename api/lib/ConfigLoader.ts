import * as HTMLChecker from 'fast-html-checker'
import {CheckResult} from 'fast-html-checker'
import path from 'path'
import {AuthCodeEmailInfo, CommentReplyEmailInfo, EmailBasicConfig, EmailConfig} from './Email'

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
    for (let key of mustKeys) {
        if (!(key in config))
            throw `用户配置缺失 ${key} 字段`
    }
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
    initEnv(config)
    initEmail(config)
    return config
}

function initEmail(config: any) {
    if (!('replyEmail' in config)) config.replyEmail = {}
    if (!('authCodeEmail' in config)) config.authCodeEmail = {}
    const {email, replyEmail, authCodeEmail} = config
    if (!email) return
    for (let key in email) {
        const value = email[key]
        if (!(key in replyEmail)) replyEmail[key] = value
        if (!(key in authCodeEmail)) authCodeEmail[key] = value
    }
    if (replyEmail?.password || authCodeEmail?.password)
        throw '用户禁止在 TS 配置中填写邮箱配置中的密码字段！'
    const passwords = config.env.emailPassword
    replyEmail.password = passwords.reply
    authCodeEmail.password = passwords.authCode
}

function initEnv(config: any) {
    const emailPassword = process.env['EMAIL_PASSWORD']
    const env: any = config.env = {
        adminPassword: process.env['ADMIN_PASSWORD'],
        mongodb: {
            name: process.env['MONGODB_NAME'],
            password: process.env['MONGODB_PASSWORD']
        },
        emailPassword: {
            email: emailPassword,
            reply: process.env['EMAIL_PASSWORD_REPLY'] ?? emailPassword,
            authCode: process.env['EMAIL_PASSWORD_AUTH'] ?? emailPassword
        }
    }
    if ('KV_URL' in process.env) {
        env.redis = {
            url: process.env['KV_URL'],
            tls: false
        }
    } else if ('REDIS_URL' in process.env) {
        env.redis = {
            url: process.env['REDIS_URL'],
            tls: !!Number.parseInt(process.env['REDIS_TLS']!)
        }
    } else {
        env.redis = {
            host: process.env['REDIS_HOST'],
            port: Number.parseInt(process.env['REDIS_PORT']!),
            password: process.env['REDIS_PASSWORD'],
            tls: !!Number.parseInt(process.env['REDIS_TLS']!)
        }
    }
}

export type RateLimitKeys = 'base' | 'admin' | 'gets' | 'post' | 'login' | 'logout'
const mustKeys = ['domUrl']

export interface KmentsConfig extends KmentsConfigTemplate {
    commentChecker: CommentChecker
    /** 环境变量 */
    env: {
        adminPassword: string
        mongodb: {
            name: string,
            password: string
        }
        redis: {
            url?: string,
            host?: string,
            port?: number,
            password?: string,
            tls: boolean
        }
        emailPassword: {
            email: string
            reply: string
            authCode: string
        }
    }
}

export interface KmentsConfigTemplate {
    /** 前端的 URL */
    domUrl: URL
    /** 网站名称 */
    siteTitle: string
    email?: EmailBasicConfig
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
    cycle: number,
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
    commentChecker: {
        user: (name: string, email: string, link?: string): CheckResult => {
            const nameBlackList = ['节点', '免费', '机场', 'clash']
            if (nameBlackList.find(it => name.includes(it)))
                return '用户名包含非法内容'
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return '邮箱无效'
            if (link && /^(https?:\/\/|\/\/)?k?github\.com/i.test(link))
                return '用户主页地址被屏蔽'
            return undefined
        },
        xss: (content: string): CheckResult => HTMLChecker.check(content, {
            allowTags: ['a']
        })
    },
    replyEmail: {
        text: (info: CommentReplyEmailInfo): string =>
            `您在 ${loadConfig().siteTitle} 发布的评论：\n` +
            `${info.replied.rawText}\n` +
            `收到了来自 ${info.newly.name} 的回复：\n` +
            `${info.newly.rawText}\n` +
            `-~~-~~-~~-~~-~~-~~-~~-~~-~~-\n` +
            `如需回复，请前往 ${info.reply.href} (￣▽￣)"\n` +
            `请勿转发该邮件，这可能导致他人以您的身份发布评论！`,
        html: (info: CommentReplyEmailInfo): string => ``,      // TODO: 在这里写评论通知的 HTML 内容，不需要最外部的 <html> 标签
        amp: (info: CommentReplyEmailInfo): string => ``        // TODO: 在这里写评论通知的 AMP 内容，需要最外部的 <html> 标签
    },
    authCodeEmail: {
        text: (info: AuthCodeEmailInfo): string =>
            `您好！这是用于${info.msg}的验证码，请您接收：${info.code}\n` +
            `请勿将该验证码告知他人，以防您的个人信息泄露或身份被顶替！\n` +
            `如果您没有在本站（${loadConfig().domUrl}）进行${info.msg}，可能是由于有人误用您的邮箱或冒名顶替您的身份，您可以与我沟通协商解决。`,
        html: (info: AuthCodeEmailInfo): string => {
            const siteTitle = loadConfig().siteTitle
            const {code, msg, name} = info
            return `<div style="text-align:center;width:90%;max-width:650px;border-radius:16px;border:1px solid #6cf;box-shadow:1px 2px 5px 3px #6cf;overflow:hidden;margin:10px auto"><strong style=display:block;width:100%;line-height:50px;background:#2196f3;color:#fff;font-weight:700;font-size:1.2rem>${siteTitle} - 验证码</strong><div style="text-align:left;padding:10px 25px"><p>亲爱的 <strong>${name}</strong>：</p><p>这是您的用于${msg}的验证码，如果并非您本人操作请忽略该邮件：</p><div style=display:inline-block;text-align:center;width:100%><p style="display:inline-block;background:#2196f3;color:#fff;font-size:1.5rem;font-weight:700;padding:10px 24px 10px 30px;border-radius:10px;letter-spacing:6px;margin:5px 0">${code}</p></div><p>感谢您选择 ${siteTitle}。</p></div></div><p style=text-align:center;color:#778899;font-size:.8rem>此邮件由系统自动发送，请勿回复。<br>请勿将验证码告知他人。</p>`
        }
    }
}