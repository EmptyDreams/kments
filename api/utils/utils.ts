import {VercelRequest} from '@vercel/node'
import * as crypto from 'crypto'
import {Db, MongoClient} from 'mongodb'
import {ipCount} from './RedisOperator'

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
 * @param time 时间周期
 * @param limit 次数限制
 * @return {Promise<[number, number]>} [状态码，IP 访问次数]
 */
export async function rateLimit(key: string, ip: string | undefined, time: number, limit: number): Promise<[number, number]> {
    if (!ip) return [400, -1]
    let blacked = blackMap.get(key)
    if (blacked?.has(ip)) return [429, -1]
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