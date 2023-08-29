import {VercelRequest, VercelResponse} from '@vercel/node'
import {Db, ObjectId} from 'mongodb'
import {connectDatabase} from './lib/DatabaseOperator'
import {MainCommentBody} from './post-comment'
import {connectRedis} from './lib/RedisOperator'
import {initRequest, rebuildRecentComments} from './lib/utils'

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
 *  pageId0: ['id0', 'id1', ...],
 *  pageId1: ...,
 *  ...
 * }
 * ```
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response,
        'admin', {allows: 'china'},
        'DELETE'
    )
    if (!checkResult) return
    const adminId = request.cookies.admin
    if (!adminId) return response.status(401).end()
    const realId = await connectRedis().get('admin')
    if (adminId != realId) return response.status(403).end()
    const body = request.body
    const recentComments = await connectRedis().zrevrangebyscore('recentComments', '+inf', 10)
    const oldLength = recentComments.length
    const db = await connectDatabase()
    await Promise.all(
        Object.getOwnPropertyNames(body)
            .map(it => deleteCommentsFromCollection(db, it, body[it], recentComments))
    )
    if (recentComments.length != oldLength)
        await rebuildRecentComments(recentComments)
    response.status(200).end()
}

async function deleteCommentsFromCollection(
    db: Db, pageId: string, list: string[], recentComments: string[]
) {
    const collection = db.collection<MainCommentBody>(`c-${encodeURIComponent(pageId)}`)
    const decrease: {[propName: string]: number} = {}
    for (let commentId of list) {
        const comment = await collection.findOneAndDelete(
            {_id: new ObjectId(commentId)},
            {projection: {reply: true, children: true}}
        )
        if ('reply' in comment) {
            if (!list.includes(commentId))
                decrease[commentId] = (decrease[commentId] ?? 0) - 1
        } else if ('children' in comment) {
            const index = recentComments.findIndex(it => it.startsWith(commentId))
            if (index >= 0) recentComments.splice(index, 1)
            const children = comment.children as string[]
            await collection.deleteMany({_id: {$in: children.map(it => new ObjectId(it))}})
        }
    }
    await Promise.all(
        Object.getOwnPropertyNames(decrease)
            .map(id => collection.updateOne(
                    {_id: new ObjectId(id)}, {$inc: {subCount: decrease[id]}}
                )
            )
    )
}