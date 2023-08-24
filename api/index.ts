import {VercelRequest, VercelResponse} from "@vercel/node"
import { findOnVercel} from 'ip-china-location'
import path from 'path'
import {getUserIp, rateLimit} from './utils'

export default async function(request: VercelRequest, response: VercelResponse) {
    const ip = getUserIp(request)
    console.log(process.env['RATE_LIMIT_TIME'])
    const [limitStatus, count] = await rateLimit(
        'base', ip,
        Number.parseInt(process.env['RATE_LIMIT_TIME'] ?? '10000'),
        Number.parseInt(process.env['RATE_LIMIT_COUNT'] ?? '100')
    )
    if (limitStatus !== 200)
        return response.status(limitStatus).end()
    return response.status(limitStatus).send(count)
    const location = findOnVercel(request, path.resolve('./', 'private', 'region.bin'))
    console.log(`${ip}: ${location}`)
    response.status(200).send(location)

    // switch (request.method) {
    //     case 'GET':
    //         getComment(request, response)
    //         break
    //     case 'PUT':
    //         await postComment(request, response)
    //         break
    //     case 'DELETE':
    //         deleteComment(request, response)
    //         break
    //     case 'POST':
    //
    //         break
    //     default:
    //         response.status(405)
    //             .end()
    //         break
    // }
}

function deleteComment(request: VercelRequest, response: VercelResponse) {

}

function getComment(request: VercelRequest, response: VercelResponse) {

}