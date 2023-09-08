import {VercelRequest, VercelResponse} from '@vercel/node'
import {certifyUser} from './lib/src/ts/api/AuthCertificate'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

// noinspection JSUnusedGlobalSymbols
/**
 * 用户身份认证
 *
 * 请求方法：POST (with json cookie)
 *
 * 参数列表如下：
 *
 * + email - 邮箱
 * + code - 验证码（可选）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await certifyUser(platform)
}