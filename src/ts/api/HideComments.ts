import {ObjectId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {initRequest} from '../utils'
import {verifyAdminStatus} from './AdminCertificate'
import {getUserEmail} from './AuthCertificate'
import {loadRecentlyBody, rebuildRecentComments} from './RecentlyGetter'

// noinspection JSUnusedGlobalSymbols
/**
 * 隐藏指定评论
 *
 * POST: json {
 *     page: string     # 要隐藏的评论所在页面
 *     values: string[] # 要隐藏的评论的 ID
 * }
 */
export async function hideComments(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'hide', 'PUT')
    if (!checkResult) return
    let {page, values} = platform.readBodyAsJson()
    if (!(values && page))
        return platform.sendJson(400, {msg: 'page 或 values 值缺失'})
    const {config} = checkResult
    const pageId = `c-${config.unique(page)}`
    let fails: number
    if (await verifyAdminStatus(platform)) {
        fails = await hideCommentsWithAdmin(pageId, values)
    } else {
        const email = await getUserEmail(platform)
        if (!email) return platform.sendJson(200, {
            status: 401,
            msg: '未认证用户无权进行隐藏操作'
        })
        fails = await hideCommentsWithUser(pageId, values, email)
    }
    await updateRecently(values)
    platform.sendJson(200, {fails})
}

async function updateRecently(values: string[]) {
    const recentComments = await loadRecentlyBody()
    const oldLength = recentComments.length
    const removed = recentComments.filter(
        recently => !values.find(it => recently.id.toHexString() == it)
    )
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