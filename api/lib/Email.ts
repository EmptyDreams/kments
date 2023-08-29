import {Transporter} from 'nodemailer'
import * as Nodemailer from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'
import {EmailContentInfo, loadConfig} from './ConfigLoader'

let transporter: Transporter<SMTPTransport.SentMessageInfo>

/**
 * 发送邮件到指定邮箱
 * @param to 指定的邮箱
 * @param info 附加信息
 */
export async function sendTo(to: string, info: EmailContentInfo) {
    const transporter = initTransporter()
    if (!transporter) return false
    const config = loadConfig().email!
    return transporter.sendMail({
        from: `${config.name} <${config.fromEmail ?? config.user}>`,
        to,
        subject: config.title,
        text: config.text?.(info),
        html: config.html?.(info),
        amp: config.amp?.(info)
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