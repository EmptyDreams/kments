import {VercelRequest, VercelResponse} from "@vercel/node"
import {connectRedis} from './utils/RedisOperator'
import {connectDatabase, initRequest} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const time = Date.now()
    const db = await connectDatabase()
    await db.collection('c-test').insertOne({a: 'a'})
    await db.collection('c-test').deleteOne({a: 'a'})
    const endTime = Date.now()
    return response.status(200).send(endTime - time)
    // const checkResult = await initRequest(request, response, {allows: 'china'}, 'GET')
    // if (!checkResult) return
    // const {ip, location, count} = checkResult
    // console.log(`${ip}: ${location}`)
    // response.status(200).json({location, count})
}