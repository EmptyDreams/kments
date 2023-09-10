import * as crypto from 'crypto'
import {KmentsConfig, loadConfig, RateLimitKeys} from './ConfigLoader'
import {KmentsPlatform} from './KmentsPlatform'
import {connectRedis, execPipeline, ipCount} from './RedisOperator'

export const isDev = process.env['VERCEL_ENV'] == 'development'

const blackList = new Set<string>()

/**
 * 限制 IP 访问频率
 * @return {Promise<[number, number]>} [状态码，IP 访问次数]
 */
export async function rateLimit(key: RateLimitKeys, ip: string, config: KmentsConfig): Promise<[number, number]> {
    if (blackList.has(ip)) return [429, -1]
    const remoteBlackCheck = await execPipeline(
        connectRedis().pipeline()
            .sismember(`black-${key}`, ip)
            .exists(`black-ex-${ip}`)
    )
    if (remoteBlackCheck[0]) {
        blackList.add(ip)
        return [429, -1]
    }
    if (remoteBlackCheck[1]) return [429, -1]
    const limit = config.rateLimit![key]
    const count = await ipCount(key, ip, limit.cycle)
    for (let level of limit.level) {
        if (count < level[0]) continue
        if (level[1] == -1) {
            // noinspection FallThroughInSwitchStatementJS
            switch (level[2]) {
                case -2:
                    await execPipeline(
                        connectRedis().pipeline()
                            .sadd(`black-${key}`, ip)
                            .del(`${key}:${ip}`)
                    )
                case -1:
                    blackList.add(ip)
                    break
                default:
                    await connectRedis().setex(`black-ex-${ip}`, level[2], 0)
                    break
            }
            return [429, count]
        } else {
            return new Promise(resolve => {
                setTimeout(() => resolve([200, count]), level[1])
            })
        }
    }
    return [200, count]
}

/** 计算指定字符串的哈希值 */
export function calcHash(name: string, content: string): string {
    return crypto.createHash(name).update(content).digest('hex')
}

/** 检测指定邮箱是否合法 */
export function checkEmail(email: string): boolean {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
}

export interface RequestInfo {
    ip: string,
    location?: string,
    count: number,
    config: KmentsConfig
}

/** 对请求进行合法性检查 */
export async function initRequest(
    platform: KmentsPlatform,
    rateLimitKey: RateLimitKeys, ...allowMethods: string[]
): Promise<false | RequestInfo> {
    const config = loadConfig()
    if (isDev) {
        platform.setHeader('Access-Control-Allow-Origin', `http://${process.env['VERCEL_URL']}`)
        return {location: '中国', ip: '::1', count: 0, config}
    }
    const url = config.admin.domUrl.href
    if (!platform.referer?.startsWith(url) || !platform.origin?.startsWith(url)) {
        platform.sendNull(403)
        return false
    }
    if (!allowMethods.includes(platform.method)) {
        platform.sendJson(405, {msg: `仅支持 ${allowMethods} 访问`})
        return false
    }
    const ip = platform.ip
    if (!ip) {
        platform.sendJson(400, {msg: `缺失 IP 值`})
        return false
    }
    let location = platform.location
    const limitConfig = config.rateLimit?.[rateLimitKey]
    let count = -1
    if (limitConfig) {
        if (!location && limitConfig.region != 'none') {
            platform.sendJson(403, {msg: '定位失败，禁止未知区域的用户访问'})
            return false
        }
        switch (limitConfig.region) {
            case "main":
                if (!location || ['澳门', '香港', '台湾'].includes(location)) {
                    platform.sendJson(403, {msg: `仅允许大陆用户访问`})
                    return false
                }
                break
            case "china":
                if (!location) {
                    platform.sendJson(403, {msg: '禁止国外用户访问'})
                    return false
                }
                break
        }
        if (!location) location = '国外'
        const [status, amount] = await rateLimit(rateLimitKey, ip, config)
        if (status != 200) {
            platform.sendNull(status)
            return false
        }
        count = amount
    }
    platform.setHeader('Access-Control-Allow-Origin', url)
    return {location, count, ip, config}
}