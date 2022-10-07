import { staticAssetName } from '../../../paths';

module.exports = (dev: boolean, client: boolean) => ([

    // Allow to use ?raw at the end of the module path to iport the raw content only
    // Example: import VisualParserSource from './Parsers/visual.js?raw';
    {
        resourceQuery: /raw/,
        type: 'asset/source',
    },

    // Client uniquement: Retourne le fichier correspondant au fichier dans le dossier public
    {
        test: /\.(xml|ico|wav|mp3)$/,
        //loader: 'file-loader',
        type: 'asset/resource',
        generator: {
            filename: staticAssetName
        }
    },

    // Texte brut
    {
        type: 'asset/source',
        test: /\.(md|hbs|sql|txt|csv)$/,
    },

    // Polices dans un fichier distinc dans le dossier dédié
    {
        test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
        //loader: 'file-loader',
        type: 'asset/resource',
        generator: {
            filename: 'fonts/[name].[ext]'
        }
    }
])
