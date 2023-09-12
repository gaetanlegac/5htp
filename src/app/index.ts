/*----------------------------------
- DEPENDANCES
----------------------------------*/

// npm
import path from 'path';
import TsAlias from 'ts-alias';
import fs from 'fs-extra';

// Cre
import cli from '..';

// Specific
import ConfigParser from './config';
import type { TEnvConfig } from '../../../core/src/server/app/container/config';

/*----------------------------------
- TYPES
----------------------------------*/

export type TAppSide = 'server' | 'client'

/*----------------------------------
- SERVICE
----------------------------------*/
export class App {

    // config
    // WARNING: High level config files (env and services) shouldn't be loaded from the CLI
    //  The CLI will be run on CircleCI, and no env file should be sent to this service
    public identity: Config.Identity;

    public env: TEnvConfig;

    public packageJson: {[key: string]: any};

    public paths = {

        root: cli.paths.appRoot,
        src: path.join( cli.paths.appRoot, 'src'),
        bin: path.join( cli.paths.appRoot, 'bin'),
        data: path.join( cli.paths.appRoot, 'var', 'data'),
        public: path.join( cli.paths.appRoot, 'public'),
        pages: path.join( cli.paths.appRoot, 'src', 'client', 'pages'),
        cache: path.join( cli.paths.appRoot, 'src', '.cache'),

        client: {
            generated: path.join( cli.paths.appRoot, 'src', 'client', '.generated')
        },
        server: {
            generated: path.join( cli.paths.appRoot, 'src', 'server', '.generated'),
            configs: path.join( cli.paths.appRoot, 'src', 'server', 'app')
        },

        withAlias: (filename: string, side: TAppSide) => 
            this.aliases[side].apply(filename),

        withoutAlias: (filename: string, side: TAppSide) => 
            this.aliases[side].realpath(filename),
    }

    public containerServices = [
        'Services',
        'Environment',
        'Identity',
        /*'Application',
        'Path',
        'Event'*/
    ]

    public constructor() {
        
        cli.debug && console.log(`[cli] Loading app config ...`);
        const configParser = new ConfigParser( cli.paths.appRoot );
        this.identity = configParser.identity();
        this.env = configParser.env();
        this.packageJson = this.loadPkg();
        
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

    private loadPkg() {
        return fs.readJSONSync(this.paths.root + '/package.json');
    }
}

export const app = new App

export default app