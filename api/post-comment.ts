import {VercelRequest, VercelResponse} from '@vercel/node'
import {Collection, ObjectId, Document} from 'mongodb'
import {extractReturnDate} from './get-comments'
import {loadConfig} from './lib/ConfigLoader'
import {connectDatabase} from './lib/DatabaseOperator'
import {connectRedis} from './lib/RedisOperator'
import {calcHash, initRequest} from './lib/utils'

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
    const checkResult = await initRequest(
        request, response,
        'post', {allows: 'china'},
        'POST'
    )
    if (!checkResult) return
    const {ip, location} = checkResult
    // 提取评论内容
    const commentBody = extractInfo(request, ip, location!)
    if (typeof commentBody === 'string') {
        return response.status(400).json({
            status: 400,
            msg: commentBody
        })
    }
    // 检查是否允许发布
    const commentChecked = checkComment(commentBody)
    if (typeof commentChecked === 'string') {
        return response.status(200).json({
            status: 403,
            message: commentChecked
        })
    }
    const collectionName = commentBody.page!
    delete commentBody['page']
    const collection = (await connectDatabase()).collection<CommentBody>(collectionName)
    Promise.all([
        collection.insertOne(commentBody),
        reply(collection, commentBody),
        pushNewCommentToRedis(collectionName, commentBody)
    ]).then(() => {
        response.status(200).json({
            status: 200,
            data: extractReturnDate(commentBody)
        })
    })
}

/** 推送一个新的评论记录到 redis */
async function pushNewCommentToRedis(pageId: string, body: CommentBody) {
    if ('reply' in body) return
    const id = body._id
    const key = 'recentComments'
    const date = id.getTimestamp().getTime()
    await connectRedis().pipeline()
        .zadd(key, date, `${id.toHexString()}:${pageId}`)
        .zpopmin(key)
        .exec()
}

/** 回复评论 */
async function reply(collection: Collection<CommentBody>, body: CommentBody) {
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
function extractInfo(request: VercelRequest, ip: string, location: string): CommentBody | string {
    const json = request.body
    const list = ['name', 'email', 'pageId', 'content']
    for (let key of list) {
        if (!(key in json))
            return `${key} 值缺失`
    }
    const result: CommentBody = {
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
function checkComment(body: CommentBody): boolean | string {
    const banChars = ['.', '*']
    if (banChars.find(it => body.page!.includes(it)))
        return '页面 ID 不能包含英文句号和星号'
    if (body.page!.length > 64)
        return '页面 ID 长度过长'
    const checker = loadConfig().commentChecker
    if (checker.user) {
        const msg = checker.user(body.name, body.email, body.link)
        if (msg) return msg
    }
    if (checker.xss) {
        const msg = checker.xss(body.content)
        if (msg) return msg
    }
    if (checker.content) {
        const msg = checker.content(body.content)
        if (msg) return msg
    }
    return true
}

/** 楼主评论 body */
export interface CommentBody extends Document {
    _id: ObjectId,
    /** 发表用户的名称 */
    name: string,
    /** 邮箱 */
    email: string,
    /** 邮箱 md5 值 */
    emailMd5: string,
    /** 用户主页 */
    link?: string,
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