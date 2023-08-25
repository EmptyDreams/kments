import {VercelRequest, VercelResponse} from '@vercel/node'

// noinspection JSUnusedGlobalSymbols
export default function (_: VercelRequest, response: VercelResponse) {
    response.status(403).end()
}