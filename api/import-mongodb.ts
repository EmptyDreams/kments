import {VercelRequest, VercelResponse} from '@vercel/node'
import {importMongodb} from './lib/src/ts/api/MongodbImporter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'

/**
 * 从 mongodb 中导入评论数据
 *
 * 请求方法：POST (with json cookie)
 *
 * 参数解释：
 *
 * + type - 评论名称，当前仅支持 twikoo
 * + mongodb - 数据库的 URL
 */
export default async function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    await importMongodb(platform)
}