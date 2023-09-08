import {VercelRequest, VercelResponse} from '@vercel/node'
import {findOnVercel} from 'ip-china-location'
import path from 'path'
import * as zlib from 'zlib'

export class KmentsPlatform {
    constructor(public platform: KmentsPlatformType, public request: any, public response: any) {}
    private _ip: string | undefined
    /** 获取客户端请求方法 */
    get method(): string {
        return this.request.method
    }
    /** 获取客户端的 referer 字段 */
    get referer(): string | undefined {
        return this.readHeader('referer') as string | undefined
    }
    /** 获取客户端的 origin 字段 */
    get origin(): string | undefined {
        return this.readHeader('origin') as string | undefined
    }
    /** 获取客户端的 IP 地址 */
    get ip(): string | undefined {
        if (this._ip) return this._ip
        const list = ['x-forwarded-for', 'x-real-ip', 'x-client-ip']
        for (let key of list) {
            const value = this.readHeader(key)
            if (value)
                return Array.isArray(value) ? value[0] : value
        }
        const request = this.request
        this._ip = request.socket?.remoteAddress || request.connection?.remoteAddress || undefined
        return this._ip
    }
    get location(): string | undefined {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                return findOnVercel(this.request, path.resolve('./', 'private', 'region.bin'), this.ip)
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }
    /** 读取一个请求头信息 */
    readHeader(key: string): string | string[] | undefined {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                return (this.request as VercelRequest).headers[key]
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }
    /** 向响应头写入一个 header */
    setHeader(key: string, values: string | readonly string[] | number) {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                (this.response as VercelResponse).setHeader(key, values)
                break
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }
    /** 读取一个 cookie */
    raedCookie(key: string): string | undefined {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                return (this.request as VercelRequest).cookies[key]
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }
    /** 向客户端发送文本数据 */
    sendText(statusCode: number, text: string) {
        const acceptEncoding = this.readHeader('accept-encoding')
        let zipped: string | Buffer = text
        if (acceptEncoding) {
            if (acceptEncoding.includes('br')) {
                this.setHeader('Content-Encoding', 'br')
                zipped = zlib.brotliCompressSync(text)
            } else if (acceptEncoding.includes('gzip')) {
                this.setHeader('Content-Encoding', 'gzip')
                zipped = zlib.gzipSync(text)
            } else if (acceptEncoding.includes('deflate')) {
                this.setHeader('Content-Encoding', 'deflate')
                zipped = zlib.deflateSync(text)
            }
        }
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                (this.response as VercelResponse).status(statusCode).send(zipped)
                break
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }
    /** 发送一个 JSON 数据 */
    sendJson(statusCode: number, data: any) {
        this.setHeader('Content-Type', 'application/json')
        this.sendText(statusCode, JSON.stringify(data))
    }
    /** 发送一个空响应 */
    sendNull(statusCode: number) {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                (this.response as VercelResponse).status(statusCode).end()
                break
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }
}

/** 平台名称 */
export enum KmentsPlatformType {
    VERCEL
}