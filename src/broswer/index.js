import Kments from './dom-api'
import {createEditor, createToolbar} from '@wangeditor/editor'
import frameHtml from '.././resources/frame.html'
import richTextEditor from '.././resources/richTextEditor.html'
import '.././resources/index.css'

// noinspection JSUnusedGlobalSymbols
/**
 * @param containerId {string} 评论容器的 ID
 * @param api {string} API 地址（附带协议名称和尾斜杠）
 * @param nameGetter {function():string} 获取用户名称
 * @param emailGetter {function():string} 获取用户邮箱
 * @param linkGetter {function():string} 获取用户主页
 * @constructor
 */
export default function (containerId, api, nameGetter, emailGetter, linkGetter) {
    const container = document.getElementById(containerId)
    if (!container) throw 'Element absent'
    const kments = new Kments(api, nameGetter, emailGetter, linkGetter)
    let editor, toolbar

    /** 初始化基础框架的 HTML 内容 */
    this.initFrameHtml = () => container.insertAdjacentHTML('afterbegin', frameHtml)

    /**
     * 初始化评论编辑器
     * @param placeholder 编辑器中默认显示的内容
     * @param editorMode {'default'|'simple'} 编辑器模式
     * @param toolbarMode {'default'|'simple'} 工具栏模式
     */
    this.initEditor = (placeholder, editorMode, toolbarMode) => {
        container.getElementsByClassName('editor')[0].insertAdjacentHTML('beforeend', richTextEditor)
        editor = createEditor({
            selector: '#editor-container',
            html: '<p><br/></p>',
            mode: editorMode,
            config: {placeholder}
        })
        toolbar = createToolbar({
            editor,
            selector: '#toolbar-container',
            config: {},
            mode: toolbarMode
        })
    }
}