import {VercelRequest, VercelResponse} from '@vercel/node'
import * as HTMLChecker from 'fast-html-checker'
import {findOnVercel} from 'ip-china-location'
import {Collection, ObjectId, Document} from 'mongodb'
import path from 'path'
import {extractReturnDate} from './get-comments'
import {calcHash, connectDatabase, getUserIp} from './utils/utils'

// noinspection JSUnusedGlobalSymbols
/**
 * 发布一个评论
 *
 * 请求方法：POST (with json)
 *
 * body 键值说明：
 *
 * + pageId: string - 当前页面的唯一标识符（不能包含英文逗号和星号）
 * + name: string - 发布人昵称
 * + email: string - 发布人邮箱
 * + link: string - 发布人的主页（可选）
 * + content: string - 评论内容（HTML）
 * + reply: string - 要回复的评论的 ID（可选）
 * + at: {string|string[]} - 要 @ 的评论的 ID（可选）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    // 检查访问方法
    if (request.method !== 'POST')
        return response.status(200).json({
            status: 405,
            msg: '仅支持 POST 访问'
        })
    // 提取和检查 IP
    const ip = getUserIp(request) ?? '::1'
    if (!ip) return response.status(200).json({
        status: 400,
        msg: '请求缺少 IP 信息'
    })
    // 提取和检查用户地址
    const location = findOnVercel(request, path.resolve('./', 'private', 'region.bin'), ip) ?? '中国'
    if (!location) return response.status(200).json({
        status: 403,
        msg: '禁止海外用户发表评论'
    })
    // 提取评论内容
    const commentBody = extractInfo(request, ip, location)
    if (typeof commentBody === 'string') {
        return response.status(400).json({
            status: 400,
            msg: commentBody
        })
    }
    // 检查是否允许发布
    const checkResult = checkComment(commentBody)
    if (typeof checkResult === 'string') {
        return response.status(200).json({
            status: 403,
            message: checkResult
        })
    }
    const collectionName = commentBody.page!
    delete commentBody['page']
    const collection = (await connectDatabase()).collection<MainCommentBody>(collectionName)
    Promise.all([
        collection.insertOne(commentBody),
        reply(collection, commentBody)
    ]).then(() => {
        response.status(200).json({
            status: 200,
            data: extractReturnDate(commentBody)
        })
    })
}

/** 回复评论 */
async function reply(collection: Collection<MainCommentBody>, body: MainCommentBody) {
    let {reply, at} = body
    if (!reply) return
    await Promise.all([
        collection.updateOne({
            _id: new ObjectId(reply)
        }, {
            $inc: { subCount: 1},
            $push: { children: reply }
        }),
        at ? collection.updateMany({
            _id: {$in: at.map(it => new ObjectId(it))}
        }, {
            // @ts-ignore
            $push: { children: reply }
        }) : Promise.resolve()
    ])
}

/** 从请求中提取评论信息 */
function extractInfo(request: VercelRequest, ip: string, location: string): MainCommentBody | string {
    const json = request.body
    const list = ['name', 'email', 'pageId', 'content']
    for (let key of list) {
        if (!(key in json))
            return `${key} 值缺失`
    }
    const result: MainCommentBody = {
        _id: new ObjectId(),
        name: json.name,
        email: json.email,
        emailMd5: calcHash('md5', json.email),
        link: json.link,
        ip, location,
        page: `c-${json['pageId']}`,
        content: json.content
    }
    if ('reply' in json)
        result.reply = json.reply
    if ('at' in json)
        result.at = json.at
    return result
}

/**
 * 检查评论是否可以发布
 * @return {boolean|string} 返回 true 表示可以，否则表示不可以
 */
function checkComment(body: MainCommentBody): boolean | string {
    const banChars = ['.', '*']
    if (banChars.find(it => body.page!.includes(it)))
        return '页面 ID 不能包含英文句号和星号'
    if (body.page!.length > 64)
        return '页面 ID 长度过长'
    const env = process.env
    const blocked = {
        user: env['USER_BLOCKED'] ? JSON.parse(env['USER_BLOCKED']) : ['免费', '节点', 'clash', 'v2ray', '机场'],
        link: env['LINK_BLOCKED'] ? new RegExp(env['LINK_BLOCKED'], 'i') : /^(https?:\/\/|\/\/)?k?github\.com/i
    }
    if (blocked.user.find((keyword: string) => body.name.includes(keyword)))
        return '用户名称包含违规内容'
    if (blocked.link.test(body.link))
        return '用户主页已被屏蔽'
    if (HTMLChecker.check(body.content, {
            allowTags: ['a', 'strong']
        })
    ) return '用户评论包含非法内容'
    return true
}

/** 楼主评论 body */
export interface MainCommentBody extends Document {
    _id: ObjectId,
    /** 发表用户的名称 */
    name: string,
    /** 邮箱 */
    email: string,
    /** 邮箱 md5 值 */
    emailMd5: string,
    /** 用户主页 */
    link: string,
    /** 评论内容 */
    content: string,
    /** 发表地 IP 地址 */
    ip: string,
    /** 地理位置 */
    location: string,
    /** 子评论的数量 */
    subCount?: number,
    /** 发表页面地址或其它唯一标识符 */
    page?: string,
    /** 要回复的评论 */
    reply?: string,
    /** 要 at 的评论 */
    at?: string[],
    /** 子评论列表 */
    children?: string[]
}