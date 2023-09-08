import {VercelRequest, VercelResponse} from '@vercel/node'
import {ObjectId} from 'mongodb'
import {getAuthEmail} from '../src/ts/api/AuthCertificate'
import {verifyAdminStatus} from './admin-certificate'
import {connectDatabase} from '../src/ts/DatabaseOperator'
import {initRequest} from '../src/ts/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 修改评论内容
 *
 * 请求方法：PUT (with json cookie)
 *
 * 请求参数：
 *
 * + page - 页面 pathname
 * + id - 要修改的评论的 ID
 * + content - 修改后的内容
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, 'post', 'PUT')
    if (!checkResult) return
    const {config, location} = checkResult
    const {page, id, content} = request.body
    if (config.commentChecker.content?.(content))
        return response.status(200).json({
            status: 403,
            msg: '评论包含非法内容'
        })
    const collectionName = `c-${config.unique(page)}`
    const db = connectDatabase()
    if (await verifyAdminStatus(request)) {
        const result = await db.collection(collectionName).updateOne({
            _id: new ObjectId(id)
        }, {$set: {content}})
        if (result.modifiedCount == 1)
            response.status(200).json({status: 200})
        else
            response.status(200).json({status: 404})
    } else {
        const email = await getAuthEmail(request)
        if (!email) return response.status(200).json({
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
            response.status(200).json({status: 200})
        else
            response.status(200).json({status: 423})
    }
}