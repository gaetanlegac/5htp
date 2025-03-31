// Npm
import favicons from 'favicons';
import fs from 'fs-extra';

// Libs
import cli from '../..';

// Type
import type App from '../../app';

export default async ( app: App ) => {

    const dossierCache = app.paths.root + '/public/app';

    if (!fs.existsSync(dossierCache)) {

        console.info(`Generating identity assets ...`);
        fs.emptyDirSync(dossierCache);

        const identity = app.identity;

        const response = await favicons( app.paths.root + '/client/assets/identity/logo.svg', {

            path: '/assets/img/identite/favicons/',
            appName: identity.name,
            appShortName: identity.name,
            appDescription: identity.description,
            developerName: identity.author.name,
            developerURL: identity.author.url,
            dir: "auto",
            lang: identity.language,
            background: "#fff",
            theme_color: identity.maincolor,
            appleStatusBarStyle: "default",
            display: "standalone",
            orientation: "any",
            //scope: "/",
            start_url: "/",
            version: identity.web.version,
            logging: false,
            pixel_art: false,
            icons: {
                android: true,
                appleIcon: true,
                appleStartup: false,
                coast: false,
                favicons: true,
                firefox: true,
                windows: true,
                yandex: false
            }

        });

        await Promise.all([

            // Enregistrement images
            ...response.images.map((image) => {
                let destimg = dossierCache + '/' + image.name;
                return fs.writeFile(destimg, image.contents);
            }),

            // Enregistrement fichiers
            ...response.files.map((fichier) => {
                let destfichier = dossierCache + '/' + fichier.name;
                return fs.writeFile(destfichier, fichier.contents);
            })

        ]);
    }

}
