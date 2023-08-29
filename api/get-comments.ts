import {VercelRequest, VercelResponse} from '@vercel/node'
import {Collection, Document, Filter} from 'mongodb'
import {connectDatabase} from './lib/DatabaseOperator'
import {MainCommentBody} from './post-comment'
import {initRequest} from './lib/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定范围内的评论
 *
 * 请求方法：GET
 *
 * 请求参数列表：
 *
 * + `id`: 页面唯一标识
 * + `start`: 起始下标（从零开始，缺省 0）
 * + `len`: 获取的评论数量（缺省 10）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response,
        'gets', {allows: 'all'},
        'GET'
    )
    if (!checkResult) return
    // 提取和检查请求参数信息
    const info = extractInfo(request)
    if (typeof info == 'string')
        return response.status(200).json({
            status: 400,
            msg: info
        })
    const db = await connectDatabase()
    const list = await readCommentsFromDb(
        db.collection(info.id), {reply: {$exists: false}}
    ).skip(info.start).limit(info.len).toArray()
    response.status(200).json({
        status: 200,
        data: list.map(it => extractReturnDate(it as MainCommentBody))
    })
}

function extractInfo(request: VercelRequest): GetInfo | string {
    const searchString = request.url?.substring(request.url!.indexOf('?') + 1)
    if (!searchString) return '缺少 URL 信息'
    const params = new URLSearchParams(searchString)
    if (!params.has('id')) return '缺少页面唯一标识符'
    const start = Number.parseInt(params.get('start') ?? '0')
    const len = Number.parseInt(params.get('len') ?? '10')
    return {
        id: `c-${params.get('id')}`,
        start, len
    }
}

export function readCommentsFromDb(collection: Collection, filter: Filter<Document>) {
    return collection.find(filter, {
        projection: {
            email: false,
            ip: false,
            children: false
        }
    })
}

/** 提取返回给客户端的数据 */
export function extractReturnDate(body: MainCommentBody): any {
    return {
        id: body._id.toString(),
        name: body.name,
        email: body.emailMd5,
        link: body.link || undefined,
        location: body.location,
        content: body.content,
        subCount: body.subCount
    }
}

interface GetInfo {
    /** 评论页的唯一标识符 */
    id: string,
    /** 起始下标 */
    start: number,
    /** 长度 */
    len: number
}