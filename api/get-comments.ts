import {VercelRequest, VercelResponse} from '@vercel/node'
import {Collection, Document, Filter} from 'mongodb'
import {verifyAdminStatus} from './admin-certificate'
import {connectDatabase} from './lib/DatabaseOperator'
import {CommentBody} from './post-comment'
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
 * + `truth`: 是否显示隐藏的评论，仅管理员身份有效（缺省 0）[0-不显示，1-显示，2-只显示隐藏评论]
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response, 'gets', 'GET'
    )
    if (!checkResult) return
    // 提取和检查请求参数信息
    const info = await extractInfo(request)
    if (typeof info == 'string')
        return response.status(200).json({
            status: 400,
            msg: info
        })
    const defFilter = {reply: {$exists: false}}
    let filter
    switch (info.truth) {
        case 0:
            filter = defFilter
            break
        case 1:
            filter = {
                hide: {$exists: false},
                ...defFilter
            }
            break
        case 2:
            filter = {
                hide: {$exists: true},
                ...defFilter
            }
            break
    }
    const db = await connectDatabase()
    const list = await readCommentsFromDb(
        db.collection(info.id), filter
    ).skip(info.start).limit(info.len).toArray()
    response.status(200).json({
        status: 200,
        data: list.map(it => extractReturnDate(it as CommentBody))
    })
}

async function extractInfo(request: VercelRequest): Promise<GetInfo | string> {
    const searchString = request.url?.substring(request.url!.indexOf('?') + 1)
    if (!searchString) return '缺少 URL 信息'
    const params = new URLSearchParams(searchString)
    if (!params.has('id')) return '缺少页面唯一标识符'
    const start = Number.parseInt(params.get('start') ?? '0')
    const len = Number.parseInt(params.get('len') ?? '10')
    let truth = 0
    const truthParam = params.get('truth')
    if (truthParam == '1' || truthParam == '2') {
        const isAdmin = await verifyAdminStatus(request)
        if (isAdmin) truth = Number.parseInt(truthParam)
    }
    return {
        id: `c-${params.get('id')}`,
        start, len, truth: truth as 0 | 1 | 2
    }
}

export function readCommentsFromDb(collection: Collection, filter: Filter<Document>) {
    return collection.find(filter, {
        projection: {
            _id: true,
            name: true,
            emailMd5: true,
            link: true,
            location: true,
            content: true,
            subCount: true,
            hide: true
        }
    })
}

/** 提取返回给客户端的数据 */
export function extractReturnDate(body: CommentBody): any {
    const result: any = {
        id: body._id.toString(),
        name: body.name,
        email: body.emailMd5,
        link: body.link || undefined,
        location: body.location,
        content: body.content,
        subCount: body.subCount,
        hide: body.hide
    }
    for (let key in result) {
        if (!result[key]) delete result[key]
    }
    return result
}

interface GetInfo {
    /** 评论页的唯一标识符 */
    id: string,
    /** 起始下标 */
    start: number,
    /** 长度 */
    len: number,
    /** 是否显示隐藏评论 */
    truth: 0 | 1 | 2
}