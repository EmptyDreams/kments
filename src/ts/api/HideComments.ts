import {ObjectId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis} from '../RedisOperator'
import {initRequest, rebuildRecentComments} from '../utils'
import {verifyAdminStatus} from './AdminCertificate'
import {getAuthEmail} from './AuthCertificate'

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
        const email = await getAuthEmail(platform)
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