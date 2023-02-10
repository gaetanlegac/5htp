/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import TsAlias from 'ts-alias';
import moduleAlias from 'module-alias';
import { filenameToImportName } from 'babel-plugin-glob-import';

// Core

/*----------------------------------
- TYPES
----------------------------------*/

import type App from './app';
import type { TAppSide } from './app';

export type TPathInfosOptions = {
    basePath?: string,
    shortenExtensions: string[],
    // Indexed will be trimed only when the extension can be shorten
    trimIndex: boolean,
}

export type TPathInfos = {

    original: string,
    absolute: string,
    relative: string,
    //forImport: string,

    name: string,
    extension: string,
    isIndex: boolean
}

/*----------------------------------
- CONFIG
----------------------------------*/

export const staticAssetName = /*isDebug ? '[name].[ext].[hash:8]' :*/ '[hash:8][ext]';

const pathInfosDefaultOpts = {
    shortenExtensions: ['ts', 'js', 'tsx', 'jsx'],
    trimIndex: true,
}

/*----------------------------------
- LIB
----------------------------------*/
export default class Paths {

    /*----------------------------------
    - LISTE
    ----------------------------------*/

    public constructor( 
        public appRoot: string,
        public coreRoot = appRoot + '/node_modules/5htp-core'
    ) {
        
    }

    public core = {
        cli: path.resolve(__dirname, '..'),
        root: this.coreRoot,
        src: this.coreRoot + '/src',
        pages: this.coreRoot + '/src/client/pages',
    }

    /*----------------------------------
    - EXTRACTION
    ----------------------------------*/

    public infos(filename: string, givenOpts: Partial<TPathInfosOptions> = {}): TPathInfos {

        const opts: TPathInfosOptions = { ...pathInfosDefaultOpts, ...givenOpts }

        // Extraction élements du chemin
        const decomp = filename.split('/')
        let [nomFichier, extension] = (decomp.pop() as string).split('.');
        const shortenExtension = opts.shortenExtensions && opts.shortenExtensions.includes(extension);

        // Vire l'index
        const isIndex = nomFichier === 'index'
        let cheminAbsolu: string;
        let nomReel: string;
        if (isIndex && shortenExtension && opts.trimIndex) {
            cheminAbsolu = decomp.join('/');
            nomReel = decomp.pop() as string;
        } else {
            cheminAbsolu = [...decomp, nomFichier].join('/')
            nomReel = nomFichier
        }

        // Conserve l'extension si nécessaire
        if (!shortenExtension)
            cheminAbsolu += '.' + extension;

        const relative = opts.basePath === undefined 
            ? ''
            : cheminAbsolu.substring( opts.basePath.length + 1 )

        // Retour
        const retour = {

            original: filename,
            absolute: cheminAbsolu,
            relative,

            // Not used anymore, but can be useful in the future
            //forImport: this.withAlias(cheminAbsolu, side),

            name: nomReel,
            extension,
            isIndex
        }

        return retour;
    }

    public getPageChunk( app: App, file: string ) {

        const infos = this.infos( file, {
            basePath: file.startsWith( app.paths.pages ) ? app.paths.pages : this.core.pages,
            // Avoid potential conflicts between /landing.tsx and /landing/index.tsx
            trimIndex: false,
        });

        const filepath = infos.relative;

        // Before:  /home/.../src/client/pages/landing/index.tsx
        // After:   landing
        let chunkId = filenameToImportName(filepath);

        // nsure it's non-empty
        if (chunkId.length === 0) // = /index.tsx
            chunkId = "main";

        return { filepath, chunkId }

    }

    public applyAliases() {

        const aliases = new TsAlias({
            rootDir: this.core.cli
        });

        //console.log('Applying Aliases ...', aliases);
        moduleAlias.addAliases( aliases.forModuleAlias() );

    }
}