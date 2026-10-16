/**
 * DnD 5.5 QoL Features by Antua (v2.1.0)
 * Archivo principal (main.js)
 */

import { inicializarListenersChat } from "./scripts/chat.js";
import { registrarSocketAntua } from "./scripts/sockets.js";
import { registrarHookReaccionesDefensivas } from "./scripts/combat.js";
import { registrarLimpiaReaccionesYBonus } from "./scripts/tokens.js";

Hooks.once("init", () => {
    console.log("%cdnd5.5-qol-features-by-antua %c| Módulo inicializado con éxito (v2.1.0)", "color:lime", "color:#B3B3B3");
});

Hooks.once("socketlib.ready", () => {
    registrarSocketAntua();
});

Hooks.on("renderChatMessageHTML", (message, html, data) => {
  // Si la lógica interna dentro del hook utiliza sintaxis de jQuery (ej: html.find()):
  const $html = $(html);
});

Hooks.once("ready", () => {
    // Asegurar registro de sockets en caso de que socketlib.ready haya cargado antes o después
    registrarSocketAntua();

    // Registrar los interceptores de Hooks para Reacciones Defensivas, Movimiento y Turnos
    registrarHookReaccionesDefensivas();

    // Registrar el limpiador de Reacciones, Acciones Adicionales y Escudos al inicio de turno
    registrarLimpiaReaccionesYBonus();
});