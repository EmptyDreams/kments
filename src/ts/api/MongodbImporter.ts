import {findIPv4} from 'ip-china-location'
import {Db, ObjectId} from 'mongodb'
import {loadConfig} from '../ConfigLoader'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis, execPipeline} from '../RedisOperator'
import {initRequest} from '../utils'
import {verifyAdminStatus} from './AdminCertificate'

export type DataType = 'twikoo'

// noinspection JSUnusedGlobalSymbols
/**
 * 从 mongodb 中导入评论数据
 * 
 * POST: json {
 *      type: string # 评论名称
 *      mongodb: string # 数据库的 URL
 * }
 */
export async function importMongodb(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'import', 'POST')
    if (!checkResult) return
    const {type, mongodb} = platform.readBodyAsJson()
    if (!type || !mongodb)
        return platform.sendJson(200, {status: 400})
    if (!['twikoo'].includes(type))
        return platform.sendJson(200, {status: 422})
    if (!await verifyAdminStatus(platform))
        return platform.sendJson(200, {status: 401})
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
                    rid: true, pid: true, created: true
                }
            }
        ).limit(10)
        const subCounts = new Map<string, [any, number]>()
        while (true) {
            const array = await cursor.toArray()
            if (array.length == 0) break
            for (let item of array) {
                item.url = config.importer?.urlMapper?.('twikoo', item.url) ?? item.url
                item.mapId = new ObjectId(Math.floor(item.created / 1000))
                if (item.rid) {
                    const count = (subCounts.get(item.rid)?.[1] ?? 0) + 1
                    subCounts.set(item.rid, [item._id, count])
                    if (item.rid != item.pid) {
                        item.at = [item.pid]
                    }
                }
            }
            await newCollection.insertMany(array.map(it => ({
                _id: it.mapId,
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
        if (subCounts.size == 0) continue
        await newCollection.bulkWrite(Array.from(subCounts).map(it => ({
            updateOne: {
                filter: {_id: it[1][0]},
                update: {
                    $set: {subCount: it[1][1]}
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
    await execPipeline(pipeline)
}