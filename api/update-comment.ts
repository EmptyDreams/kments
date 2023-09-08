import {VercelRequest, VercelResponse} from '@vercel/node'
import {updateComment} from './lib/src/ts/api/CommentsEditor'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

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
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await updateComment(platform)
}