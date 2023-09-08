import * as crypto from 'crypto'
import {Collection, ObjectId} from 'mongodb'
import {KmentsConfig, loadConfig, RateLimitKeys} from './ConfigLoader'
import {connectDatabase} from './DatabaseOperator'
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
    if (!platform.referer?.startsWith(url)) {
        platform.sendNull(403)
        return false
    }
    if (!allowMethods.includes(platform.method)) {
        platform.sendJson(200, {
            status: 405,
            msg: `仅支持 ${allowMethods} 访问`
        })
        return false
    }
    const ip = platform.ip
    if (!ip) {
        platform.sendJson(200, {
            status: 400,
            msg: `缺失 IP 值`
        })
        return false
    }
    let location = platform.location
    const limitConfig = config.rateLimit?.[rateLimitKey]
    let count = -1
    if (limitConfig) {
        if (!location && limitConfig.region != 'none') {
            platform.sendJson(200, {
                status: 403,
                msg: '定位失败，禁止未知区域的用户访问'
            })
            return false
        }
        switch (limitConfig.region) {
            case "main":
                if (!location || ['澳门', '香港', '台湾'].includes(location)) {
                    platform.sendJson(200, {
                        status: 403,
                        msg: `仅允许大陆用户访问`
                    })
                    return false
                }
                break
            case "china":
                if (!location) {
                    platform.sendJson(200, {
                        status: 403,
                        msg: '禁止国外用户访问'
                    })
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

/**
 * 重建最近评论索引表
 * @param cache 现有的队列（按发布日期从新到旧排列）
 */
export async function rebuildRecentComments(cache?: string[]) {
    type Element = {id: ObjectId, pageId: string}
    const list: Element[] = []
    if (cache) {
        list.push(
            ...cache.map(it => {
                const data = it.split(':', 2)
                return {
                    id: new ObjectId(data[0]),
                    pageId: data[1]
                }
            })
        )
    }
    const db = connectDatabase()
    const collections = (await db.collections()).filter(it => it.collectionName.startsWith('c-'))
    function insertElement(ele: Element) {
        let index = list.findIndex(it => it.id.getTimestamp().getTime() < ele.id.getTimestamp().getTime())
        if (index == -1) index = list.length
        list.splice(index, 0, ele)
        if (list.length > 10)
            list.pop()
    }
    async function findAll(collection: Collection): Promise<Element[]> {
        const array = await collection.find({
            reply: {$exists: false},
            _id: {$lt: list[list.length - 1].id}
        }, {
            projection: {_id: true}
        }).limit(10)
            .toArray()
        return array.map(it => ({id: it._id, pageId: collection.collectionName}))
    }
    async function sequence() {
        for (let collection of collections) {
            const array = await findAll(collection)
            for (let item of array) {
                insertElement(item)
            }
        }
    }
    async function parallel() {
        await Promise.all(
            collections.map(
                collection => findAll(collection)
                    .then(array => array.forEach(it => insertElement(it)))
            )
        )
    }
    // 数量小于阈值时串行执行，否则并行执行
    if (collections.length < 25) await sequence()
    else await parallel()
    await execPipeline(
        connectRedis().pipeline()
            .zremrangebyscore('recentComments', '-inf', '+inf')
            .zadd(
                'recentComments',
                ...list.flatMap(it => [it.id.getTimestamp().getTime(), `${it.id}:${it.pageId}`])
            )
    )
}