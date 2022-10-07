/*----------------------------------
- DEPENDANCES
----------------------------------*/

// Npm
import fs from 'fs-extra';
import webfont from 'webfont';
import defaultMetadataProvider from 'svgicons2svgfont/src/metadata';

// Libs
import Indexeur from '../indexeur';
import cli from '@cli';

// Configs
const formats = ['woff2'];
const dossierIcones = cli.paths.core.src + '/client/assets/icons/';
const dossierSortie = cli.paths.app.bin + '/public/'; 

const cacheTypes = cli.paths.core.src + '/types/icons.d.ts';
const cacheIndex = dossierIcones + 'index.json';

// Types
import type { TIndexIcones } from '../../../babel/plugins/icones-svg';

/*----------------------------------
- UTILS
----------------------------------*/
const refExistant = (dir: string): string[] => {

    let filelist: string[] = [];

    let files = fs.readdirSync(dossierIcones + dir);
    for (const file of files)
        if (fs.statSync(dossierIcones + dir + file).isDirectory())
            filelist = [
                ...filelist,
                ...refExistant(dir + file + '/')
            ];
        else if (file.endsWith('.svg'))
            filelist.push(dir + file.substring(0, file.length - 4));

    return filelist;
};

/*----------------------------------
- PLUGIN
----------------------------------*/
export default class SelecteursApi extends Indexeur {

    private icones: TIndexIcones = {};
    private iconesExistantes: string[] = [];

    public constructor() {
        super();

        if (fs.existsSync(cacheIndex)) {

            console.log('[icones] Getting icons list from cache ...');
            this.iconesExistantes = fs.readJSONSync(cacheIndex);

        } else {

            console.log('[icones] Référencement des icones existantes ...');
            this.iconesExistantes = refExistant('');
            fs.outputJSONSync(cacheIndex, this.iconesExistantes);

        }

        console.log('[icones] ' + this.iconesExistantes.length + ' icones référencées');
    }

    /*----------------------------------
    - EVENTS
    ----------------------------------*/
    public Init() {

       
        
    }

    public Maj( donneesMeta: TIndexIcones, fichier: string): boolean {

        let maj = false;

        // Pour chacune d'entre elles
        for (const cheminIcone in donneesMeta) {

            // Verif si existante
            if (!this.iconesExistantes.includes( cheminIcone ))
                console.error(`L'icone ${donneesMeta[cheminIcone].nom} (${cheminIcone}) utilisée dans le fichier ${fichier} n'existe pas.`);
            // Verif si déjà référencée
            else if (this.icones[ cheminIcone ] === undefined) {
                // Sinon, référencement
                this.icones[ cheminIcone ] = donneesMeta[ cheminIcone ];

                //console.log('Nouvelle icone', donneesMeta[ cheminIcone ].nom);
                maj = true;
            }
        }

        return maj;
    }

    public async Enregistrer() {

        //return []

        let cheminIcones: {[chemin: string]: string} = {};
        let typeIcones: string[] = [];
        for (const id in this.icones) {
            const icone = this.icones[id]
            cheminIcones[ dossierIcones + icone.fichier ] = icone.id;
            typeIcones.push('"' + icone.nom + '"');
        }

        console.log('[icones] Création police avec ' + typeIcones.length +' icones ...');
        //console.log('[icones] Liste des icones rféérencées: ', cheminIcones);

        const optionsMetadata = {
            // Options par défaut de webfont
            // https://github.com/itgalaxy/webfont/blob/cc4412f0ff1f811bb7d38b5da75e128c270d4e6b/src/standalone.js#L203
            // RAPPEL: startUnicode sera incrémenté dans defaultMetadataProvider (https://github.com/nfroidure/svgicons2svgfont/blob/master/src/metadata.js#L61), 
            //          c'est pourquoi on déclare les options dans un objet
            prependUnicode: false,
            startUnicode: 0xea01
        }

        const result = await webfont({
            files: Object.keys(cheminIcones),
            fontName: "icons",
            template: dossierIcones + 'template.css',
            // @ts-ignore
            formats,
            templateClassName: 'svg',
            glyphTransformFn: (obj) => {
                
                // Nom classe css = via id
                const icone = this.icones[obj.path]
                if (icone !== undefined)
                    obj.name = icone.id;

                return obj;
            },
            // Par défaut, le nom des icones est déterminé via le nom du fichier uniquement
            // Ici, onrefixe le nom des glyphs de leur set (solid, regular) afin de pouvoir utiliser plusieurs sets pour une même icone
            // ex: solid/home et regular/home
            metadataProvider: (file, callback) => {
                
                // BUG: Quand defaultMetadataProvider est appellé manuellement, l'unicode est toujours le même peu importe l'icone
                // Incmrémenter l'unicde manuellement ? https://stackoverflow.com/questions/12504042/what-is-a-method-that-can-be-used-to-increment-letters
                defaultMetadataProvider(optionsMetadata)(file, (err, defaultMetas) => {

                    const idIcone = cheminIcones[ file ];
                    if (idIcone === undefined)
                        console.warn("Impossible de retrouver l'id de l'icone " + file);
                    else
                        defaultMetas.name = idIcone;

                    callback(err, defaultMetas);

                    optionsMetadata.startUnicode++;

                });
            }
        })
            .catch(error => {
                console.error("Erreur lors de la création de la police d'icones", error);
                throw error;
            });

        console.log('[icones] Enregistrement de la police avec ' + typeIcones.length +' icones ...');

        // Enregistrement fichiers
        for (const format of formats)
            fs.outputFileSync(dossierSortie + 'icons.' + format, result[ format ]);
        fs.outputFileSync(dossierSortie + 'icons.css', result.template);

        fs.outputFileSync(cacheTypes, 'export type TIcones = ' + typeIcones.join('|') );

        console.log("[icones] Police enregistrée.");

        return [
            /*{ 
                fichier: dossierSortie + 'index.css', 
                donnees: result.template 
            },
            ...formats.map((format) => ({
                fichier: dossierSortie + 'icones.' + format,
                donnees: result[ format ]
            }))*/
        ];
    
    }

    /*----------------------------------
    - OUTILS
    ----------------------------------*/
}