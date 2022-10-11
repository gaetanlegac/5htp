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
        const envFile = this.appDir + '/env' + (this.envName === undefined ? '' : '.' + this.envName) + '.yaml';
        return this.loadYaml( envFile );
    }

    public identity() {
        const identityFile = this.appDir + '/identity.yaml';
        return this.loadYaml( identityFile );
    }
}