/**
 * @param api API 地址（附带协议名称和尾斜杠）
 * @param nameGetter {function():string} 获取用户名称
 * @param emailGetter {function():string} 获取用户邮箱
 * @param linkGetter {function():string} 获取用户主页
 * @constructor
 */
function Kments(api, nameGetter, emailGetter, linkGetter) {
    const postHelper = (content, extraBody) => fetch(`${api}post-comment/`, {
        method: 'POST',
        body: JSON.stringify(Object.assign({
            page: location.pathname,
            name: nameGetter(),
            email: emailGetter(),
            link: linkGetter(),
            content,
            pageTitle: document.title
        }, extraBody))
    })
    /**
     * 发布一个评论
     * @param content {string} 评论内容（HTML 格式）
     * @return {Promise<Response>}
     */
    this.post = (content) => postHelper(content, {})
    /**
     * 回复指定评论
     * @param root 评论所在的主楼评论的 ID
     * @param content 评论内容（HTML 格式）
     * @param ats 要 AT 的子评论的 ID
     * @return {Promise<Response>}
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
     * @return {Promise<Response>}
     */
    this.get = (start = 0, limit = 10, postmaster = '', pathname = location.pathname, truth = 0) => {
        const params = [`page=${encodeURIComponent(pathname)}`]
        if (start) params.push(`start=${start}`)
        if (limit !== 10) params.push(`len=${limit}`)
        if (postmaster) params.push(`id=${postmaster}`)
        if (truth) params.push(`truth=${truth}`)
        return fetch(`${api}get-comments/?${params.join('&')}`)
    }
    /**
     * 获取最新的 N 条评论
     * @param limit 最大数量限制（最大为 10）
     * @return {Promise<Response>}
     */
    this.recently = (limit = 5) => fetch(`${api}get-recent-comments/?limit=${limit}`)
    /**
     * 修改指定评论的内容
     * @param id 要修改的评论的 ID
     * @param content 修改后的内容（HTML 格式）
     * @param page 评论所在页面的 pathname
     * @return {Promise<Response>}
     */
    this.update = (id, content, page = location.pathname) => fetch(`${api}update-comment/`, {
        method: 'POST',
        body: JSON.stringify({id, content, page})
    })
    /**
     * 管理员身份认证
     * @param password {string} 密码
     * @return {Promise<Response>}
     */
    this.adminLogin = password => fetch(`${api}admin-certificate/`, {
        method: 'POST',
        body: password
    })
    /**
     * 用户身份认证。（每 60s 内只可调用一次）
     *
     * 调用接口后会向用户发送包含验证码的邮件，将用户收到的验证码作为参数调用接口返回的函数即可判断是否认证成功。
     *
     * @return {Promise<function(string):Promise<void>>}
     */
    this.userLogin = () => {
        const url = `${api}auth-certificate/`
        return fetch(url, {
            method: 'POST',
            body: JSON.stringify({email: emailGetter()})
        }).then(response => response.json)
            .then(json => {
                if (json.status !== 200) throw json
                return (code) => fetch(url, {
                    method: 'POST',
                    body: JSON.stringify({code})
                }).then(response => response.json())
                    .then(json => {
                        if (json.status !== 200) throw json
                    })
            })
    }
    /**
     * 取消用户身份认证
     * @return {Promise<Response>}
     */
    this.logout = () => fetch(`${api}log-out/`, {method: 'POST'})
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
            return fetch(`${api}get-pages-view/`, {
                method: 'POST',
                body: JSON.stringify(pathname)
            })
        } else {
            const body = pathname ? {body: pathname} : {}
            return fetch(`${api}count-visit/`, Object.assign(
                {method: 'POST'}, body
            )).then(response => response.json())
                .then(json => {
                    if (json.start !== 200) throw json
                    return [json.data]
                })
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
     * @return {Promise<Response>}
     */
    this.delete = (data) => fetch(`${api}delete-comments/`, {
        method: 'POST',
        body: JSON.stringify(data)
    })
    /**
     * 隐藏指定评论，管理员与已认证用户均可使用
     * @param values {string[]} 要隐藏的评论的 ID
     * @param page {string} 评论所在页面的 pathname
     * @return {Promise<Response>}
     */
    this.hide = (values, page = location.pathname) => fetch(`${api}hide-comments/`, {
        method: 'POST',
        body: JSON.stringify({page, values})
    })
}