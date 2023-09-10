import {Collection, Document, ObjectId, WithId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis, execPipeline} from '../RedisOperator'
import {initRequest} from '../utils'
import {extractReturnDate, readCommentsFromDb} from './CommentsGetter'
import {CommentBody} from './CommentsPoster'

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
    const list = await connectRedis().zrevrangebyscore(
        'recentComments',
        '+inf', 10,
        'LIMIT', 0, info.limit
    )
    if (!list || list.length == 0)
        return platform.sendJson(200, {data: []})
    const db = connectDatabase()
    const map = new Map<string, ObjectId[]>()
    list.forEach(it => {
        const [id, pageId] = it.split(':', 2)
        let idList = map.get(pageId)
        if (!idList) idList = []
        idList.push(new ObjectId(id))
        map.set(pageId, idList)
    })
    const task:  Promise<WithId<Document>[]>[] = []
    for (let [pageId, ids] of map) {
        db.collection(pageId)
        task.push(
            readCommentsFromDb(
                db.collection(pageId), {_id: {$in: ids}}
            ).toArray()
        )
    }
    const array = await Promise.all(task)
    const resultList = array.flatMap(
        list =>
            list.map(it => extractReturnDate(it as CommentBody))
    )
    resultList.sort((a, b) => {
        if (a.id < b.id) return 1
        if (a.id == b.id) return 0
        return -1
    })
    platform.sendJson(200, {data: resultList})
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

/**
 * 重建最近评论索引表
 * @param cache 现有的队列（按发布日期从新到旧排列）
 */
export async function rebuildRecentComments(cache?: string[]) {
    type Element = { id: ObjectId, pageId: string }
    const list: Element[] = []
    if (cache) {
        list.push(
            ...cache.map(it => {
                const data = it.split(':', 2)
                return {
                    id: new ObjectId(data[0]),
                    pageId: data[1]
                }
            })
        )
    }
    const db = connectDatabase()
    const collections = (await db.collections()).filter(it => it.collectionName.startsWith('c-'))

    function insertElement(ele: Element) {
        let index = list.findIndex(it => it.id.getTimestamp().getTime() < ele.id.getTimestamp().getTime())
        if (index == -1) index = list.length
        list.splice(index, 0, ele)
        if (list.length > 10)
            list.pop()
    }

    async function findAll(collection: Collection): Promise<Element[]> {
        const array = await collection.find({
            reply: {$exists: false},
            ...(list.length == 0 ? {} : {
                _id: {$lt: list[list.length - 1].id}
            })
        }, {
            projection: {_id: true}
        }).sort({_id: -1}).limit(10).toArray()
        return array.map(it => ({id: it._id, pageId: collection.collectionName}))
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
                ...list.flatMap(it => [it.id.getTimestamp().getTime(), `${it.id}:${it.pageId}`])
            )
    )
}