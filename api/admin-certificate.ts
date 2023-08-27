import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectRedis} from './utils/RedisOperator'
import {calcHash, initRequest} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 管理员身份认证
 *
 * 请求方法：POST (with text)
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, {allows: 'china'}, 'POST')
    if (!checkResult) return
    const password = request.body as string
    if (password != process.env['ADMIN_PASSWORD']) return response.status(200).json({
        status: 403,
        msg: '密码错误'
    })
    const url = process.env['DOM_URL']!
    const adminId = calcHash('md5', `${Date.now()}-${password}-${Math.random()}`)
    response.setHeader('Set-Cookie', `__Secure-admin="${adminId}"; Max-Age=2592000; Domain=${new URL(url).host}; Secure; HttpOnly; SameSite=None;`)
    await connectRedis().set(`admin`, adminId)
    response.status(200).json({
        status: 200
    })
}