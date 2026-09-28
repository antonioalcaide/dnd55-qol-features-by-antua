/**
 * DnD 5.5 QoL Features by Antua (v1.9.1)
 * Archivo principal (main.js)
 */

import { inicializarListenersChat } from "./scripts/chat.js";
import { registrarSocketAntua } from "./scripts/sockets.js";
import { registrarHookReaccionesDefensivas } from "./scripts/combat.js";

Hooks.once("init", () => {
    console.log("%cdnd5.5-qol-features-by-antua %c| Módulo inicializado con éxito (v1.9.1)", "color:lime", "color:#B3B3B3");
});

Hooks.once("socketlib.ready", registrarSocketAntua);
Hooks.once("ready", registrarSocketAntua);

Hooks.on("renderChatMessage", (message, html) => {
    inicializarListenersChat(message, html);
});

Hooks.once("ready", () => {
    if (game.modules.get("midi-qol")?.active) {
        registrarHookReaccionesDefensivas();
    }
});