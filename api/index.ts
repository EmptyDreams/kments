import {VercelRequest, VercelResponse} from "@vercel/node"
import {connectRedis} from './utils/RedisOperator'
import {initRequest} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const time = Date.now()
    await connectRedis().set('test', 'test content')
    await connectRedis().del('test')
    const endTime = Date.now()
    return response.status(200).send(endTime - time)
    // const checkResult = await initRequest(request, response, {allows: 'china'}, 'GET')
    // if (!checkResult) return
    // const {ip, location, count} = checkResult
    // console.log(`${ip}: ${location}`)
    // response.status(200).json({location, count})
}