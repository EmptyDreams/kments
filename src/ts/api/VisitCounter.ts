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

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定所有页面的访问量，不会增加这些页面的计数
 *
 * POST: json as string[]（表示要获取的页面的 pathname）
 */
export async function getPagesVisit(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'count', 'POST')
    if (!checkResult) return
    const {config} = checkResult
    const body = platform.readBodyAsArray<string>()
    const pipeline = connectRedis().pipeline()
    for (let pathname of body) {
        pipeline.get(`count:${config.unique(pathname)}`)
    }
    platform.sendJson(200, {
        status: 200,
        data: await execPipeline(pipeline)
    })
}