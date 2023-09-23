import html from 'rollup-plugin-html'
import resolve from '@rollup/plugin-node-resolve'
import serve from 'rollup-plugin-serve'
import postcss from 'rollup-plugin-postcss'
import postcssImport from 'postcss-import'

// noinspection JSUnusedGlobalSymbols
export default {
    input: 'src/broswer/index.js',
    output: {
        file: 'dist/main.js',
        format: 'iife',
        name: 'Kments'
    },
    plugins: [
        resolve(),
        html({
            include: 'src/resources/*.html'
        }),
        postcss({
            extract: true,
            plugins: [postcssImport()]
        }),
        serve({
            open: false,
            contentBase: 'dist',
            historyApiFallback: './src/resources/test.html',
            host: 'localhost',
            port: 4000
        })
    ]
}