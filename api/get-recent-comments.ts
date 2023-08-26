import {VercelRequest, VercelResponse} from '@vercel/node'
import {Document, ObjectId, WithId} from 'mongodb'
import {extractReturnDate, readCommentsFromDb} from './get-comments'
import {MainCommentBody} from './post-comment'
import {connectRedis} from './utils/RedisOperator'
import {connectDatabase} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取最新的评论
 *
 * 请求方法：GET
 *
 * 参数解释：
 *
 * + limit - 数量限制（最大为 10，缺省 5）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    if (request.method != 'GET')
        return response.status(200).json({
            status: 405,
            msg: '仅支持 GET 访问'
        })
    const info = extractInfo(request)
    const list = await connectRedis().zrevrangebyscore(
        'recentComments',
        '+inf', 10,
        'LIMIT', 0, info.limit - 1
    )
    console.log(list)
    if (!list || list.length == 0)
        return response.status(200).json({
            status: 200,
            data: []
        })
    const db = await connectDatabase()
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
            list.map(it => extractReturnDate(it as MainCommentBody))
    )
    resultList.sort((a, b) => a._id.getTimestamp().getTime() - b._id.getTimestamp().getTime())
    response.status(200).json({
        status: 200,
        data: resultList
    })
}

function extractInfo(request: VercelRequest): RequestInfo {
    const url = request.url!
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