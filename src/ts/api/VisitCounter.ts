import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis, execPipeline} from '../RedisOperator'
import {initRequest} from '../utils'

const ipRecord = new Map<string, Set<string>>()
const globalIpRecord = new Set<string>()
const globalKey = 'count-all'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定页面的访问量（包括本次访问）
 *
 * POST: text（要统计的页面的 pathname，留空表示进行全局统计）
 */
export async function countVisit(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'count', 'POST')
    if (!checkResult) return
    const {ip, config} = checkResult
    const page = platform.readBodyAsJson()
    const redis = connectRedis()
    if (!page) {
        if (globalIpRecord.has(ip)) {
            platform.sendJson(200, {
                status: 200,
                data: await redis.get(globalKey)
            })
        } else {
            globalIpRecord.add(ip)
            platform.sendJson(200, {
                status: 200,
                data: await redis.incr(globalKey)
            })
        }
        return
    }
    const pageId = config.unique(page)
    let record = ipRecord.get(pageId)
    const key = `count:${pageId}`
    if (record) {
        if (record.has(ip)) {
            return platform.sendJson(200, {
                status: 200,
                data: await redis.get(key)
            })
        } else record.add(ip)
    } else {
        record = new Set<string>()
        record.add(ip)
        ipRecord.set(pageId, record)
    }
    const pipeline = redis.pipeline()
    pipeline.incr(key)
    if (!globalIpRecord.has(ip))
        pipeline.incr(globalKey)
    const result = await execPipeline(pipeline)
    platform.sendJson(200, {
        status: 200,
        data: result[0]
    })
}