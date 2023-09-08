import {VercelRequest, VercelResponse} from '@vercel/node'
import {hideComments} from './lib/src/ts/api/HideComments'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

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
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await hideComments(platform)
}