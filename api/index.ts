import {VercelRequest, VercelResponse} from "@vercel/node"
import {initRequest} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, {allows: 'china'}, 'GET')
    if (!checkResult) return
    const {ip, location, count} = checkResult
    console.log(`${ip}: ${location}`)
    response.status(200).json({location, count})
}