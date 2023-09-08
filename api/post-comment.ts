import {VercelRequest, VercelResponse} from '@vercel/node'
import {postComment} from './lib/src/ts/api/CommentsPoster'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 发布一个评论
 *
 * 请求方法：POST (with json)
 *
 * body 键值说明：
 *
 * + page: string - 当前页面的 URL
 * + name: string - 发布人昵称
 * + email: string - 发布人邮箱
 * + link: string - 发布人的主页（可选）
 * + content: string - 评论内容（HTML）
 * + pageTitle: string - 当前页面的名称
 * + reply: string - 要回复的评论的 ID（可选）
 * + at: {string|string[]} - 要 @ 的评论的 ID（可选）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await postComment(platform)
}