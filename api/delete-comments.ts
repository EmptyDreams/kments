import {VercelRequest, VercelResponse} from '@vercel/node'
import {AnyBulkWriteOperation, Db, ObjectId} from 'mongodb'
import {verifyAdminStatus} from './admin-certificate'
import {connectDatabase} from '../src/ts/DatabaseOperator'
import {CommentBody} from './post-comment'
import {connectRedis} from '../src/ts/RedisOperator'
import {initRequest, rebuildRecentComments} from '../src/ts/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 删除评论
 *
 * 请求方法：DELETE (with json and cookie)
 *
 * body 值应当为一个对象，表明要删除的评论的 ID 和其所在页面的 ID，删除评论时同时删除子评论，例如：
 *
 * ```
 * {
 *  pagePathname0: ['id0', 'id1', ...],
 *  pagePathname1: ...,
 *  ...
 * }
 * ```
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response, 'delete', 'DELETE'
    )
    if (!checkResult) return
    if (!await verifyAdminStatus(request)) return response.status(403).end()
    const {config} = checkResult
    const body = request.body
    const recentComments = await connectRedis().zrevrangebyscore('recentComments', '+inf', 10)
    const oldLength = recentComments.length
    const db = connectDatabase()
    await Promise.all(
        Object.getOwnPropertyNames(body)
            .map(it => deleteCommentsFromCollection(db, config.unique(it), body[it], recentComments))
    )
    if (recentComments.length != oldLength)
        await rebuildRecentComments(recentComments)
    response.status(200).end()
}

async function deleteCommentsFromCollection(
    db: Db, pageId: string, list: string[], recentComments: string[]
) {
    const collection = db.collection<CommentBody>(`c-${pageId}`)
    const decrease = new Map<string, number>()
    const result: AnyBulkWriteOperation<CommentBody>[] = []
    await Promise.all(list.map(async commentId => {
        const comment = await collection.findOneAndDelete(
            {_id: new ObjectId(commentId)},
            {projection: {reply: true}}
        )
        if ('reply' in comment) {
            const reply = comment.reply as string
            if (!list.includes(reply))
                decrease.set(reply, (decrease.get(reply) ?? 0) - 1)
        } else {
            const index = recentComments.findIndex(it => it.startsWith(commentId))
            if (index >= 0) recentComments.splice(index, 1)
            result.push({
                deleteMany: {filter: {reply: commentId}}
            })
        }
    }))
    await collection.bulkWrite([
        ...result,
        ...Array.from(decrease).map(item => ({
            updateOne: {
                filter: {_id: new ObjectId(item[0])},
                update: {$inc: {subCount: item[1]}}
            }
        }))
    ])
}