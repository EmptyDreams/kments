import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectRedis} from './lib/RedisOperator'
import {calcHash, initRequest, isDev} from './lib/utils'

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
    const checkResult = await initRequest(
        request, response,
        'login', {allows: 'china'},
        'POST'
    )
    if (!checkResult) return
    const {config} = checkResult
    const {cookies, body} = request
    if ('login-id' in cookies)
        return response.status(200).json({status: 304})
    const domain = isDev ? 'localhost' : config.domUrl.host
    const createCookie = (name: string, value: string, validity: number) =>
        `${name}=${value}; Max-Age=${validity}; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`
    const email = body.email as string
    if (!('email' in body)) return response.status(200).json({
        status: 400,
        msg: '缺少 email 字段'
    })
    const redisKey = `login-code-${email}`
    if ('code' in body) {
        const realCode = await connectRedis().get(redisKey)
        if (body.code != realCode)
            return response.status(200).json({status: 403})
        const realId = calcHash('md5', `login-code-${Date.now()}-${email}`)
        await connectRedis().pipeline()
            .del(redisKey)
            .setex(`login-id-${email}`, 2592000, realId)
            .exec()
        response.setHeader('Set-Cookie', createCookie('kments-login-code', realId, 2592000))
        response.status(200).json({status: 200})
    } else {
        if (await connectRedis().exists(redisKey))
            return response.status(200).json({
                status: 429,
                msg: '请求发送验证码过于频繁'
            })
        const code = generateCode(6)
        await connectRedis().setex(redisKey, 600, code)
        response.status(200).json({status: 200})
    }
}

function generateCode(length: number): string {
    let result = ''
    for (let i = 0; i != length; ++i) {
        result += Math.floor(Math.random() * 16).toString(16)
    }
    return result
}