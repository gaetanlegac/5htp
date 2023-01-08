/*----------------------------------
- DEPENDANCES
----------------------------------*/

// npm
import TsAlias from 'ts-alias';

// Cre
import cli from '..';

// Specific
import ConfigParser from './config';
import type {  } from '../../../core/src/server/app/config';

/*----------------------------------
- TYPES
----------------------------------*/

export type TAppSide = 'server' | 'client'

/*----------------------------------
- SERVICE
----------------------------------*/
export default class App {

    // config
    // WARNING: High level config files (env and services) shouldn't be loaded from the CLI
    //  The CLI will be run on CircleCI, and no env file should be sent to this service
    public identity!: Config.Identity;

    public paths = {
        root: cli.paths.appRoot,
        src: cli.paths.appRoot + '/src',
        bin: cli.paths.appRoot + '/bin',
        data: cli.paths.appRoot + '/var/data',
        public: cli.paths.appRoot + '/public',
        pages: cli.paths.appRoot + '/src/client/pages',
        cache: cli.paths.appRoot + '/src/.cache',

        withAlias: (filename: string, side: TAppSide) => 
            this.aliases[side].apply(filename),

        withoutAlias: (filename: string, side: TAppSide) => 
            this.aliases[side].realpath(filename),
    }

    public constructor() {
        
        console.log(`[cli] Loading app config ...`);
        const configParser = new ConfigParser( cli.paths.appRoot );
        this.identity = configParser.identity();
    }

    /*----------------------------------
    - ALIAS
    ----------------------------------*/

    public aliases = {
        client: new TsAlias({
            rootDir: this.paths.root + '/src/client',
            modulesDir: [ 
                cli.paths.appRoot + '/node_modules',  
                cli.paths.coreRoot + '/node_modules'
            ],
            debug: false
        }),
        server: new TsAlias({
            rootDir: this.paths.root + '/src/server',
            modulesDir: [ 
                cli.paths.appRoot + '/node_modules',  
                cli.paths.coreRoot + '/node_modules'
            ],
            debug: false
        }),
    }
}