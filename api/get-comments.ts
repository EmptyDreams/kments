import {VercelRequest, VercelResponse} from '@vercel/node'
import {ObjectId} from 'mongodb'
import {connectDatabase} from './utils'

// noinspection JSUnusedGlobalSymbols
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
    connectDatabase().then(db => {
        const cursor = db.collection('comments').find({})
    })
}

function extractInfo(request: VercelRequest): GetInfo | string {
    const searchString = request.url?.substring(request.url!.indexOf('?') + 1)
    if (!searchString) return '缺少 URL 信息'
    const params = new URLSearchParams(searchString)
    if (!params.has('id')) return '缺少页面唯一标识符'
    const start = Number.parseInt(params.get('start') ?? '0')
    const range: [number, number] = [start, -1]
    if (params.has('end'))
        range[1] = Number.parseInt(params.get('end')!)
    else if (params.has('len'))
        range[1] = range[0] + Number.parseInt(params.get('len')!)
    else return '缺少页码信息'
    return {
        id: decodeURIComponent(params.get('id')!),
        range
    }
}

interface GetInfo {
    /** 评论页的唯一标识符 */
    id: string,
    /** 评论获取的范围 */
    range: [number, number]
}