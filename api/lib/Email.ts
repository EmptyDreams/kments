import * as Nodemailer from 'nodemailer'
import {Transporter} from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'
import {loadConfig} from './ConfigLoader'

/** 发送评论信息到博主邮箱 */
export async function sendNotice(info: CommentPostEmailInfo) {
    const config = loadConfig()
    const to = config.env.admin.email
    return sendTo(to, config.noticeEmail!, info, 'normal')
}

/**
 * 发送评论通知邮件到指定邮箱
 * @param to 指定的邮箱
 * @param info 附加信息
 */
export async function sendReplyTo(to: string, info: CommentReplyEmailInfo) {
    const config = loadConfig().replyEmail!
    return sendTo(to, config, info, 'normal')
}

export async function sendAuthCodeTo(to: string, info: AuthCodeEmailInfo) {
    const config = loadConfig().authCodeEmail!
    return sendTo(to, config, info, 'high')
}

/** 发送任意邮件 */
export async function sendTo<T>(to: string, config: EmailConfig<T>, info: T, priority: 'high' | 'normal' | 'low') {
    const transporter = initTransporter(config)
    if (!transporter) return false
    return transporter.sendMail({
        from: `${config.name} <${config.fromEmail ?? config.user}>`,
        to,
        subject: config.title,
        text: config.text?.(info),
        html: config.html?.(info),
        amp: config.amp?.(info),
        priority
    }).finally(() => transporter.close())
}

function initTransporter(config: EmailConfig<any>): Transporter<SMTPTransport.SentMessageInfo> | undefined {
    if (!config) return undefined
    let optional: SMTPTransport.Options = config.service == 'SMTP' ? {
        host: config.host,
        port: config.port,
        secure: config.secure
    } : {service: config.service}
    return Nodemailer.createTransport({
        ...optional,
        auth: {
            user: config.user,
            pass: config.password!
        }
    })
}

export interface EmailBasicConfig {
    /** 服务类型 */
    service?: 'Gmail' | 'Hotmail' | 'Outlook' | 'Yahoo' | 'QQ' | 'Zoho' | 'SMTP'
    /** 用户名（通常为邮箱地址） */
    user?: string
    /** 邮件标题 */
    title?: string
    /** 发件人姓名 */
    name?: string
    /** 邮箱地址，留空表明同用户名 */
    fromEmail?: string
    /** SMTP 服务域名 */
    host?: string
    /** SMTP 服务端口 */
    port?: number
    /** 是否启用 TLS */
    secure?: boolean
}

export type EmailContentBuilder<T> = (info: T) => string

export interface EmailConfig<T> extends EmailBasicConfig {
    text?: EmailContentBuilder<T>
    html?: EmailContentBuilder<T>
    amp?: EmailContentBuilder<T>
    /** 密码，该项由系统自动填入，用户禁填 */
    password?: string
}

/** 评论发布信息 */
export interface CommentPostEmailInfo {
    body: CommentBodyInfo
    page: string
    pageUrl: URL
    reply: URL
}

interface CommentBodyInfo {
    /** 姓名 */
    name: string
    /** 邮箱 MD5 */
    email: string
    /** 评论内容（HTML） */
    content: string
    /** 评论内容的 text 形式 */
    rawText: string
}

/** 评论回复信息 */
export interface CommentReplyEmailInfo {
    /** 被回复的评论的信息 */
    replied: CommentBodyInfo
    /** 新评论的内容 */
    newly: CommentBodyInfo
    /** 评论所在页面的名称 */
    page: string
    /** 评论所在页面的 URL */
    pageUrl: URL
    /** 回复地址 */
    reply: URL
}

/** 验证码发放信息 */
export interface AuthCodeEmailInfo {
    /** 用户名称 */
    name: string
    /** 验证码 */
    code: string
    /** 验证码用途（将拼接为“用于 xxx 的验证码”） */
    msg: string
}