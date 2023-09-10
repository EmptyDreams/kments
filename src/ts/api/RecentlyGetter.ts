import {Collection, Document, ObjectId, WithId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis, execPipeline} from '../RedisOperator'
import {initRequest} from '../utils'
import {CommentBody} from './CommentsPoster'
import HTMLParser from 'fast-html-parser'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取最新评论列表
 *
 * GET:
 *
 * + limit - 数量限制（最大为 10，缺省为 5）
 */
export async function getRecently(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'gets', 'GET')
    if (!checkResult) return
    const info = extractInfo(platform)
    const list = await loadRecentlyBody(info.limit)
    platform.sendJson(200, {data: list})
}

function extractInfo(platform: KmentsPlatform): RequestInfo {
    const url = platform.url!
    const splitIndex = url.indexOf('?')
    if (splitIndex < 0) return {limit: 5}
    const searchString = url.substring(splitIndex + 1)
    const search = new URLSearchParams(searchString)
    return {
        limit: Number.parseInt(search.get('limit') ?? '5')
    }
}

interface RequestInfo {
    limit: number
}

export interface RecentlyBody {
    pageId: string,
    id: ObjectId,
    name: string,
    email: string,
    link?: string,
    location: string,
    content: string
}

/** 加载最近评论列表 */
export async function loadRecentlyBody(limit: number = 10): Promise<RecentlyBody[]> {
    const list = await connectRedis().zrevrangebyscore(
        'recentComments',
        '+inf', 10,
        'LIMIT', 0, limit
    )
    return list.map(it => {
        const json = JSON.parse(it)
        json.id = new ObjectId(json.id)
        return json
    })
}

/**
 * 重建最近评论索引表
 * @param list 现有的队列（按发布日期从新到旧排列）
 */
export async function rebuildRecentComments(list: RecentlyBody[] = []) {
    const db = connectDatabase()
    const collections = (await db.collections()).filter(it => it.collectionName.startsWith('c-'))

    function insertElement(ele: RecentlyBody) {
        let index = list.findIndex(it => it.id.getTimestamp().getTime() < ele.id.getTimestamp().getTime())
        if (index == -1) index = list.length
        list.splice(index, 0, ele)
        if (list.length > 10)
            list.pop()
    }

    async function findAll(collection: Collection): Promise<RecentlyBody[]> {
        const array = await collection.find({
            reply: {$exists: false},
            ...(list.length == 0 ? {} : {
                _id: {$lt: list[list.length - 1].id}
            })
        }, {
            projection: {_id: true, name: true, emailMd5: true, link: true, content: true, location: true}
        }).sort({_id: -1}).limit(10).toArray()
        return array.map(it => ({
            pageId: collection.collectionName,
            id: it._id,
            name: it.name,
            email: it.emailMd5,
            link: it.link,
            content: it.content,
            location: it.location
        }))
    }

    async function sequence() {
        for (let collection of collections) {
            const array = await findAll(collection)
            for (let item of array) {
                insertElement(item)
            }
        }
    }

    async function parallel() {
        await Promise.all(
            collections.map(
                collection => findAll(collection)
                    .then(array => array.forEach(it => insertElement(it)))
            )
        )
    }

    // 数量小于阈值时串行执行，否则并行执行
    if (collections.length < 25) await sequence()
    else await parallel()
    await execPipeline(
        connectRedis().pipeline()
            .zremrangebyscore('recentComments', '-inf', '+inf')
            .zadd(
                'recentComments',
                ...list.flatMap(it => {
                    it.content = HTMLParser.parse(it.content).text
                    return [it.id.getTimestamp().getTime(), JSON.stringify(it)]
                })
            )
    )
}