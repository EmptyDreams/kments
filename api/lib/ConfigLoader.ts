import {CheckResult} from 'fast-html-checker'
import * as HTMLChecker from 'fast-html-checker'
import path from 'path'

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
    const config = require(path)
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
    return config
}

function initEnv(config: any) {
    const env = config.env
    env.adminPassword = process.env['ADMIN_PASSWORD']
    env.mongodb = {
        name: process.env['MONGODB_NAME'],
        password: process.env['MONGODB_PASSWORD']
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
            tls: Number.parseInt(process.env['REDIS_TLS']!)
        }
    }
}

export type RateLimitKeys = 'base' | 'admin' | 'gets' | 'post'
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
    }
}

export interface KmentsConfigTemplate {
    /** 前端的 URL */
    domUrl: URL
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
    }
}