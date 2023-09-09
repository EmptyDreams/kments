import {Document, ObjectId, WithId} from 'mongodb'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {connectRedis} from '../RedisOperator'
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
        'LIMIT', 0, info.limit - 1
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
    resultList.sort((a, b) => a._id.getTimestamp().getTime() - b._id.getTimestamp().getTime())
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