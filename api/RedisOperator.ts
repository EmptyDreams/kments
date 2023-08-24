import Redis, {RedisOptions} from 'ioredis'

let redis: Redis

/** 连接 Redis */
function connectRedis(): Redis {
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
            return new Redis(Object.assign({
                host: process.env['REDIS_HOST'],
                port: Number.parseInt(process.env['REDIS_PORT']!),
                password: process.env['REDIS_PASSWORD'],
            }, optional))
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
        .zcard(realKey)
    const list = await pipeline.exec()
    const [err, result] = list![pipeline.length - 1]
    if (err) throw err
    return result as number
}