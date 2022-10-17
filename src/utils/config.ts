/*----------------------------------
- DEPENDANCES
----------------------------------*/

/*
    NOTE: This is a copy of core/sever/app/config
    We can't import core deps here because it will cause the following error:
        "Can't use import when not a module"
    It will be possible to import core files when the CLI will be compiled as one output file with tsc
    And for that, we need to fix the TS errors for the CLI
*/

// Npm
import fs from 'fs-extra';
import yaml from 'yaml';

/*----------------------------------
- LOADE
----------------------------------*/
export default class ConfigParser {

    public constructor(
        public appDir: string,
        public envName?: string
    ) {

    }

    private loadYaml( filepath: string ) {
        console.info(`Loading config ${filepath}`);
        const rawConfig = fs.readFileSync(filepath, 'utf-8');
        return yaml.parse(rawConfig);
    }

    public env() {
        // We assume that when we run 5htp dev, we're in local
        // Otherwise, we're in production environment (docker)
        console.log("Using environment:", process.env.NODE_ENV);
        return process.env.NODE_ENV === 'development' ? {
            name: 'local',
            profile: 'dev',
            level: 'silly',
        
            localIP: '86.76.176.80',
            domain: 'localhost:3010',
            url: 'http://localhost:3010',
        } : {
            name: 'server',
            profile: 'prod',
            level: 'silly',
        
            localIP: '86.76.176.80',
            domain: 'megacharger.io',
            url: 'https://megacharger.io',
        }
    }

    public identity() {
        const identityFile = this.appDir + '/identity.yaml';
        return this.loadYaml( identityFile );
    }
}