import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis} from '../RedisOperator'
import {calcHash, initRequest, isDev} from '../utils'

const cookieKey = 'kments-admin-id'

// noinspection JSUnusedGlobalSymbols
/**
 * 管理员身份认证
 *
 * POST: text（管理员密码）
 */
export async function certifyAdmin(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'admin', 'POST')
    if (!checkResult) return
    const {config} = checkResult
    const password = platform.readBodyAsString()
    if (password != config.admin.password)
        return platform.sendJson(403, {msg: '密码错误'})
    const adminId = calcHash('md5', config.encrypt(`${Date.now()}-${password}-${Math.random()}`))
    const domain = isDev ? 'localhost' : config.admin.domUrl.host
    platform.setCookie(`${cookieKey}=${adminId}; Max-Age=2592000; Domain=${domain}; Path=/; Secure; HttpOnly; SameSite=None;`)
    await connectRedis().setex('admin', 2592000, adminId)
    platform.sendJson(200)
}

/** 校验管理员身份 */
export async function verifyAdminStatus(platform: KmentsPlatform): Promise<boolean> {
    const value = platform.readCookie(cookieKey)
    if (!value) return false
    const realId = await connectRedis().get('admin')
    return realId == value
}