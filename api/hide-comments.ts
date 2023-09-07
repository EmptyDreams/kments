import {VercelRequest, VercelResponse} from '@vercel/node'
import {ObjectId} from 'mongodb'
import {verifyAdminStatus} from './admin-certificate'
import {getAuthEmail} from './auth-certificate'
import {connectDatabase} from './lib/DatabaseOperator'
import {connectRedis} from './lib/RedisOperator'
import {initRequest, rebuildRecentComments} from './lib/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 隐藏指定的评论，管理员与用户均可使用
 *
 * 请求方法：PUT (with json and cookie)
 *
 * 参数列表如下：
 *
 * + page - 页面 pathname
 * + values - 要隐藏的评论的 ID
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, 'hide', 'PUT')
    if (!checkResult) return
    let {page, values} = request.body
    if (!(values && page)) return response.status(200).json({
        status: 400,
        msg: 'page 或 values 值缺失'
    })
    const {config} = checkResult
    const pageId = `c-${encodeURIComponent(config.unique(page))}`
    let count: number
    if (await verifyAdminStatus(request)) {
        count = await hideCommentsWithAdmin(pageId, values)
    } else {
        const email = await getAuthEmail(request)
        if (!email) return response.status(200).json({
            status: 401,
            msg: '未认证用户无权进行隐藏操作'
        })
        count = await hideCommentsWithUser(pageId, values, email)
    }
    await updateRecently(values)
    response.status(200).json({
        status: 200, fails: count
    })
}

async function updateRecently(values: string[]) {
    const recentComments = await connectRedis().zrevrangebyscore('recentComments', '+inf', 10)
    const oldLength = recentComments.length
    const removed = recentComments.filter(recently => !values.find(it => recently.startsWith(it)))
    if (removed.length != oldLength)
        await rebuildRecentComments(removed)
}

async function hideCommentsWithAdmin(pageId: string, values: string[]): Promise<number> {
    const db = connectDatabase()
    const result = await db.collection(pageId)
        .updateMany(
            {_id: {$in: values.map(it => new ObjectId(it))}},
            {$set: {hide: true}}
        )
    return result.modifiedCount
}

async function hideCommentsWithUser(pageId: string, values: string[], email: string): Promise<number> {
    const db = connectDatabase()
    const result = await db.collection(pageId)
        .updateMany({
            _id: {$in: values.map(it => new ObjectId(it))},
            email: email
        }, {$set: {hide: true}})
    return result.modifiedCount
}