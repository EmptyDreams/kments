import {VercelRequest, VercelResponse} from '@vercel/node'
import {loadConfig} from './lib/ConfigLoader'
import {connectDatabase} from './lib/DatabaseOperator'
import {initRequest, isDev} from './lib/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 退出登录
 *
 * 请求方法：POST (none body)
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response, 'logout', 'POST'
    )
    if (!checkResult) return
    const cookies = request.cookies
    if (!('kments-login-code' in cookies))
        return response.status(200).json({status: 204})
    const code = cookies['kments-login-code']
    const db = await connectDatabase()
    await db.collection('login-verify')
        .deleteOne({verify: code})
    const domain = isDev ? 'localhost' : loadConfig().domUrl.host
    response.setHeader(
        'Set-Cookie',
        `kments-login-code=""; Max-Age=-1; Domain=${domain}; Path=/; Secure; SameSite=None; HttpOnly;`
    )
    response.status(200).json({status: 200})
}