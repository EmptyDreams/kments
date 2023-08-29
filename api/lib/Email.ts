import {Transporter} from 'nodemailer'
import * as Nodemailer from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'
import {EmailContentInfo, loadConfig} from './ConfigLoader'

let transporter: Transporter<SMTPTransport.SentMessageInfo>

/**
 * 发送评论通知邮件到指定邮箱
 * @param to 指定的邮箱
 * @param info 附加信息
 */
export async function sendReplyTo(to: string, info: EmailContentInfo) {
    const config = loadConfig().email!
    return sendTo(to, config.title, config.text?.(info), config.html?.(info), config.amp?.(info))
}

/** 发送任意邮件 */
export async function sendTo(to: string, subject: string, text?: string, html?: string, amp?: string) {
    const transporter = initTransporter()
    if (!transporter) return false
    const config = loadConfig().email!
    return transporter.sendMail({
        from: `${config.name} <${config.fromEmail ?? config.user}>`,
        to, subject,
        text, html, amp
    })
}

function initTransporter(): Transporter<SMTPTransport.SentMessageInfo> | undefined {
    if (transporter) return transporter
    const config = loadConfig()
    const emailConfig = config.email
    if (!emailConfig) return undefined
    let optional: SMTPTransport.Options = emailConfig.service == 'SMTP' ? {
        host: emailConfig.host,
        port: emailConfig.port
    } : {service: emailConfig.service}
    transporter = Nodemailer.createTransport({
        ...optional,
        auth: {
            user: emailConfig.user,
            pass: config.env.emailPassword
        }
    })
    return transporter
}