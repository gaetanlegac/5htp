const path = require('path')
const fs = require('fs')

export default function iterateur(
    dir: string,
    func: (fichier: string, ext: string, cheminRelatif: string, dossier: string) => void,
    extensions: string[] = [],
    blacklist: string[] = [],
    func_sinon?: (fichier: string) => void,
    dir_root?: string
) {

    if (dir_root === undefined)
        dir_root = dir;

    // Lecture du contenu du dossier
    const elements = fs.readdirSync(dir);
    for (const file of elements) {

        const file_relatif = dir + '/' + file;

        // Pas dans la blacklist
        if ((!blacklist || !blacklist.includes( file ))) {

            // Récup chemin complet
            const file_complet = path.resolve(dir, file);

            // Extension sans le point
            const ext = path.extname( file ).substring(1);

            // Recup infos element
            const stat = fs.statSync(file_complet);

            // Dossier = recursion
            if (stat && stat.isDirectory())

                iterateur( file_relatif, func, extensions, blacklist, func_sinon, dir_root );

            else if (extensions.includes( ext )) {

                let chemin = file_relatif.substring(dir_root.length + 1, file_relatif.length - ext.length - 1)
                if (chemin.endsWith('/index'))
                    chemin = chemin.substring(0, chemin.length - 6);

                func( file_relatif, ext, chemin, dir );

            }

        } else if (func_sinon)
            func_sinon( file_relatif );
    };
}
