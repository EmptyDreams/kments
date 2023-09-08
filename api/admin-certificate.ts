import {VercelRequest, VercelResponse} from '@vercel/node'
import {certifyAdmin} from './lib/src/ts/api/AdminCertificate'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 管理员身份认证
 *
 * 请求方法：POST (with text)
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await certifyAdmin(platform)
}