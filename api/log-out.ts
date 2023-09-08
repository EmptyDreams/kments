import {VercelRequest, VercelResponse} from '@vercel/node'
import {logoutKments} from './lib/src/ts/api/Logout'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 退出登录
 *
 * 请求方法：POST (none body)
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await logoutKments(platform)
}