// Метасимволы cmd: имя из репо иначе станет RCE при запуске
const META = /[&|<>^"`$;()\r\n\t\0]/;

/** Единственный набор метасимволов cmd. */
export const cmd = {
    /** Безопасен для spawn с shell: true. */
    allows(text: string): boolean {
        return !META.test(text);
    },
};
