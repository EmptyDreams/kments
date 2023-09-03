import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectRedis} from './lib/RedisOperator'
import {calcHash, initRequest, isDev} from './lib/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 管理员身份认证
 *
 * 请求方法：POST (with text)
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response, 'admin', 'POST'
    )
    if (!checkResult) return
    const {config} = checkResult
    const password = request.body as string
    if (password != config.env.admin.password) return response.status(200).json({
        status: 403,
        msg: '密码错误'
    })
    const adminId = calcHash('md5', `${Date.now()}-${password}-${Math.random()}`)
    const domain = isDev ? 'localhost' : config.domUrl.host
    response.setHeader(
        'Set-Cookie',
        `admin="${adminId}"; Max-Age=2592000; Domain=${domain}; Path=/; Secure; HttpOnly; SameSite=None;`
    )
    await connectRedis().set(`admin`, adminId)
    response.status(200).json({
        status: 200
    })
}

/** 校验管理员身份 */
export async function verifyAdminStatus(request: VercelRequest): Promise<boolean> {
    const cookies = request.cookies
    if (!('admin' in cookies)) return false
    const value = cookies.admin
    const realId = await connectRedis().get('admin')
    return realId == value
}