import {VercelRequest, VercelResponse} from '@vercel/node'
import {MainCommentBody} from './post-comment'
import {connectDatabase} from './utils'

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
export default function (request: VercelRequest, response: VercelResponse) {
    // 检查请求方法
    if (request.method != 'GET')
        return response.status(200).json({
            status: 405,
            msg: '仅支持 GET 访问'
        })
    // 提取和检查请求参数信息
    const info = extractInfo(request)
    if (typeof info == 'string')
        return response.status(200).json({
            status: 400,
            msg: info
        })
    connectDatabase()
        .then(db => db.collection(info.id)
            .find({
                reply: { $exists: false }
            }, {
                projection: {
                    email: false,
                    ip: false
                }
            }).skip(info.start)
            .limit(info.len)
            .toArray()
        ).then(list => {
            response.status(200).json({
                status: 200,
                data: list.map(it => extractReturnDate(it as MainCommentBody))
            })
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

/** 提取返回给客户端的数据 */
export function extractReturnDate(body: MainCommentBody): any {
    return {
        id: body._id.toString(),
        name: body.name,
        email: body.emailMd5,
        link: body.link,
        location: body.location,
        content: body.content,
        subCount: body.subCount ?? 0
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