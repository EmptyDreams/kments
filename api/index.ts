import {VercelRequest, VercelResponse} from "@vercel/node"
import {checkRequest} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const checkResult = await checkRequest(request, {allows: 'china'}, 'GET')
    if (checkResult.status != 200) return response.status(checkResult.status).send(checkResult.msg)
    const {ip, location, count} = checkResult
    console.log(`${ip}: ${location}`)
    response.status(200).json({location, count})
}