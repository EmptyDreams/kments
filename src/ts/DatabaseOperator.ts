import {Db, MongoClient} from 'mongodb'
import {loadConfig} from './ConfigLoader'

const cacheMap = new Map<string, MongoClient>()

/** 连接数据库 */
export function connectDatabase(url?: string, dbName?: string): Db {
    if (!url) {
        url = loadConfig().mongodb
        dbName = 'kments'
    }
    let cache = cacheMap.get(url)
    if (!cache) {
        // noinspection SpellCheckingInspection
        cache = new MongoClient(url, {compressors: ['zstd', 'zlib']})
        cacheMap.set(url, cache)
    }
    return cache.db(dbName)
}