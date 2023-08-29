import {VercelRequest, VercelResponse} from '@vercel/node'
import * as crypto from 'crypto'
import {findOnVercel} from 'ip-china-location'
import {Collection, Db, MongoClient, ObjectId} from 'mongodb'
import path from 'path'
import {KmentsConfig, loadConfig, RateLimitKeys} from './ConfigLoader'
import {connectRedis, ipCount} from './RedisOperator'

let db: Db
export const isDev = process.env['VERCEL_ENV'] == 'development'

/** 连接数据库 */
export async function connectDatabase(): Promise<Db> {
    if (db) return db
    // noinspection SpellCheckingInspection
    const client = new MongoClient(
        `mongodb+srv://${process.env['MONGODB_NAME']}:${process.env['MONGODB_PASSWORD']}@comments.rwouas6.mongodb.net/?retryWrites=true&w=majority`,
        {compressors: ['zstd', 'zlib']}
    )
    db = client.db('kments')
    return db
}

/** 获取用户 IP 地址 */
export function getUserIp(request: VercelRequest): string | undefined {
    const helper = () => {
        const list = ['x-forwarded-for', 'x-real-ip', 'x-client-ip']
        for (let key of list) {
            const result = request.headers[key]
            if (result)
                return Array.isArray(result) ? result[0] : result
        }
        return request.socket.remoteAddress
    }
    const result = helper()
    if (result == '127.0.0.1' || result == '::1') return undefined
    return result
}

const blackMap = new Map<string, Set<string>>()

/**
 * 限制 IP 访问频率
 * @return {Promise<[number, number]>} [状态码，IP 访问次数]
 */
export async function rateLimit(key: RateLimitKeys, ip: string, config: KmentsConfig): Promise<[number, number]> {
    let blacked = blackMap.get(key)
    if (blacked?.has(ip)) return [429, -1]
    function initBlacked() {
        if (!blacked) {
            blacked = new Set()
            blackMap.set(key, blacked)
        }
        return blacked
    }
    const remoteBlackCheck = await connectRedis().pipeline()
        .sismember(`black-${key}`, ip)
        .exists(`black-ex-${ip}`)
        .exec()
    if (remoteBlackCheck![0][1]) {
        initBlacked().add(ip)
        return [429, -1]
    }
    if (remoteBlackCheck![1][1]) return [429, -1]
    const limit = config.rateLimit?.[key]
    if (!limit) return [200, -1]
    const count = await ipCount(key, ip, limit.cycle)
    for (let level of limit.level) {
        if (count < level[0]) continue
        if (level[1] == -1) {
            // noinspection FallThroughInSwitchStatementJS
            switch (level[2]) {
                case -2:
                    await connectRedis().pipeline()
                        .sadd(`black-${key}`, ip)
                        .del(`${key}:${ip}`)
                        .exec()
                case -1:
                    initBlacked().add(ip)
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

export interface RegionLimit {
    /** 访问区域限制方法（中国大陆、中国、无限制） */
    allows: 'main' | 'china' | 'all',
    /** 是否允许未知地域的访问 */
    allow_unknown?: boolean
}

export interface RequestInfo {
    ip: string,
    location?: string,
    count: number,
    config: KmentsConfig
}

/** 对请求进行合法性检查 */
export async function initRequest(
    request: VercelRequest, response: VercelResponse,
    rateLimitKey: RateLimitKeys, regionLimit: RegionLimit, ...allowMethods: string[]
): Promise<false | RequestInfo> {
    const config = await loadConfig()
    if (isDev) {
        response.setHeader('Access-Control-Allow-Origin', `http://${process.env['VERCEL_URL']}`)
        return {location: '中国', ip: '::1', count: 0, config}
    }
    const url = config.domUrl.href
    if (!request.headers.referer?.startsWith(url)) {
        response.status(403).end()
        return false
    }
    if (!allowMethods.includes(request.method!)) {
        response.status(200).json({
            status: 405,
            msg: `仅支持 ${allowMethods} 访问`
        })
        return false
    }
    const ip = getUserIp(request)
    if (!ip) {
        response.status(200).json({
            status: 400,
            msg: `缺失 IP 值`
        })
        return false
    }
    let location = findOnVercel(request, path.resolve('./', 'private', 'region.bin'), ip)
    if (!location && !regionLimit.allow_unknown) {
        response.status(200).json({
            status: 403,
            msg: '定位失败，禁止未知区域的用户访问'
        })
        return false
    }
    switch (regionLimit.allows) {
        case "main":
            if (!location || ['澳门', '香港', '台湾'].includes(location)) {
                response.status(200).json({
                    status: 403,
                    msg: `仅允许大陆用户访问`
                })
                return false
            }
            break
        case "china":
            if (!location) {
                response.status(200).json({
                    status: 403,
                    msg: '禁止国外用户访问'
                })
                return false
            }
            break
    }
    if (!location) location = '国外'
    const [status, count] = await rateLimit(rateLimitKey, ip, config)
    if (status != 200) {
        response.status(status).end()
        return false
    }
    response.setHeader('Access-Control-Allow-Origin', url)
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
    const db = await connectDatabase()
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
    await connectRedis().pipeline()
        .zremrangebyscore('recentComments', '-inf', '+inf')
        .zadd(
            'recentComments',
            ...list.flatMap(it => [it.id.getTimestamp().getTime(), `${it.id}:${it.pageId}`])
        ).exec()
}