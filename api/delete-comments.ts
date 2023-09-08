import {VercelRequest, VercelResponse} from '@vercel/node'
import {deleteComments} from './lib/src/ts/api/CommentDeleter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

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
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await deleteComments(platform)
}