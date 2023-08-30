import * as Nodemailer from 'nodemailer'
import {Transporter} from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'
import {loadConfig} from './ConfigLoader'

let transporter: Transporter<SMTPTransport.SentMessageInfo>

/**
 * 发送评论通知邮件到指定邮箱
 * @param to 指定的邮箱
 * @param info 附加信息
 */
export async function sendReplyTo(to: string, info: CommentReplyEmailInfo) {
    const config = loadConfig().replyEmail!
    return sendTo(to, config, info)
}

export async function sendAuthCodeTo(to: string, info: AuthCodeEmailInfo) {
    const config = loadConfig().authCodeEmail!
    return sendTo(to, config, info)
}

/** 发送任意邮件 */
export async function sendTo<T>(to: string, config: EmailConfig<T>, info: T) {
    const transporter = initTransporter()
    if (!transporter) return false
    return transporter.sendMail({
        from: `${config.name} <${config.fromEmail ?? config.user}>`,
        to,
        subject: config.title,
        text: config.text?.(info),
        html: config.html?.(info),
        amp: config.amp?.(info)
    })
}

function initTransporter(config?: EmailConfig<any>): Transporter<SMTPTransport.SentMessageInfo> | undefined {
    if (!config) return undefined
    let optional: SMTPTransport.Options = config.service == 'SMTP' ? {
        host: config.host,
        port: config.port,
        secure: config.secure
    } : {service: config.service}
    transporter = Nodemailer.createTransport({
        ...optional,
        auth: {
            user: config.user,
            pass: config.password!
        }
    })
    return transporter
}

export interface EmailBasicConfig {
    /** 服务类型 */
    service: 'Gmail' | 'Hotmail' | 'Outlook' | 'Yahoo' | 'QQ' | 'Zoho' | 'SMTP'
    /** 用户名（通常为邮箱地址） */
    user: string
    /** 邮件标题 */
    title: string
    /** 发件人姓名 */
    name: string
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

/** 评论回复信息 */
export interface CommentReplyEmailInfo {
    /** 对方的名称 */
    name: string
    /** 对方邮箱的 MD5 */
    email: string
    /** 评论所在页面的名称 */
    page: string
    /** 评论所在页面的 URL */
    pageUrl: URL
    /** 对方的评论内容 */
    content: string
    /** 被回复的评论的内容 */
    rawContent: string
    /** 回复地址 */
    reply: URL
}

/** 验证码发放信息 */
export interface AuthCodeEmailInfo {
    /** 验证码 */
    code: string
    /** 验证码用途（将拼接为“用于 xxx 的验证码”） */
    msg: string
}