import {VercelRequest, VercelResponse} from '@vercel/node'
import {findIPv4} from 'ip-china-location'
import {Db, ObjectId} from 'mongodb'
import {verifyAdminStatus} from './admin-certificate'
import {loadConfig} from './lib/ConfigLoader'
import {connectDatabase} from './lib/DatabaseOperator'
import {connectRedis} from './lib/RedisOperator'
import {initRequest} from './lib/utils'

export type DataType = 'twikoo'

/**
 * 从 mongodb 中导入评论数据
 *
 * 请求方法：POST (with json cookie)
 *
 * 参数解释：
 *
 * + type - 评论名称，当前仅支持 twikoo
 * + mongodb - 数据库的 URL
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(request, response, 'import', 'POST')
    if (!checkResult) return
    const {type, mongodb} = request.body
    if (!type || !mongodb)
        return response.status(200).json({status: 400})
    if (!['twikoo'].includes(type))
        return response.status(200).json({status: 422})
    if (!await verifyAdminStatus(request))
        return response.status(200).json({status: 401})
    const db = connectDatabase(mongodb)
    await importTwikooCommentData(db)
    await importTwikooCountData(db)
}

/** 导入 twikoo 评论数据 */
async function importTwikooCommentData(db: Db) {
    const config = loadConfig()
    const newDb = connectDatabase()
    const oldCollection = db.collection('comment')
    const urls = (await oldCollection.aggregate([{
        $group: { _id: null, urls: { $addToSet: '$url' }}
    }]).toArray())[0].urls as string[]
    for (let url of urls) {
        const pageId = config.unique(url)
        const newCollection = newDb.collection(`c-${pageId}`)
        const cursor = oldCollection.find(
            {url}, {
                projection: {
                    _id: true, url: true, ip: true,
                    nick: true, link: true,
                    mail: true, mailMd5: true,
                    comment: true,
                    rid: true, pid: true
                }
            }
        ).limit(10)
        const subCounts = new Map<string, number>()
        while (true) {
            const array = await cursor.toArray()
            if (array.length == 0) break
            for (let item of array) {
                item.url = config.importer?.urlMapper?.('twikoo', item.url) ?? item.url
                if (item.rid) {
                    subCounts.set(item.rid, (subCounts.get(item.rid) ?? 0) + 1)
                    if (item.rid != item.pid) {
                        item.at = [item.pid]
                    }
                }
            }
            await newCollection.insertMany(array.map(it => ({
                _id: new ObjectId(it._id),
                name: it.nick,
                email: it.mail,
                emailMd5: it.mailMd5,
                link: it.link,
                ip: it.ip,
                location: findIPv4(it.ip) ?? '未知',
                reply: it.rid,
                at: it.at
            })))
        }
        await newCollection.bulkWrite(Array.from(subCounts).map(it => ({
            updateOne: {
                filter: {_id: new ObjectId(it[0])},
                update: {
                    $set: {subCount: it[1]}
                }
            }
        })))
    }
}

/** 导入 twikoo 的统计数据 */
async function importTwikooCountData(db: Db) {
    const config = loadConfig()
    const collection = db.collection('counter')
    const array = await collection.find(
        {}, {projection: {url: true, time: true}}
    ).toArray()
    const countResult = new Map<string, number>()
    for (let item of array) {
        if (!item.time) continue
        const url = config.importer?.urlMapper?.('twikoo', item.url) ?? item.url
        countResult.set(url, (countResult.get(url) ?? 0) + item.time)
    }
    const pipeline = connectRedis().pipeline()
    countResult.forEach((time, url) => {
        const id = `count:${config.unique(url)}`
        pipeline.incrby(id, time)
    })
    await pipeline.exec()
}