import exp from 'constants'
import Redis, {RedisOptions} from 'ioredis'
import {ObjectId} from 'mongodb'

let redis: Redis

/** 连接 Redis */
export function connectRedis(): Redis {
    if (redis) return redis
    const optional: RedisOptions = {
        lazyConnect: true,
        tls: {
            rejectUnauthorized: false
        }
    }
    const helper = () => {
        if ('KV_URL' in process.env)
            return new Redis(process.env['KV_URL']!, optional)
        if ('REDIS_URL' in process.env)
            return new Redis(process.env['REDIS_URL']!, optional)
        if ('REDIS_HOST' in process.env)
            return new Redis({
                host: process.env['REDIS_HOST'],
                port: Number.parseInt(process.env['REDIS_PORT']!),
                password: process.env['REDIS_PASSWORD'],
                ...optional
            })
        throw '没有配置 Redis'
    }
    return redis = helper()
}

/**
 * 统计指定 IP 的访问数量
 * @param key 统计分类
 * @param ip 指定的 IP
 * @param time 时间限制（ms）
 */
export async function ipCount(key: string, ip: string, time: number): Promise<number> {
    const realKey = `${key}:${ip}`
    const now = Date.now()
    const pipeline = connectRedis().pipeline()
    pipeline.zremrangebyscore(realKey, '-inf', now - time)
        .zadd(realKey, now, now)
        .zcard('recentComments')
        .zcard(realKey)
    const list = (await pipeline.exec())!
    let err, result
    [err, result] = list[pipeline.length - 2]
    if (err) throw err
    if ((result as number) < 10) {
        const pipeline = connectRedis().pipeline()
        for (let i = result as number; i < 10; ++i) {
            pipeline.zadd('recentComments', i, i.toString())
        }
        await pipeline.exec()
    }
    [err, result] = list[pipeline.length - 1]
    if (err) throw err
    return result as number
}