import {VercelRequest, VercelResponse} from "@vercel/node"
import { findOnVercel} from 'ip-china-location'
import path from 'path'
import {getUserIp, rateLimit} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const ip = getUserIp(request)
    const [limitStatus, count] = await rateLimit('base', ip)
    if (limitStatus !== 200)
        return response.status(limitStatus).end()
    const location = findOnVercel(request, path.resolve('./', 'private', 'region.bin'))
    console.log(`${ip}: ${location}`)
    response.status(200).json({location, count})
}