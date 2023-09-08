import {AnyBulkWriteOperation, Db, ObjectId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis} from '../RedisOperator'
import {initRequest, rebuildRecentComments} from '../utils'
import {verifyAdminStatus} from './AdminCertificate'
import {CommentBody} from './CommentsPoster'

/**
 * 删除评论
 *
 * DELETE: json {
 *      pagePathname0: ['id0', 'id1', ...],
 *      ...,
 * }（`key` 表示要删除的 ID 所在的页面的 pathname，数组中的元素是评论的 ID）
 */
export async function deleteComments(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'delete', 'DELETE')
    if (!checkResult) return
    if (!await verifyAdminStatus(platform))
        return platform.sendNull(403)
    const {config} = checkResult
    const body = platform.readBodyAsJson()
    const recentComments = await connectRedis().zrevrangebyscore('recentComments', '+inf', 10)
    const oldLength = recentComments.length
    const db = connectDatabase()
    await Promise.all(
        Object.getOwnPropertyNames(body)
            .map(it => deleteCommentsFromCollection(db, config.unique(it), body[it], recentComments))
    )
    if (recentComments.length != oldLength)
        await rebuildRecentComments(recentComments)
    platform.sendNull(200)
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