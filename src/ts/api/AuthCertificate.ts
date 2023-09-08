import crypto from 'crypto'
import {connectDatabase} from '../DatabaseOperator'
import {sendAuthCodeTo} from '../Email'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis} from '../RedisOperator'
import {calcHash, checkEmail, initRequest, isDev} from '../utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 用户身份认证
 *
 * POST: json {
 *      email: string
 *      name?: string
 *      code?: string
 * }
 */
export async function certifyUser(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'login', 'POST')
    if (!checkResult) return
    const {config} = checkResult
    const body = platform.readBodyAsJson()
    const cookieLoginId = platform.readCookie('login-id')
    if (cookieLoginId)
        return platform.sendJson(200, {status: 304})
    const domain = isDev ? 'localhost' : config.admin.domUrl.host
    const email = body.email as string
    if (!email) return platform.sendJson(200, {
        status: 400,
        msg: '缺少 email 字段'
    })
    if (!checkEmail(email)) return platform.sendJson(200, {
        status: 422,
        msg: '邮箱格式错误'
    })
    if (email.toLowerCase() == config.admin.email.toLowerCase())
        return platform.sendJson(200, {
            status: 423,
            msg: '用户无权登录该邮箱'
        })
    const redisKey = `login-code-${email}`
    if (body.code) {
        const realCode = await connectRedis().get(redisKey)
        if (calcHash('md5', body.code) != realCode)
            return platform.sendJson(200, {
                status: 403,
                msg: '验证码错误'
            })
        const realId = calcHash('md5', config.encrypt(`login-code-${Date.now()}-${email}`))
        await Promise.all([
            async () => {
                const collection = connectDatabase().collection(`login-verify`)
                await collection.bulkWrite([
                    {
                        deleteOne: {filter:{email}}
                    },
                    {
                        insertOne: {
                            document: {email, verify: realId}
                        }
                    }
                ])
            },
            connectRedis().del(redisKey)
        ])
        platform.setCookie(`kments-login-code=${realId}; Max-Age=2592000; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`)
        platform.sendJson(200, {status: 200})
    } else {
        const redis = connectRedis()
        if (await redis.exists(redisKey))
            return platform.sendJson(200, {
                status: 429,
                msg: '请求发送验证码过于频繁'
            })
        const code = generateCode(6)
        const sendResult = await sendAuthCodeTo(email, {code, msg: '身份认证', name: body.name})
        if (!sendResult)
            return platform.sendJson(200, {status: 500})
        await redis.setex(redisKey, 600, calcHash('md5', code))
        platform.sendJson(200, {status: 200})
    }
}

function generateCode(length: number): string {
    let result = ''
    for (let i = 0; i != length; ++i) {
        result += crypto.randomInt(0, 36).toString(36)
    }
    return result.toUpperCase()
}

/** 验证用户是否是指定用户 */
export async function verifyAuth(platform: KmentsPlatform, email: string): Promise<boolean> {
    const verify = platform.readCookie('kments-login-code')
    if (!verify) return false
    const collection = connectDatabase().collection('login-verify')
    const doc = await collection.findOne({
        email: email
    }, {projection: {verify: true}})
    if (!(doc && 'verify' in doc)) return false
    return doc.verify == verify
}

/** 获取当前用户的邮箱 */
export async function getAuthEmail(platform: KmentsPlatform): Promise<string | undefined> {
    const verify = platform.readCookie('kments-login-code')
    if (!verify) return undefined
    const collection = connectDatabase().collection('login-verify')
    const doc = await collection.findOne(
        {verify},
        {projection: {email: true}}
    )
    if (!(doc && 'email' in doc)) return undefined
    return doc.email
}