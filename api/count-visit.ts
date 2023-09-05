import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectRedis} from './lib/RedisOperator'
import {initRequest} from './lib/utils'

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
        const result = await redis.pipeline().incr(key).incr(globalKey).exec()
        if (!result) throw '未接受到返回值'
        let flag = false
        for (let item of result) {
            if (item[0]) {
                console.error(item[0])
                flag = true
            }
        }
        if (flag) throw '统计时发生错误'
        response.status(200).json({
            status: 200,
            data: result[0][1]
        })
    }
}