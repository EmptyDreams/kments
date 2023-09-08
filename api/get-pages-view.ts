import {VercelRequest, VercelResponse} from '@vercel/node'
import {getPagesVisit} from './lib/src/ts/api/VisitCounter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定所有页面的访问量，不会增加这些页面的访问量
 *
 * 请求方法：POST (with json)
 *
 * 请求内容应该为一个字符串数组，包含要获取的页面的 pathname
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await getPagesVisit(platform)
}