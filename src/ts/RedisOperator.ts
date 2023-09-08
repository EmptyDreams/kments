import Redis, {RedisOptions} from 'ioredis'
import {ChainableCommander} from 'ioredis/built/utils/RedisCommander'
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
        const env = loadConfig().redis
        const tlsOptional = env.tls ? {} : {
            tls: {
                rejectUnauthorized: false
            }
        }
        if (env.url) {
            return new Redis(env.url, {
                ...tlsOptional, ...optional
            })
        } else if (env.host) {
            return new Redis({
                host: env.host,
                port: env.port,
                password: env.password,
                ...tlsOptional,
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
        .zremrangebyscore(realKey, '-inf', now - time)
        .zadd(realKey, now, now)
        .zcard('recentComments')
        .zcard(realKey)
    const list = await execPipeline(pipeline)
    const length = list[pipeline.length - 2]
    if (length < 10) {
        await rebuildRecentComments()
    }
    return list[pipeline.length - 1]
}

/** 执行 pipeline，当 defValue 未定义时遇到异常将会直接时函数失败 */
export async function execPipeline(pipeline: ChainableCommander, defValue?: any): Promise<any[]> {
    const result = await pipeline.exec()
    if (!result) throw 'result is null'
    let errFlag = false
    for (const [err] of result) {
        if (err) {
            errFlag = true
            console.error(err)
        }
    }
    if (errFlag && !defValue) throw 'exec 执行过程中出现异常'
    return result.map(([err, value]) => err ? defValue : value)
}