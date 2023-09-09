import {findIPv4} from 'ip-china-location'
import {Db, ObjectId} from 'mongodb'
import {loadConfig} from '../ConfigLoader'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis, execPipeline} from '../RedisOperator'
import {calcHash, initRequest, rebuildRecentComments} from '../utils'
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
        return platform.sendJson(400)
    if (!['twikoo'].includes(type))
        return platform.sendJson(422)
    if (!await verifyAdminStatus(platform))
        return platform.sendJson(401)
    const db = connectDatabase(mongodb)
    await Promise.all([
        importTwikooCommentData(db),
        importTwikooCountData(db)
    ])
    await rebuildRecentComments()
    platform.sendNull(200)
}

const defObjectId = new ObjectId('000000000000000000000000')

/** 导入 twikoo 评论数据 */
async function importTwikooCommentData(db: Db) {
    const config = loadConfig()
    const newDb = connectDatabase()
    const oldCollection = db.collection('comment')
    const urls = (await oldCollection.aggregate([{
        $group: { _id: null, urls: { $addToSet: '$url' }}
    }]).toArray())[0].urls as string[]
    const filter = config.importer?.filter
    const urlMapper = config.importer?.urlMapper
    await Promise.all(urls.map(async url => {
        const pageId = config.unique(url)
        const newCollection = newDb.collection(`c-${pageId}`)
        const array = await oldCollection.aggregate([
            {$match: {url}},
            {
                $project: {
                    _id: true, url: true, ip: true,
                    nick: true, link: true, mail: true,
                    comment: true,
                    rid: true, pid: true,
                    created: {
                        $floor: {$divide: ['$created', 1000]}
                    }
                }
            }
        ]).toArray()
        if (array.length == 0) return
        const subCounts = new Map<string, [ObjectId, number]>()
        function readCounts(key: string) {
            let array = subCounts.get(key)
            if (!array) {
                array = [defObjectId, 0]
                subCounts.set(key, array)
            }
            return array
        }
        for (let document of array) {
            if (filter && !filter('twikoo', document))
                continue
            if (urlMapper)
                document.url = urlMapper('twikoo', document.url)
            document.mapId = new ObjectId(document.created)
            readCounts(document._id)[0] = document.mapId
            if (document.rid) {
                ++readCounts(document.rid)[1]
                if (document.rid != document.pid) {
                    document.at = [document.pid]
                }
            }
        }
        await newCollection.insertMany(array.map(document => ({
            _id: document.mapId,
            name: document.nick,
            email: document.mail,
            emailMd5: calcHash('md5', document.mail.toLowerCase()),
            link: document.link,
            ip: document.ip,
            location: findIPv4(document.ip) ?? '未知',
            reply: document.rid,
            at: document.at?.map((it: string) => subCounts.get(it)?.[0] || undefined),
            subCount: subCounts.get(document._id)?.[1] || undefined
        })))
    }))
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