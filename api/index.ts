import {VercelRequest, VercelResponse} from '@vercel/node'
import {certifyAdmin} from './lib/src/ts/api/AdminCertificate'
import {certifyUser} from './lib/src/ts/api/AuthCertificate'
import {updateComment} from './lib/src/ts/api/CommentsEditor'
import {getComments} from './lib/src/ts/api/CommentsGetter'
import {postComment} from './lib/src/ts/api/CommentsPoster'
import {hideComments} from './lib/src/ts/api/HideComments'
import {logoutKments} from './lib/src/ts/api/Logout'
import {importMongodb} from './lib/src/ts/api/MongodbImporter'
import {getRecently} from './lib/src/ts/api/RecentlyGetter'
import {countVisit, getPagesVisit} from './lib/src/ts/api/VisitCounter'
import {KmentsPlatform, KmentsPlatformType} from './lib/src/ts/KmentsPlatform'
import { deleteComments } from './lib/src/ts/api/CommentDeleter'

export default function (request: VercelRequest, response: VercelResponse) {
    const platform = new KmentsPlatform(KmentsPlatformType.VERCEL, request, response)
    const url = request.url!
    switch (url) {
        case '/admin-certificate/':
            return certifyAdmin(platform)
        case '/auth-certificate/':
            return certifyUser(platform)
        case '/count-visit/':
            return countVisit(platform)
        case '/delete-comments/':
            return deleteComments(platform)
        case '/get-pages-view/':
            return getPagesVisit(platform)
        case '/hide-comments/':
            return hideComments(platform)
        case '/import-mongodb/':
            return importMongodb(platform)
        case '/log-out/':
            return logoutKments(platform)
        case '/post-comments/':
            return postComment(platform)
        case '/update-comments/':
            return updateComment(platform)
    }
    switch (true) {
        case url.startsWith('/get-comments/'):
            return getComments(platform)
        case url.startsWith('/get-recent-comments/'):
            return getRecently(platform)
    }
    platform.sendNull(404)
}