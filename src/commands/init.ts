/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import path from 'path';
import prompts from 'prompts';
import cmd from 'node-cmd';
import replaceOnce from 'replace-once';

// Cor elibs
import cli from '../';

// Configs
const filesToConfig = [
    'package.json',
    'identity.yaml'
]

/*----------------------------------
- COMMANDE
----------------------------------*/
export const run = () => new Promise<void>(async () => {
    
    const config = await prompts([{
        type: 'text', name: 'name',
        message: 'Project name ?',
        initial: "MyProject",
        validate: value => /[a-z0-9\-\.]/i.test(value) || "Must only include alphanumeric characters, and - . "
    },{
        type: 'text', name: 'dirname',
        message: 'Folder name ?',
        initial: value => value.toLowerCase(),
        validate: value => /[a-z0-9\-\.]/.test(value) || "Must only include lowercase alphanumeric characters, and - . "
    },{
        type: 'text', name: 'description',
        message: 'Briefly describe your project to your mom:',
        initial: "It will revolutionnize the world",
        validate: value => /[a-z0-9\-\. ]/i.test(value) || "Must only include alphanumeric characters, and - . "
    },{
        type: 'toggle', name: 'microservice',
        message: 'Separate API from the UI servers ?'
    }]);

    const placeholders = {
        PROJECT_NAME: config.name,
        PACKAGE_NAME: config.name.toLowerCase(),
        PROJECT_DESCRIPTION: config.description
    }

    const paths = {
        skeleton: path.join( cli.paths.core.cli, 'skeleton'),
        project: path.join( process.cwd(), config.dirname)
    }

    // Copy skeleton to cwd/<project-name>
    console.info("Creating project skeleton ...");
    fs.copySync( paths.skeleton, paths.project );
    
    // Replace placeholders
    console.info("Configuring project ...");
    for (const file of filesToConfig) {
        console.log('- ' + file);

        const filepath = path.join( paths.project, file )
        const content = fs.readFileSync(filepath, 'utf-8');

        const placeholders_keys = Object.keys(placeholders).map(k => '{{ ' + k + ' }}')
        const values = Object.values(placeholders);

        fs.writeFileSync(filepath, 
            replaceOnce(content, placeholders_keys, values)    
        );
    }

    // Npm install
    console.info("Installing packages ...");
    cmd.runSync(`cd "${paths.project}" && npm i`);

    // Run demo app
    /*console.info("Run demo ...");
    await cli.shell('5htp dev');*/

});