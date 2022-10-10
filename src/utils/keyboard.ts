/*----------------------------------
- DEPENDANCES
----------------------------------*/

// npm
import readline, { Key } from 'readline';

/*----------------------------------
- TYPES
----------------------------------*/

type TKeyboardCommand = {
    remove?: boolean,
    run: (str: string, chunk: string, key: Key) => void
}

/*----------------------------------
- METHODS
----------------------------------*/
class KeyboardCommands {

    private commands: { [input: string]: TKeyboardCommand } = {}

    public constructor() {
        this.listen();
    }

    private listen() {

        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on('keypress', async (chunk: string, key: Key) => {

            let str = key.name;
            if (!str) return;
            if (str === 'return') str = 'enter';

            if (key.ctrl) str = 'ctrl+' + str;
            if (key.shift) str = 'shift+' + str;
            if (key.meta) str = 'meta+' + str;

            const kCommand = this.commands[str] || this.commands.fallback;
            if (kCommand) {

                kCommand.run(str, chunk, key);

                if (kCommand.remove)
                    delete this.commands[str];
            }

            if (str === 'ctrl+c') {

                console.log(`Exiting ...`);
                process.exit();

            } 


        });
    }


    public input(str: string, run: TKeyboardCommand["run"], options: Omit<TKeyboardCommand, 'run'> = {}) {
        this.commands[str] = { run, ...options }
    }

    public waitForInput(str: string): Promise<void> {
        return new Promise((resolve) => {
            this.commands[str] = {
                run: () => resolve(),
                remove: true
            }
        });
    }

}

export default new KeyboardCommands