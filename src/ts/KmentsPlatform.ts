import {VercelRequest, VercelResponse} from '@vercel/node'
import {findOnVercel} from 'ip-china-location'
import path from 'path'
import * as zlib from 'zlib'

export class KmentsPlatform {

    private _ip: string | undefined

    constructor(public platform: KmentsPlatformType, public request: any, public response: any) {}

    get method(): string {
        return this.request.method
    }
    get referer(): string | undefined {
        return this.readHeader('referer') as string | undefined
    }
    get origin(): string | undefined {
        return this.readHeader('origin') as string | undefined
    }
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
    get body(): any {
        return this.request.body
    }

    readBodyAsString(): string {
        const result = this.body
        if (typeof result != 'string')
            throw 'body is not string'
        return result
    }

    readBodyAsJson(): any {
        const result = this.body
        if (typeof result != 'object')
            throw 'body is not json'
        return result
    }

    readHeader(key: string): string | string[] | undefined {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                return (this.request as VercelRequest).headers[key]
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }

    setHeader(key: string, value: string | readonly string[] | number) {
        switch (this.platform) {
            case KmentsPlatformType.VERCEL:
                (this.response as VercelResponse).setHeader(key, value)
                break
            default:
                throw `unknowns platform: ${this.platform}`
        }
    }

    setCookie(value: string | readonly string[]) {
        this.setHeader('Set-Cookie', value)
    }

    readCookie(key: string): string | undefined {
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