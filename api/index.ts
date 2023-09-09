import {VercelRequest, VercelResponse} from '@vercel/node'
import {KmentsPlatform, KmentsPlatformType } from '../core/src/ts/KmentsPlatform'
import { certifyAdmin } from '../core/src/ts/api/AdminCertificate'
import { certifyUser } from '../core/src/ts/api/AuthCertificate'
import { countVisit, getPagesVisit } from '../core/src/ts/api/VisitCounter'
import { deleteComments } from '../core/src/ts/api/CommentDeleter'
import { hideComments } from '../core/src/ts/api/HideComments'
import { importMongodb } from '../core/src/ts/api/MongodbImporter'
import { logoutKments } from '../core/src/ts/api/Logout'
import { postComment } from '../core/src/ts/api/CommentsPoster'
import { updateComment } from '../core/src/ts/api/CommentsEditor'
import { getComments } from '../core/src/ts/api/CommentsGetter'
import { getRecently } from '../core/src/ts/api/RecentlyGetter'

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