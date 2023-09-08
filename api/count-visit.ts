import {VercelRequest, VercelResponse} from '@vercel/node'
import {countVisit} from './lib/src/ts/api/VisitCounter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定页面的访问量（包括本次访问）
 *
 * 请求方法：POST (with text)
 *
 * 参数内容：页面的 pathname，留空表示获取全局统计
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await countVisit(platform)
}