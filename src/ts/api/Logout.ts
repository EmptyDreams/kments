import {loadConfig} from '../ConfigLoader'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {initRequest, isDev} from '../utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 退出登录
 *
 * POST: nobody
 */
export async function logoutKments(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'logout', 'POST')
    if (!checkResult) return
    const code = platform.readCookie('kments-login-code')
    if (!code)
        return platform.sendJson(200, {status: 204})
    await connectDatabase().collection('login-verify').deleteOne({verify: code})
    const domain = isDev ? 'localhost' : loadConfig().admin.domUrl.host
    platform.setCookie(`kments-login-code=""; Max-Age=-1; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`)
    platform.sendJson(200, {status: 200})
}