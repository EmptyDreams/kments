import {VercelRequest} from '@vercel/node'
import * as crypto from 'crypto'
import {Collection, Db, Document, MongoClient, ObjectId, WithId} from 'mongodb'
import {connectRedis, ipCount} from './RedisOperator'

let db: Db

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
 * @param key 分类
 * @param ip IP
 * @return {Promise<[number, number]>} [状态码，IP 访问次数]
 */
export async function rateLimit(key: string, ip: string | undefined): Promise<[number, number]> {
    if (!ip) return [400, -1]
    let blacked = blackMap.get(key)
    if (blacked?.has(ip)) return [429, -1]
    const time = Number.parseInt(process.env['RATE_LIMIT_TIME'] ?? '10000')
    const limit = Number.parseInt(process.env['RATE_LIMIT_COUNT'] ?? '100')
    const count = await ipCount(key, ip, time)
    if (count > limit) {
        if (!blacked) {
            blacked = new Set<string>()
            blackMap.set(key, blacked)
        }
        blacked.add(ip)
        return [429, count]
    }
    return [200, count]
}

export function calcHash(name: string, content: string): string {
    return crypto.createHash(name).update(content).digest('hex')
}

/** 重建最近评论索引表 */
export async function rebuildRecentComments(cache: boolean) {
    type Element = {id: ObjectId, pageId: string}
    const list: Element[] = []
    if (cache) {
        const oldData = await connectRedis().zrangebyscore('recentComments', '+inf', 10)
        list.push(
            ...oldData.map(it => {
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
        let index = list.findIndex(it => it.id.getTimestamp().getTime() > ele.id.getTimestamp().getTime())
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