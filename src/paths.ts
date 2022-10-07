/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import path from 'path';
import moduleAlias from 'module-alias';

// Core
import TsAlias from 'ts-alias';

/*----------------------------------
- TYPES
----------------------------------*/

import type { TAppSide } from '.';

export type TPathInfos = {

    original: string,
    absolute: string,
    relative: string,
    forImport: string,

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
        public coreRoot = appRoot + '/node_modules/5-htp'
    ) {
        
    }

    public core = {
        root: this.coreRoot,
        src: this.coreRoot + '/src',
        realRoot: path.resolve(__dirname, '..'),
        pages: this.coreRoot + '/src/client/pages',
    }

    public app = {
        root: this.appRoot,
        src: this.appRoot + '/src',
        bin: this.appRoot + '/bin',
        data: this.appRoot + '/var/data',
        public: this.appRoot + '/bin/public',
        pages: this.appRoot + '/src/client/pages',
        cache: this.appRoot + '/src/.cache'
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

            forImport: this.withAlias(cheminAbsolu, side),

            name: nomReel,
            extension,
            isIndex
        }

        return retour;
    }

    public getPageChunk( file: string ) {

        const infos = this.infos( file, file.startsWith( this.app.pages ) 
            ? this.app.pages 
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

    /*----------------------------------
    - ALIAS
    ----------------------------------*/

    public aliases = {
        client: new TsAlias(this.app.root + '/src/client'),
        server: new TsAlias(this.app.root + '/src/server'),
    }

    public withAlias = (filename: string, side: TAppSide) => 
        this.aliases[side].apply(filename);

    public withoutAlias = (filename: string, side: TAppSide) => 
        this.aliases[side].realpath(filename);

    public applyAliases() {

        const aliases = new TsAlias( this.core.root + '/cli' );

        console.log('Applying Aliases ...', aliases);

        moduleAlias.addAliases( aliases.forModuleAlias() );

    }
}