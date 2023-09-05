import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectRedis} from './lib/RedisOperator'
import {initRequest} from './lib/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定所有页面的访问量，不会增加这些页面的访问量
 *
 * 请求方法：POST (with json)
 *
 * 请求内容应该为一个字符串数组，包含要获取的页面的 pathname
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, 'count', 'POST')
    if (!checkResult) return
    const {config} = checkResult
    const ids = request.body as string[]
    const pipeline = connectRedis().pipeline()
    for (let pathname of ids) {
        pipeline.get(`count:${config.unique(pathname)}`)
    }
    const result = await pipeline.exec()
    if (!result) throw '未接收到返回值'
    response.status(200).json({
        status: 200,
        data: result.map(it => it[0] ? -1 : it[1])
    })
}