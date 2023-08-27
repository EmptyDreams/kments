import {VercelRequest, VercelResponse} from "@vercel/node"
import {connectDatabase, initRequest} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
export default async function(request: VercelRequest, response: VercelResponse) {
    const time = Date.now()
    const db = await connectDatabase()
    await db.collection('c-test').insertOne({a: 'test content'})
    await db.collection('c-test').deleteOne({a: {$exists: true}})
    const endTime = Date.now()
    return response.status(200).send(endTime - time)
    // const checkResult = await initRequest(request, response, {allows: 'china'}, 'GET')
    // if (!checkResult) return
    // const {ip, location, count} = checkResult
    // console.log(`${ip}: ${location}`)
    // response.status(200).json({location, count})
}