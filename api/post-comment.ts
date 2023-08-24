import {VercelRequest, VercelResponse} from '@vercel/node'
import {findOnVercel} from 'ip-china-location'
import {ObjectId} from 'mongodb'
import path from 'path'
import {calcHash, connectDatabase, getUserIp} from './utils'
import * as HTMLChecker from 'fast-html-checker'

// noinspection JSUnusedGlobalSymbols
/** 发布一个评论 */
export default function (request: VercelRequest, response: VercelResponse) {
    // 检查访问方法
    if (request.method !== 'POST')
        return response.status(200).json({
            status: 405,
            msg: '仅支持 POST 访问'
        })
    // 提取和检查 IP
    const ip = getUserIp(request)
    if (!ip) return response.status(200).json({
        status: 400,
        msg: '请求缺少 IP 信息'
    })
    // 提取和检查用户地址
    const location = findOnVercel(request, path.resolve('./', 'private', 'region.bin'), ip)
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
    // 发表评论
    connectDatabase()
        .then(db => db.collection('comments').insertOne(commentBody))
        .then(() => response.status(200).json({
            status: 200
        }))
}

/** 从请求中提取评论信息 */
function extractInfo(request: VercelRequest, ip: string, location: string): CommentBody | string {
    const json = request.body
    const list = ['name', 'email', 'page', 'content', 'link']
    for (let key of list) {
        if (!(key in json))
            return `${key} 值缺失`
    }
    return {
        _id: new ObjectId(new Date().toUTCString() + calcHash('md5', `${json.email}+${json.name}`)),
        name: json.name,
        email: json.email,
        emailMd5: calcHash('md5', json.email),
        link: json.link,
        ip, location,
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
    if (HTMLChecker.check(body.content, {
            allowTags: ['a', 'strong']
        })
    ) return '用户评论包含非法内容'
    return true
}

interface CommentBody {
    _id: ObjectId,
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
    /** 地理位置 */
    location: string,
    /** 发表页面地址或其它唯一标识符 */
    page: string
    /** 时间 */
    time: string
}