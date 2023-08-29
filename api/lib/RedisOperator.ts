import Redis, {RedisOptions} from 'ioredis'
import {loadConfig} from './ConfigLoader'
import {rebuildRecentComments} from './utils'

let redis: Redis

/** 连接 Redis */
export function connectRedis(): Redis {
    if (redis) return redis
    const optional: RedisOptions = {
        lazyConnect: true
    }
    const helper = () => {
        const env = loadConfig().env.redis
        if (env.url) {
            return new Redis(env.url, {
                tls: {
                    rejectUnauthorized: env.tls
                }, ...optional
            })
        } else if (env.host) {
            return new Redis({
                host: env.host,
                port: env.port,
                password: env.password,
                tls: {
                    rejectUnauthorized: env.tls
                },
                ...optional
            })
        }
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
        await rebuildRecentComments()
    }
    [err, result] = list[pipeline.length - 1]
    if (err) throw err
    return result as number
}