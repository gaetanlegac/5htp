import Indexeur from './indexeur';

import { Compiler } from 'webpack';

type TListeIndexeurs = {[nom: string]: Indexeur}

export default class SelecteursApiPlugin {

    public static metadataContextFunctionName = "metadataSelecteursApiPlugin";

    private indexeurs: TListeIndexeurs;

    public constructor(config: TListeIndexeurs) {

        this.indexeurs = config;

    }

    apply(compiler: Compiler) {

        const nomCompileur = compiler.options.name;

        for (const nomIndexeur in this.indexeurs) {
            console.log(`[indexage][${nomCompileur}][${nomIndexeur}] Init`);
            this.indexeurs[nomIndexeur].Init();
        }

        compiler.hooks.compilation.tap("SelecteursApiPlugin", (compilation) => {
            //console.log("The compiler is starting a new compilation...");

            compilation.hooks.normalModuleLoader.tap("SelecteursApiPlugin", (context, module) => {

                // Fonction de récupération des métadatas
                context["metadataSelecteursApiPlugin"] = (metadata) => {

                    //console.log(`[selecteurs-api] Meta reçues ` +  module.resource, metadata);

                    for (const nomIndexeur in this.indexeurs)
                        if (metadata[nomIndexeur] !== undefined) {

                            const majOk = this.indexeurs[nomIndexeur].Maj(metadata[nomIndexeur], module.resource);

                            if (majOk) {

                                /*if (this.indexeurs[ nomIndexeur ].compile[ module.resource ] !== undefined) {
                                    console.log(`[indexage][${nomCompileur}][${nomIndexeur}] Màj via le fichier ${module.resource}`);
                                }*/

                                this.indexeurs[nomIndexeur].compile[module.resource] = true;
                                this.indexeurs[nomIndexeur].derniereModif = new Date().getTime();
                            }

                        }
                }

            })
        })

        // A partir de finishModules, webpack n'accepte plus les modifs de modules
        // https://webpack.js.org/api/compilation-hooks/#seal
        // https://github.com/webpack/webpack/issues/8830
        compiler.hooks.thisCompilation.tap("SelecteursApiPlugin", (compilation) => {
            compilation.hooks.finishModules.tapAsync("SelecteursApiPlugin", async (modules, callback) => {

                for (const nomIndexeur in this.indexeurs) {
                    try {
                        if (this.indexeurs[nomIndexeur].derniereModif > this.indexeurs[nomIndexeur].derniereMaj) {

                            console.log(`[indexage][${nomCompileur}][${nomIndexeur}] Enregistrement des modifications`);

                            this.indexeurs[nomIndexeur].derniereMaj = this.indexeurs[nomIndexeur].derniereModif;
                            const aEnregistrer = await this.indexeurs[nomIndexeur].Enregistrer();
                            /*for (const { fichier, donnees } of aEnregistrer) {

                                console.info("TODO: indexag weback")


                                 TODO:
                                const moduleAmaj = Array.from(modules).find(
                                    // m.id peut êtreun nombre ou null. Pour rechercher via le chemin, m.resource
                                    (m) => m.resource && m.resource.endsWith(fichier)
                                );

                                if (!moduleAmaj) {
                                    console.warn(`[indexage][${nomCompileur}][${nomIndexeur}]  Impossible de retrouver le module correspondant au fichier ${fichier}`);
                                    continue;
                                }

                                console.log(`[indexage][${nomCompileur}][${nomIndexeur}] Màj & recompilation du module ${moduleAmaj.resource} ...`);

                                moduleAmaj._source._value = donnees;

                                // Recompile immédiatement et sans devoir changer le fichier
                                moduleAmaj.parser.parse(
                                    moduleAmaj._source.source(),
                                    {
                                        current: moduleAmaj,
                                        module: moduleAmaj,
                                        compilation: compilation,
                                        options: compilation.options
                                    }
                                );

                                // ALTERNATIVE: Rien ne se passe
                                //compiler.hooks.invalid.call(moduleAmaj.resource, Date.now());
                                compilation.rebuildModule( moduleAmaj, (e) => {

                                    if (e) console.error(e);
                                    else {

                                        callback();

                                    }

                                });

                            }*/
                        }
                    } catch (e) {

                        console.error(`Erreur lors de l'enregistrement des sélecteurs api: `, e);
                        throw e;

                    }
                }

                callback();

            });
        });
    }
}
