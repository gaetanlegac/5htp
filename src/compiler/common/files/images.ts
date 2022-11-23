import { staticAssetName } from '../../../paths';
import type webpack from 'webpack';
import type App from '../../../app';

module.exports = (app: App, dev: boolean, client: boolean): webpack.RuleSetRule[] => {

    return [{
        test: /\.(bmp|gif|jpg|jpeg|png|ico|svg|webp)$/,
        type: 'asset',
        parser: {
            dataUrlCondition: {
                // https://webpack.js.org/guides/asset-modules/#general-asset-type
                // < 4kb = importation inline
                // > 4kb = référence à l'url
                maxSize: 4 * 1024 // 4kb
            }
        }

    }]
}
