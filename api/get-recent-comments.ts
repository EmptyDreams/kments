import {VercelRequest, VercelResponse} from '@vercel/node'
import {getRecently} from './lib/src/ts/api/RecentlyGetter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取最新的评论
 *
 * 请求方法：GET
 *
 * 参数解释：
 *
 * + limit - 数量限制（最大为 10，缺省 5）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await getRecently(platform)
}