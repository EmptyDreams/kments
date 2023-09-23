/**
 * @param api API 地址（附带协议名称和尾斜杠）
 * @param nameGetter {function():string} 获取用户名称
 * @param emailGetter {function():string} 获取用户邮箱
 * @param linkGetter {function():string} 获取用户主页
 * @constructor
 */
export default function (api, nameGetter, emailGetter, linkGetter) {
    const fetchHelper = (method, type, params) => {
        const promise = method === 'GET' ?
            fetch(`${api}${type}/?${params}`) :
            fetch(`${api}${type}/`, {method, body: params ? JSON.stringify(params) : undefined})
        return promise.then(response => {
            if (!response.ok) throw response
            return response.json()
        }).then(json => {
            if (json.status !== 200) throw json
            return json
        })
    }
    const postHelper = (content, extraBody) =>
        fetchHelper('POST', 'post-comment', Object.assign({
            page: location.pathname,
            name: nameGetter(),
            email: emailGetter(),
            link: linkGetter(),
            content,
            pageTitle: document.title
        }, extraBody)).then(json => json.data)
    /**
     * 发布一个评论
     * @param content {string} 评论内容（HTML 格式）
     * @return {Promise<{id: string, location: string}>}
     */
    this.post = (content) => postHelper(content, {})
    /**
     * 回复指定评论
     * @param root 评论所在的主楼评论的 ID
     * @param content 评论内容（HTML 格式）
     * @param ats 要 AT 的子评论的 ID
     * @return {Promise<{id: string, location: string}>}
     */
    this.reply = (root, content, ...ats) => postHelper(content, {
        reply: root,
        at: ats.length === 1 ? ats[0] : ats
    })
    /**
     * 获取评论
     * @param start 起始下标
     * @param limit 数量限制
     * @param postmaster 父评论 ID
     * @param pathname 评论所在页面的 pathname
     * @param truth 是否显示隐藏的评论[0-不显示，1-显示，2-只显示隐藏评论]
     * @return {Promise<{
     *      id: string,
     *      name: string, email: string, link?: string,
     *      location: string,
     *      content: string,
     *      subCount: number, hide?: boolean
     * }[]>}
     */
    this.get = (start = 0, limit = 10, postmaster = '', pathname = location.pathname, truth = 0) => {
        const params = [`page=${encodeURIComponent(pathname)}`]
        if (start) params.push(`start=${start}`)
        if (limit !== 10) params.push(`len=${limit}`)
        if (postmaster) params.push(`id=${postmaster}`)
        if (truth) params.push(`truth=${truth}`)
        return fetchHelper('GET', 'get-comments', params.join('&'))
            .then(json => json.data)
    }
    /**
     * 获取最新的 N 条评论
     * @param limit 最大数量限制（最大为 10）
     * @return {Promise<{
     *      id: string,
     *      name: string, email: string, link?: string,
     *      location: string,
     *      content: string,
     *      subCount: number
     * }[]>}
     */
    this.recently = (limit = 5) =>
        fetchHelper('GET', 'get-recent-comments', `limit=${limit}`)
            .then(json => json.data)
    /**
     * 修改指定评论的内容
     * @param id 要修改的评论的 ID
     * @param content 修改后的内容（HTML 格式）
     * @param page 评论所在页面的 pathname
     * @return {Promise<any>}
     */
    this.update = (id, content, page = location.pathname) =>
        fetchHelper('PUT', 'update-comments', {id, content, page})
    /**
     * 管理员身份认证
     * @param password {string} 密码
     * @return {Promise<any>}
     */
    this.adminLogin = password => fetchHelper('POST', 'admin-certificate', password)
    /**
     * 用户身份认证。（每 60s 内只可调用一次）
     *
     * 调用接口后会向用户发送包含验证码的邮件，将用户收到的验证码作为参数调用接口返回的函数即可判断是否认证成功。
     *
     * @return {Promise<function(string):Promise<any>>}
     */
    this.userLogin = () => {
        const type = 'auth-certificate'
        return fetchHelper('POST', type, {email: emailGetter(), name: nameGetter()})
            .then(() => (
                (code) => fetchHelper('POST', type, {code})
            ))
    }
    /**
     * 取消用户身份认证
     * @return {Promise<any>}
     */
    this.logout = () => fetchHelper('POST', 'log-out')
    /**
     * 获取指定页面的访问量统计
     *
     * + `pathname` 传入 undefined、null 或空字符串表示获取全站的访问量统计
     * + `pathname` 传入字符串表示增加并获取指定页面的访问量统计
     * + `pathname` 传入字符串数组表示获取指定页面的访问量统计
     *
     * @param pathname {?(string[]|string)} 指定页面
     * @return {Promise<number[]>} 按照 pathname 中的顺序依次排列，值为 -1 表明服务器获取失败
     */
    this.count = (pathname) => {
        if (Array.isArray(pathname)) {
            return fetchHelper('POST', 'get-pages-view', pathname)
                .then(json => json.data)
        } else {
            const body = pathname ? {body: pathname} : null
            return fetchHelper('POST', 'count-visit', body)
                .then(json => [json.data])
        }
    }
    /**
     * 删除指定的评论（仅管理员可用）
     *
     * 用法示例：
     *
     * ```javascript
     * const kments = new Kments('https://xxxxx')
     * await kments.delete({
     *     '/posts/simple/': ['000000000000000000000000', ...],
     *     ...
     * })
     * ```
     *
     * @param data {any} 每个元素的 key 为 `pathname`，value 为要删除的评论的 ID 数组
     * @return {Promise<any>}
     */
    this.delete = (data) => fetchHelper('DELETE', 'delete-comments', data)
    /**
     * 隐藏指定评论，管理员与已认证用户均可使用
     * @param values {string[]} 要隐藏的评论的 ID
     * @param page {string} 评论所在页面的 pathname
     * @return {Promise<number>} 隐藏失败的数量
     */
    this.hide = (values, page = location.pathname) =>
        fetchHelper('PUT', 'hide-comments', {page, values})
            .then(json => json.fails)
}