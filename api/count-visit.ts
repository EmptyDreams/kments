import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectRedis, execPipeline} from '../src/ts/RedisOperator'
import {initRequest} from '../src/ts/utils'

const ipRecord = new Map<string, Set<string>>()
const globalIpRecord = new Set<string>()
const globalKey = 'count-all'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定页面的访问量（包括本次访问）
 *
 * 请求方法：POST (with text)
 *
 * 参数内容：页面的 pathname，留空表示获取全局统计
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, 'count', 'POST')
    if (!checkResult) return
    const {ip, config} = checkResult
    const page = request.body
    const redis = connectRedis()
    if (!page) {
        if (globalIpRecord.has(ip)) {
            response.status(200).json({
                status: 200,
                data: await redis.get(globalKey)
            })
        } else {
            globalIpRecord.add(ip)
            response.status(200).json({
                status: 200,
                data: await redis.incr(globalKey)
            })
        }
        return
    }
    const pageId = config.unique(page)
    const record = ipRecord.get(pageId)
    const key = `count:${pageId}`
    if (record) {
        if (record.has(ip)) {
            return response.status(200).json({
                status: 200,
                data: await redis.get(key)
            })
        } else record.add(ip)
    } else {
        const set = new Set<string>()
        set.add(ip)
        ipRecord.set(pageId, set)
    }
    if (globalIpRecord.has(ip)) {
        response.status(200).json({
            status: 200,
            data: await redis.incr(key)
        })
    } else {
        globalIpRecord.add(ip)
        const result = await execPipeline(redis.pipeline().incr(key).incr(globalKey))
        response.status(200).json({
            status: 200,
            data: result[0]
        })
    }
}