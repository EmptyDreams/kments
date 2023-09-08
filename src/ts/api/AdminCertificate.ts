import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis} from '../RedisOperator'
import {calcHash, initRequest, isDev} from '../utils'

// noinspection JSUnusedGlobalSymbols
export async function certifyAdmin(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'admin', 'POST')
    if (!checkResult) return
    const {config} = checkResult
    const password = platform.readBodyAsString()
    if (password != config.admin.password)
        return platform.sendJson(200, {
            status: 403,
            msg: '密码错误'
        })
    const adminId = calcHash('md5', config.encrypt(`${Date.now()}-${password}-${Math.random()}`))
    const domain = isDev ? 'localhost' : config.admin.domUrl.host
    platform.setCookie(`admin=${adminId}; Max-Age=2592000; Domain=${domain}; Path=/; Secure; HttpOnly; SameSite=None;`)
    await connectRedis().setex('admin', 2592000, adminId)
    platform.sendJson(200, {status: 200})
}