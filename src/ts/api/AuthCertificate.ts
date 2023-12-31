import crypto from 'crypto'
import {loadConfig} from '../ConfigLoader'
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
        return platform.sendJson(304)
    const domain = isDev ? 'localhost' : config.admin.domUrl.host
    const email = body.email as string
    if (!email) return platform.sendJson(400, {msg: '缺少 email 字段'})
    if (!checkEmail(email)) return platform.sendJson(422, {msg: '邮箱格式错误'})
    if (email.toLowerCase() == config.admin.email.toLowerCase())
        return platform.sendJson(423, {msg: '用户无权登录该邮箱'})
    const redisKey = `login-code-${email}`
    if (body.code) {
        const realCode = await connectRedis().get(redisKey)
        if (calcHash('md5', body.code) != realCode)
            return platform.sendJson(403, {msg: '验证码错误'})
        const realId = calcHash('md5', config.encrypt(`login-code-${Date.now()}-${email}`))
        await Promise.all([
            async () => {
                const collection = connectDatabase().collection(`login-verify`)
                await collection.bulkWrite([
                    {
                        deleteMany: {
                            filter: {
                                $or: [{email}, {update: {$lt: Date.now() - (30 * 24 * 60 * 60 * 1000)}}]
                            }
                        }
                    },
                    {
                        insertOne: {
                            document: {
                                email, verify: realId,
                                update: Date.now()
                            }
                        }
                    }
                ])
            },
            connectRedis().del(redisKey)
        ])
        platform.setCookie(`kments-login-code=${realId}; Max-Age=2592000; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`)
        platform.sendJson(200)
    } else {
        const redis = connectRedis()
        if (await redis.exists(redisKey))
            return platform.sendJson(429, {msg: '请求发送验证码过于频繁'})
        const code = generateCode(6)
        const sendResult = await sendAuthCodeTo(email, {code, msg: '身份认证', name: body.name})
        if (!sendResult)
            return platform.sendJson(500)
        await redis.setex(redisKey, 600, calcHash('md5', code))
        platform.sendJson(200)
    }
}

function generateCode(length: number): string {
    let result = ''
    for (let i = 0; i != length; ++i) {
        result += crypto.randomInt(0, 36).toString(36)
    }
    return result.toUpperCase()
}

const email2code = new Map<string, string>()
const code2email = new Map<string, string>()

/** 验证用户是否是指定用户 */
export async function verifyUserAuth(platform: KmentsPlatform, email: string): Promise<0 | -1 | 1> {
    const lowEmail = email.toLowerCase()
    const verify = platform.readCookie('kments-login-code')
    const cache = email2code.get(lowEmail)
    if (cache) {
        if (verify) {
            return verify == cache ? 1 : -1
        } else return -1
    }
    const collection = connectDatabase().collection('login-verify')
    const doc = await collection.findOneAndUpdate(
        {email, update: {$gt: Date.now() - (30 * 24 * 60 * 60 * 1000)}},
        {$set: {update: Date.now()}},
        {projection: {verify: true}}
    )
    if (!verify)
        return (doc && 'verify' in doc) ? -1 : 0
    if (doc && 'verify' in doc && doc.verify == verify) {
        const domain = isDev ? 'localhost' : loadConfig().admin.domUrl.host
        platform.setCookie(`kments-login-code=${verify}; Max-Age=2592000; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`)
        email2code.set(lowEmail, verify)
        code2email.set(verify, lowEmail)
        return 1
    }
    return -1
}

/** 获取当前用户的邮箱 */
export async function getUserEmail(platform: KmentsPlatform): Promise<string | undefined> {
    const verify = platform.readCookie('kments-login-code')
    if (!verify) return undefined
    const cache = code2email.get(verify)
    if (cache) return cache
    const collection = connectDatabase().collection('login-verify')
    const doc = await collection.findOneAndUpdate(
        {verify, update: {$gt: Date.now() - (30 * 24 * 60 * 60 * 1000)}},
        {$set: {update: Date.now()}},
        {projection: {email: true}}
    )
    if (doc && 'email' in doc) {
        const email = doc.email as string
        const domain = isDev ? 'localhost' : loadConfig().admin.domUrl.host
        platform.setCookie(`kments-login-code=${verify}; Max-Age=2592000; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`)
        code2email.set(verify, email)
        email2code.set(email, verify)
        return email
    }
    return undefined
}