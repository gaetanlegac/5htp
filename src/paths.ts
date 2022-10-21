/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import TsAlias from 'ts-alias';
import moduleAlias from 'module-alias';

// Core

/*----------------------------------
- TYPES
----------------------------------*/

import type App from './app';
import type { TAppSide } from './app';

export type TPathInfos = {

    original: string,
    absolute: string,
    relative: string,
    //forImport: string,

    name: string,
    extension: string,
    isIndex: boolean
}

export const staticAssetName = /*isDebug ? '[name].[ext].[hash:8]' :*/ '[hash:8][ext]';

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

    public infos(filename: string, basePath?: string, side: TAppSide = 'server'): TPathInfos {

        // Extraction élements du chemin
        const decomp = filename.split('/')
        let [nomFichier, extension] = (decomp.pop() as string).split('.');
        const raccourcir = ['ts', 'js', 'tsx', 'jsx'].includes(extension);

        // Vire l'index
        const isIndex = nomFichier === 'index'
        let cheminAbsolu: string;
        let nomReel: string;
        if (isIndex && raccourcir) {
            cheminAbsolu = decomp.join('/');
            nomReel = decomp.pop() as string;
        } else {
            cheminAbsolu = [...decomp, nomFichier].join('/')
            nomReel = nomFichier
        }

        // Conserve l'extension si nécessaire
        if (!raccourcir)
            cheminAbsolu += '.' + extension;

        const relative = basePath === undefined 
            ? ''
            : cheminAbsolu.substring( basePath.length + 1 )

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

        const infos = this.infos( file, file.startsWith( app.paths.pages ) 
            ? app.paths.pages 
            : this.core.pages,
        );

        const filepath = infos.relative;

        // Before:  /home/.../src/client/pages/landing/index.tsx
        // After:   landing_index
        let chunkId = filepath.replace(/\//g, '_');

        // nsure it's non-empty
        if (chunkId.length === 0) // = /index.tsx
            chunkId = "main";

        return { filepath, chunkId }

    }

    public applyAliases() {

        const aliases = new TsAlias( this.core.cli );

        console.log('Applying Aliases ...', aliases);

        moduleAlias.addAliases( aliases.forModuleAlias() );

    }
}