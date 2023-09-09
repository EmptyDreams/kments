import {Collection, Document, Filter} from 'mongodb'
import {loadConfig} from '../ConfigLoader'
import {connectDatabase} from '../DatabaseOperator'
import {KmentsPlatform} from '../KmentsPlatform'
import {initRequest} from '../utils'
import {verifyAdminStatus} from './AdminCertificate'
import {CommentBody} from './CommentsPoster'

// noinspection JSUnusedGlobalSymbols
/**
 * 获取指定范围内的评论
 *
 * GET:
 *
 * + `page`: 页面 pathname
 * + `start`: 起始下标（从零开始，缺省 0）
 * + `len`: 获取的评论数量（缺省 10）
 * + `truth`: 是否显示隐藏的评论，仅管理员身份有效（缺省 0）[0-不显示，1-显示，2-只显示隐藏评论]
 * + `id`: 父评论 ID，当填写该字段后表明获取指定评论的子评论（可空）
 */
export async function getComments(platform: KmentsPlatform) {
    const checkResult = await initRequest(platform, 'gets', 'GET')
    if (!checkResult) return
    // 提取和检查请求参数信息
    const info = await extractInfo(platform)
    if (typeof info == 'string')
        return platform.sendJson(400, {msg: info})
    const filter: Filter<Document> = {}
    filter.reply = info.reply ? info.reply : {$exists: false}
    switch (info.truth) {
        case 0:
            filter.hide = {$exists: false}
            break
        case 2:
            filter.hide = {$exists: true}
            break
    }
    const collection = connectDatabase().collection(info.id)
    const countCursor = collection.find(filter).skip(info.start + info.len)
    const [list, next] = await Promise.all([
        readCommentsFromDb(collection, filter).skip(info.start).limit(info.len).toArray(),
        countCursor.hasNext().finally(() => countCursor.close())
    ])
    platform.sendJson(200, {
        next,
        data: list.map(it => extractReturnDate(it as CommentBody))
    })
}

async function extractInfo(platform: KmentsPlatform): Promise<GetInfo | string> {
    const searchString = platform.url?.substring(platform.url!.indexOf('?') + 1)
    if (!searchString) return '缺少 URL 参数'
    const params = new URLSearchParams(searchString)
    let pageUrl = params.get('page')
    if (!pageUrl) return '缺少 page 信息'
    else pageUrl = decodeURIComponent(pageUrl)
    const start = Number.parseInt(params.get('start') ?? '0')
    const len = Number.parseInt(params.get('len') ?? '10')
    let truth = 0
    const truthParam = params.get('truth')
    if (truthParam == '1' || truthParam == '2') {
        const isAdmin = await verifyAdminStatus(platform)
        if (isAdmin) truth = Number.parseInt(truthParam)
    }
    return {
        id: `c-${loadConfig().unique(pageUrl)}`,
        start, len, truth: truth as 0 | 1 | 2,
        reply: params.get('id') ?? undefined
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
        id: body._id.toHexString(),
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
    truth: 0 | 1 | 2,
    /** 父评论 ID */
    reply?: string
}