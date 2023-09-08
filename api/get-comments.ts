import {VercelRequest, VercelResponse} from '@vercel/node'
import {getComments} from './lib/src/ts/api/CommentsGetter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定范围内的评论
 *
 * 请求方法：GET
 *
 * 请求参数列表：
 *
 * + `page`: 页面 pathname
 * + `start`: 起始下标（从零开始，缺省 0）
 * + `len`: 获取的评论数量（缺省 10）
 * + `truth`: 是否显示隐藏的评论，仅管理员身份有效（缺省 0）[0-不显示，1-显示，2-只显示隐藏评论]
 * + `id`: 父评论 ID，当填写该字段后表明获取指定评论的子评论（可空）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await getComments(platform)
}