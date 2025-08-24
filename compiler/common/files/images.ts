import { staticAssetName } from '../../../paths';
import type webpack from 'webpack';

module.exports = (app: App, dev: boolean, client: boolean): webpack.RuleSetRule[] => {

    return [{
        test: /\.(bmp|gif|png|jpg|jpegico|svg|webp)$/,
        type: 'asset',
        parser: {
            dataUrlCondition: {
                // https://webpack.js.org/guides/asset-modules/#general-asset-type
                // < 4kb = importation inline
                // > 4kb = référence à l'url
                maxSize: 4 * 1024 // 4kb
            }
        }

    }, {
        test: /\.(jpg|jpeg|png)$/i,
        type: "javascript/auto",
        use: [{
            loader: "responsive-loader",
            options: {
                sizes: [320, 480, 640, 768, 1024, 1300],
                placeholder: true,
                placeholderSize: 20,
                quality: 100,
                publicPath: '/public'
            }
        }]
      }, {
        test: /\.(webm|mp4|avi|mpk|mov|mkv)$/,
        type: 'asset/resource',
    },]
}
