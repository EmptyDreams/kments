import {VercelRequest, VercelResponse} from '@vercel/node'
import {connectDatabase} from './lib/DatabaseOperator'
import {sendAuthCodeTo} from './lib/Email'
import {connectRedis} from './lib/RedisOperator'
import {calcHash, checkEmail, initRequest, isDev} from './lib/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 用户身份认证
 *
 * 请求方法：POST (with json cookie)
 *
 * 参数列表如下：
 *
 * + name - 用户名（可选）
 * + email - 邮箱
 * + code - 验证码（可选）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response, 'login', 'POST'
    )
    if (!checkResult) return
    const {config} = checkResult
    const {cookies, body} = request
    if ('login-id' in cookies)
        return response.status(200).json({status: 304})
    const domain = isDev ? 'localhost' : config.domUrl.host
    const email = body.email as string
    if (!('email' in body)) return response.status(200).json({
        status: 400,
        msg: '缺少 email 字段'
    })
    if (!checkEmail(email))
        return response.status(200).json({
            status: 422,
            msg: '邮箱格式错误'
        })
    if (email.toLowerCase() == config.env.admin.email.toLowerCase())
        return response.status(200).json({
            status: 423,
            msg: '无权登录该邮箱'
        })
    const redisKey = `login-code-${email}`
    if ('code' in body) {
        const realCode = await connectRedis().get(redisKey)
        if (body.code != realCode)
            return response.status(200).json({status: 403})
        const realId = calcHash('md5', `login-code-${Date.now()}-${email}`)
        await Promise.all([
            connectDatabase().then(async db => {
                const collection = db.collection('login-verify')
                await collection.deleteOne({email: email})
                await collection.insertOne({email, verify: realId})
            }),
            connectRedis().del(redisKey)
        ])
        response.setHeader(
            'Set-Cookie',
            `kments-login-code="${realId}"; Max-Age=2592000; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`
        )
        response.status(200).json({status: 200})
    } else {
        if (await connectRedis().exists(redisKey))
            return response.status(200).json({
                status: 429,
                msg: '请求发送验证码过于频繁'
            })
        const code = generateCode(6)
        const sendResult = await sendAuthCodeTo(email, {code, msg: '身份认证', name: body.name})
        if (!sendResult) return response.status(200).json({status: 500})
        await connectRedis().setex(redisKey, 60, code)
        response.status(200).json({status: 200})
    }
}

function generateCode(length: number): string {
    let result = ''
    for (let i = 0; i != length; ++i) {
        result += Math.floor(Math.random() * 36).toString(36)
    }
    return result.toUpperCase()
}

/** 验证用户是否是指定用户 */
export async function verifyAuth(request: VercelRequest, email: string): Promise<boolean> {
    const cookies = request.cookies
    if (!('kments-login-code' in cookies)) return false
    const db = await connectDatabase()
    const collection = db.collection('login-verify')
    const doc = await collection.findOne({
        email: email
    }, {projection: {verify: true}})
    if (!(doc && 'verify' in doc)) return false
    return doc.verify == cookies['kments-login-code']
}

/** 获取当前用户的邮箱 */
export async function getAuthEmail(request: VercelRequest): Promise<string | undefined> {
    const cookies = request.cookies
    if (!('kments-login-code' in cookies)) return undefined
    const db = await connectDatabase()
    const collection = db.collection('login-verify')
    const doc = await collection.findOne(
        {verify: cookies['kments-login-code']},
        {projection: {email: true}}
    )
    if (!(doc && 'email' in doc)) return undefined
    return doc.email
}