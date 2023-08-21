import {VercelRequest} from '@vercel/node'
import * as fs from 'fs'
import {Db, MongoClient} from 'mongodb'
import Redis from 'ioredis'
import path from 'path'

let db: Db
const redis = process.env['REDIS_URL'] ? new Redis(process.env['REDIS_URL']!) : new Redis({
    host: process.env['REDIS_HOST'],
    port: Number.parseInt(process.env['REDIS_PORT']!),
    password: process.env['REDIS_PASSWORD']
})

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
export function getUserIp(request: VercelRequest): string {
    const list = ['x-forwarded-for', 'x-real-ip', 'x-client-ip']
    for (let key of list) {
        const result = request.headers[key]
        if (result)
            return Array.isArray(result) ? result[0] : result
    }
    return request.socket.remoteAddress ?? ''
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

/** 指定 IP 访问计数 */
async function ipCount(key: string, ip: string, time: number): Promise<number> {
    const realKey = `${key}:${ip}`
    const now = Date.now()
    const multi = redis.multi()
    multi.zremrangebyscore(realKey, '-inf', now - time)
        .zadd(realKey, now, now)
        .zcard(realKey)
    const [error, result] = (await multi.exec())![2]
    if (error) throw error
    return result as number
}

export type IpLocation = {countryCode: string, prov?: string}

const ipLocationCache = new Map<string, IpLocation>()
//let ipReaderCache: Promise<ReaderModel>
let regionJson: Array<any>

/** 获取指定 IP 的地理位置 */
export async function getIpLocation(ip: string): Promise<IpLocation> {
    if (ip === '::1' || ip === '127.0.0.1')
        return {countryCode: 'CN'}
    const cache = ipLocationCache.get(ip)
    if (cache) return cache
    if (!regionJson)
        regionJson = JSON.parse(fs.readFileSync(path.resolve('./', 'region.json'), 'utf-8'))
    const dist = ipv4ToNumber(ip)
    let left = 0, right = regionJson.length
    do {
        const mid = (left + right) >>> 1
        const item = regionJson[mid]
        if (item.end < dist) left = mid + 1
        else if (item.start > dist) right = mid - 1
        else return {
                countryCode: 'CN',
                prov: item['loc']
            }
    } while (left <= right)
    return {
        countryCode: 'unknown',
        prov: 'unknown'
    }
    // if (!ipReaderCache)
    //     ipReaderCache = Reader.open(path.resolve('./', 'city.mmdb'))
    // return ipReaderCache.then(reader => {
    //     const result = reader.city(ip)
    //     return {
    //         countryCode: result.registeredCountry?.isoCode ?? 'unknown',
    //         prov: result.subdivisions?.[0]?.names['zh-CN']
    //     }
    // })
}

function ipv4ToNumber(ip: string): number {
    let result = 0
    ip.split('.')
        .map(it => Number.parseInt(it))
        .forEach(it => result = (result << 8) | it)
    return result >>> 0
}