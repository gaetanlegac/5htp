/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import path from 'path';
import filesize from 'filesize';
import dayjs from 'dayjs';
import yaml from 'yaml';

// Core
import cli from '../..';
import { api } from '../utils';

/*----------------------------------
- COMMAND
----------------------------------*/
export async function run() {

    const { project, local } = cli.args;

    const versionfile = fs.readFileSync( project + '/version.txt', 'utf-8' );

    const [platform, version, build] = versionfile.split('\n');

    console.log({ project, platform, version, build });
    
    await cli.shell(
        api('POST', '/app/release', { platform, version, build }, local)
    );
    
}