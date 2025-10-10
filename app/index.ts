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
import type { TEnvConfig } from '../../core/server/app/container/config';

/*----------------------------------
- TYPES
----------------------------------*/

export type TAppSide = 'server' | 'client'

type TServiceSetup = {
    id: string,
    name: string,
    config: {},
    subservices: TServiceSubservices,
    type: 'service.setup'
}

type TServiceRef = {
    refTo: string,
    type: 'service.ref'
}

type TServiceSubservices = {
    [key: string]: TServiceSetup | TServiceRef
}

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

    public buildId: number = Date.now();

    public paths = {

        root: cli.paths.appRoot,
        bin: path.join( cli.paths.appRoot, 'bin'),
        data: path.join( cli.paths.appRoot, 'var', 'data'),
        public: path.join( cli.paths.appRoot, 'public'),
        pages: path.join( cli.paths.appRoot, 'client', 'pages'),
        cache: path.join( cli.paths.appRoot, '.cache'),

        client: {
            generated: path.join( cli.paths.appRoot, 'client', '.generated')
        },
        server: {
            generated: path.join( cli.paths.appRoot, 'server', '.generated'),
            configs: path.join( cli.paths.appRoot, 'server', 'app')
        },
        common: {
            generated: path.join( cli.paths.appRoot, 'common', '.generated')
        },
        
        withAlias: (filename: string, side: TAppSide) => 
            this.aliases[side].apply(filename),

        withoutAlias: (filename: string, side: TAppSide) => 
            this.aliases[side].realpath(filename),
    }

    public containerServices = [
        //'Services',
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
            rootDir: this.paths.root + '/client',
            modulesDir: [ 
                cli.paths.appRoot + '/node_modules',  
                cli.paths.coreRoot + '/node_modules'
            ],
            debug: false
        }),
        server: new TsAlias({
            rootDir: this.paths.root + '/server',
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

    /*----------------------------------
    - WARMUP (Services awareness)
    ----------------------------------*/

    public registered = {}

    public use( referenceName: string ): TServiceRef {

        // We don't check because all service are not regstered when we register subservices
        /*if (this.registered[referenceName] === undefined) {
            throw new Error(`Service ${referenceName} is not registered`);
        }*/

        return {
            refTo: referenceName,
            type: 'service.ref'
        }
    }

    public setup(...args: [
        // { user: app.setup('Core/User') }
        servicePath: string,
        serviceConfig?: {},
    ] | [
        // app.setup('User', 'Core/User')
        serviceName: string, 
        servicePath: string,
        serviceConfig?: {},
    ]): TServiceSetup {

        // Registration to app root
        if (typeof args[1] === 'string') {
            
            const [name, id, config] = args;

            const service = { id, name, config, type: 'service.setup' } as TServiceSetup

            this.registered[name] = service;

            return service;

        // Scoped to a parent service
        } else {

            const [id, config] = args;

            const service = { id, config, type: 'service.setup' } as TServiceSetup

            return service;
        }
    }

    public async warmup() {

        // Require all config files in @/server/config
        const configDir = path.resolve(cli.paths.appRoot, 'server', 'config');
        const configFiles = fs.readdirSync(configDir);
        for (const configFile of configFiles) {
            console.log("Loading config file:", configFile);
            require( path.resolve(configDir, configFile) );
        }
    }
}

export const app = new App

export default app