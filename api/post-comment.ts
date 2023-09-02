import {VercelRequest, VercelResponse} from '@vercel/node'
import {Collection, ObjectId, Document} from 'mongodb'
import {loadConfig} from './lib/ConfigLoader'
import {connectDatabase} from './lib/DatabaseOperator'
import {sendNotice, sendReplyTo} from './lib/Email'
import {connectRedis} from './lib/RedisOperator'
import {calcHash, checkEmail, initRequest} from './lib/utils'
import * as HTMLParser from 'fast-html-parser'

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
 * + pageTitle: string - 当前页面的名称
 * + reply: string - 要回复的评论的 ID（可选）
 * + at: {string|string[]} - 要 @ 的评论的 ID（可选）
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const checkResult = await initRequest(
        request, response, 'post', 'POST'
    )
    if (!checkResult) return
    const {ip, location} = checkResult
    // 提取评论内容
    const {body, pageId, pageTitle, pageUrl, msg} = extractInfo(request, ip, location!) as any
    if (msg) {
        return response.status(400).json({
            status: 400,
            msg: msg
        })
    }
    // 检查是否允许发布
    const commentChecked = checkComment(body, pageId)
    if (typeof commentChecked === 'string') {
        return response.status(200).json({
            status: 403,
            message: commentChecked
        })
    }
    const collection = (await connectDatabase()).collection<CommentBody>(pageId)
    Promise.all([
        collection.insertOne(body),
        reply(collection, body, pageTitle, pageUrl),
        pushNewCommentToRedis(pageId, body),
        noticeMaster(body, pageTitle, pageUrl)
    ]).then(() => {
        response.status(200).json({
            status: 200,
            data: {
                id: body._id,
                location: body.location
            }
        })
    })
}

/** 发送评论通知到博主邮箱 */
async function noticeMaster(body: CommentBody, title: string, url: string) {
    const config = loadConfig()
    const emailConfig = config.noticeEmail
    const masterEmail = config.env.admin.email
    if (!emailConfig || body.email == masterEmail) return
    return sendNotice({
        body: {
            name: body.name,
            email: body.emailMd5,
            content: body.content,
            rawText: HTMLParser.parse(body.content).text
        },
        page: title,
        pageUrl: new URL(url),
        reply: new URL(url)
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
async function reply(collection: Collection<CommentBody>, body: CommentBody, title: string, url: string) {
    let {reply, at} = body
    if (!reply) return
    const config = loadConfig()
    const emailInfo = {
        newly: {
            name: body.name,
            email: body.emailMd5,
            content: body.content,
            rawText: HTMLParser.parse(body.content).text
        },
        page: title,
        pageUrl: new URL(url),
        reply: new URL(url)
    }
    if (at) {
        const idList = at.map(it => new ObjectId(it))
        await Promise.all([
            collection.find(
                {_id: {$in: idList}},
                {projection: {name: true, email: true, emailMd5: true, content: true}}
            ).toArray().then(list => {
                const set = new Set<string>()
                return Promise.all(
                    list.filter(it => {
                        if (set.has(it.email)) return false
                        set.add(it.email)
                        return true
                    }).map(comment => {
                        if (config.env.admin.email == comment.email || body.email == comment.email) return
                        return sendReplyTo(comment.email, {
                            replied: {
                                name: comment.name,
                                email: comment.emailMd5,
                                content: comment.content,
                                rawText: HTMLParser.parse(comment.content).text
                            }, ...emailInfo
                        })
                    })
                )
            }),
            collection.updateMany({
                _id: {$in: idList}
            }, {
                // @ts-ignore
                $push: { children: body._id }
            })
        ])
    } else {
        await collection.findOneAndUpdate({
            _id: new ObjectId(reply)
        }, {
            $inc: { subCount: 1},
            // @ts-ignore
            $push: { children: body._id }
        }, {
            projection: {name: true, email: true, emailMd5: true, content: true}}
        ).then(async modifyResult => {
            const comment = modifyResult.value!
            if (comment.email == config.env.admin.email || comment.email == body.email) return
            try {
                return await sendReplyTo(comment.email as string, {
                    replied: {
                        name: comment.name,
                        email: comment.emailMd5,
                        content: comment.content,
                        rawText: HTMLParser.parse(comment.content).text
                    }, ...emailInfo
                })
            } catch (err) {
                console.error('评论邮件通知发送失败')
                console.error(err)
            }
        })
    }
}

/** 从请求中提取评论信息 */
function extractInfo(
    request: VercelRequest, ip: string, location: string
): { body: CommentBody, pageId: string, pageTitle?: string, pageUrl: string } | { msg: string } {
    const json = request.body
    const list = ['name', 'email', 'pageId', 'content', 'pageTitle']
    for (let key of list) {
        if (!(key in json))
            return {msg: `${key} 值缺失`}
    }
    const result: CommentBody = {
        _id: new ObjectId(),
        name: json.name,
        email: json.email,
        emailMd5: calcHash('md5', json.email.toLowerCase()),
        link: json.link,
        ip, location,
        content: json.content
    }
    if ('reply' in json)
        result.reply = json.reply
    if ('at' in json)
        result.at = json.at
    return {
        body: result,
        pageId: decodeURIComponent(`c-${json['pageId']}`),
        pageTitle: json.pageTitle,
        pageUrl: request.headers.referer ?? 'http://localhost.dev/'
    }
}

/**
 * 检查评论是否可以发布
 * @return {boolean|string} 返回 true 表示可以，否则表示不可以
 */
function checkComment(body: CommentBody, pageId: string): boolean | string {
    const banChars = ['.', '*']
    if (banChars.find(it => pageId.includes(it)))
        return '页面 ID 不能包含英文句号和星号'
    if (pageId.length > 64)
        return '页面 ID 长度过长'
    if (!checkEmail(body.email))
        return '用户邮箱格式错误'
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
    /** 要回复的评论 */
    reply?: string,
    /** 要 at 的评论 */
    at?: string[],
    /** 子评论列表 */
    children?: string[]
}