// Plugons
import MiniCssExtractPlugin from "mini-css-extract-plugin";

import type { App } from '../../../app';

module.exports = (app: App, dev: Boolean, client: boolean) => {

    return [

        // Apply PostCSS plugins including autoprefixer
        {
            loader: MiniCssExtractPlugin.loader
        },

        // Process external/third-party styles
        {
            exclude: [app.paths.root],
            loader: 'css-loader',
            options: {
                sourceMap: dev
            },
        },

        // Process internal/project styles (from root folder)
        {
            include: [app.paths.root],
            loader: 'css-loader',
            options: {
                // CSS Loader https://github.com/webpack/css-loader
                importLoaders: 1, // let postcss run on @imports
                sourceMap: dev
            },
        },

        // Postcss
        {
            loader: 'postcss-loader',
            options: {
                postcssOptions: {
                    plugins: [
                        /* Tailwind V4 */'@tailwindcss/postcss',
                        ///* Tailwind V3 */require('tailwindcss'),
                        require('autoprefixer'),
                    ],
                },
            },
        },

        {
            test: /\.less$/,
            loader: 'less-loader',
            options: {
                lessOptions: {
                    // RAPPEL: Rallonge considéralement le temps de compilation
                    // Pour math.random
                    //javascriptEnabled: true

                    // Défault = parens-division depuis 4.0.0
                    // https://lesscss.org/usage/#less-options-math
                    math: 'always',
                },
            }
        },

        /*{
            test: /\.scss/,
            loader: process.env.framework + '/node_modules/sass-loader',
        }*/
    ]

}