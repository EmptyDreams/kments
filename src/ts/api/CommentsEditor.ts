import {ObjectId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {initRequest} from '../utils'
import {verifyAdminStatus} from './AdminCertificate'
import {getAuthEmail} from './AuthCertificate'

// noinspection JSUnusedGlobalSymbols
/**
 * 修改评论内容
 *
 * PUT: json {
 *      page: string    # 评论所在页面的 pathname
 *      id: string      # 要修改的评论的 ID
 *      content: string # 修改后的内容（HTML 格式）
 * }
 */
export async function updateComment(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'post', 'PUT')
    if (!checkResult) return
    const {config, location} = checkResult
    const {page, id, content} = platform.readBodyAsJson()
    if (config.commentChecker.content?.(content))
        return platform.sendJson(200, {
            status: 403,
            msg: '评论包含非法内容'
        })
    const collectionName = `c-${config.unique(page)}`
    const db = connectDatabase()
    if (await verifyAdminStatus(platform)) {
        const result = await db.collection(collectionName).updateOne({
            _id: new ObjectId(id)
        }, {$set: {content}})
        if (result.modifiedCount == 1)
            platform.sendJson(200, {status: 200})
        else
            platform.sendJson(200, {status: 404})
    } else {
        const email = await getAuthEmail(platform)
        if (!email) return platform.sendJson(200, {
            status: 401,
            msg: '未认证用户禁止修改评论内容'
        })
        const commentId = new ObjectId(id)
        const publishTime = Math.floor(commentId.getTimestamp().getTime() / 1000)
        const result = await db.collection(collectionName)
            .updateOne({
                    _id: {
                        $eq: commentId,
                        $gt: new ObjectId((publishTime - config.commentUpdateTimeLimit!).toString(16) + '0000000000000000')
                    }, email, location
                }, {$set: {content}}
            )
        if (result.modifiedCount == 1)
            platform.sendJson(200, {status: 200})
        else
            platform.sendJson(200, {status: 423})
    }
}