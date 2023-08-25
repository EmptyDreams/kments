import {VercelRequest, VercelResponse} from "@vercel/node"
import { findOnVercel} from 'ip-china-location'
import {ObjectId} from 'mongodb'
import path from 'path'
import {getUserIp, rateLimit} from './utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const ip = getUserIp(request)
    const [limitStatus, count] = await rateLimit(
        'base', ip,
        Number.parseInt(process.env['RATE_LIMIT_TIME'] ?? '10000'),
        Number.parseInt(process.env['RATE_LIMIT_COUNT'] ?? '100')
    )
    if (limitStatus !== 200)
        return response.status(limitStatus).end()
    const location = findOnVercel(request, path.resolve('./', 'private', 'region.bin'))
    console.log(`${ip}: ${location}`)
    response.status(200).json({location, count})
}