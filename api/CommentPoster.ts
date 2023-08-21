import {VercelRequest, VercelResponse} from '@vercel/node'
import * as crypto from 'crypto'
import fetch from 'node-fetch'
import {connectDatabase, getIpLocation} from './utils'

/** 发布一个评论 */
export async function postComment(request: VercelRequest, response: VercelResponse) {
    const ip = request.socket.remoteAddress
    if (!ip) return response.status(403).end()
    const location = getIpLocation(ip).then(json => {
        if (json.countryCode !== 'CN') {
            response.status(403).end()
            return false
        }
        return json
    })
    const commentBody = extractInfo(request)
    if (response.writableEnded) return
    if (typeof commentBody === 'string') {
        return response.status(400).send(commentBody)
    }

    const checkResult = checkComment(commentBody)
    if (response.writableEnded) return
    if (typeof checkResult === 'string') {
        return response.status(200).json({
            status: 403,
            message: checkResult
        })
    } else if (!checkResult) {
        return response.status(500).end()
    }

    const db = await connectDatabase()
    location.then(async json => {
        if (!json) return
        await db.collection('comments')
            .insertOne(commentBody)
        response.status(200).end()
    }).catch(err => {
        console.error(err)
        response.status(500).end()
    })
}

/** 从请求中提取评论信息 */
function extractInfo(request: VercelRequest): CommentBody | string {
    const json = request.body
    const list = ['name', 'email', 'page', 'content']
    for (let key of list) {
        if (!(key in json))
            return `${key} 值缺失`
    }
    return {
        name: json.name,
        email: json.email,
        emailMd5: crypto.createHash('md5').update(json.email).digest('hex'),
        link: json.link,
        ip: request.socket.remoteAddress!,
        page: json.page,
        time: new Date().toUTCString(),
        content: json.content
    }
}

/**
 * 检查评论是否可以发布
 * @return {boolean|string} 返回 true 表示可以，否则表示不可以
 */
function checkComment(body: CommentBody): boolean | string {
    const env = process.env
    const blocked = {
        user: env['USER_BLOCKED'] ? JSON.parse(env['USER_BLOCKED']) : ['免费', '节点', 'clash', 'v2ray', '机场'],
        link: env['LINK_BLOCKED'] ? new RegExp(env['LINK_BLOCKED'], 'i') : /^(https?:\/\/|\/\/)?k?github\.com/i
    }
    if (blocked.user.find((keyword: string) => body.name.includes(keyword)))
        return '用户名称包含违规内容'
    if (blocked.link.test(body.link))
        return '用户主页已被屏蔽'
    return true
}

interface CommentBody {
    /** 发表用户的名称 */
    name: string
    /** 邮箱 */
    email: string
    /** 邮箱 md5 值 */
    emailMd5: string
    /** 用户主页 */
    link: string
    /** 评论内容 */
    content: string
    /** 发表地 IP 地址 */
    ip: string
    /** 发表页面地址或其它唯一标识符 */
    page: string
    /** 时间 */
    time: string
}