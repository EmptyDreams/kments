import {Db, MongoClient} from 'mongodb'
import {loadConfig} from './ConfigLoader'

let db: Db

/** 连接数据库 */
export async function connectDatabase(): Promise<Db> {
    if (db) return db
    const config = loadConfig().env.mongodb
    // noinspection SpellCheckingInspection
    const client = new MongoClient(
        `mongodb+srv://${config.name}:${config.password}@comments.rwouas6.mongodb.net/?retryWrites=true&w=majority`,
        {compressors: ['zstd', 'zlib']}
    )
    db = client.db('kments')
    return db
}