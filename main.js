// Version: 1.1.0 - dnd55-qol-features-by-antua (Foundry V14 / DnD5e v4+)

Hooks.once('init', () => {
    console.log('%cdnd5.5-qol-features-by-antua %c| ' + 'Módulo inicializado con éxito', 'color:#4BC470', 'color:#B3B3B3');
});

// --------------------------------------------------------------------
// FUNCIONES DE DIÁLOGO, GESTIÓN DE RECURSOS Y NOTIFICACIONES DE CHAT
// --------------------------------------------------------------------

/**
 * Genera y envía una tarjeta de notificación en el chat con formato estandarizado (70x70px avatar).
 * @param {Object} data
 * @param {string} data.title - Título de la tarjeta.
 * @param {string} data.contentHtml - HTML o texto del cuerpo de la notificación.
 * @param {string} [data.icon] - Ruta de la imagen/icono.
 * @param {string} [data.actorUuid] - UUID o ID del actor origen para el speaker del mensaje.
 */
async function enviarNotificacionChatGM({ title, contentHtml, icon, actorUuid }) {
    if (!game.user.isGM) return;

    let actorDoc = null;
    if (actorUuid) {
        actorDoc = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    }

    const cardIcon = icon || actorDoc?.img || "icons/svg/mystery-man.svg";
    const cardTitle = title || "Notificación de Efecto";

    const chatContent = `
        <div class="dnd5e2 chat-card" style="position: relative; margin-top: 25px; border: 1px solid #7a200d; border-radius: 8px; background: #f8f4f1; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
            <!-- Icono superpuesto de 70x70px -->
            <div style="position: absolute; top: -20px; left: 10px; width: 70px; height: 70px; border-radius: 50%; border: 2px solid #7a200d; overflow: hidden; background: #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.3); z-index: 10;">
                <img src="${cardIcon}" style="width: 100%; height: 100%; object-fit: cover; border: none;"/>
            </div>
            
            <!-- Cabecera ajustada al margen del icono de 70px -->
            <div style="padding: 8px 12px 6px 90px; border-bottom: 1px solid rgba(122, 32, 13, 0.25); min-height: 45px; display: flex; align-items: center;">
                <h3 style="margin: 0; font-family: 'Roboto', sans-serif; font-size: 1.1em; font-weight: bold; color: #7a200d; line-height: 1.1; width: 100%;">${cardTitle}</h3>
            </div>
            
            <!-- Contenido dinámico de la tarjeta -->
            <div class="card-content" style="padding: 10px 12px 10px 14px; font-size: 0.9em; line-height: 1.5; color: #222;">
                ${contentHtml}
            </div>
        </div>
    `;

    await ChatMessage.create({
        user: game.user.id,
        speaker: actorDoc ? ChatMessage.getSpeaker({ actor: actorDoc }) : undefined,
        content: chatContent
    });
}

/**
 * Muestra un diálogo modal con temporizador en el cliente del usuario objetivo.
 */
async function pedirConfirmacionGenerica(titulo, mensajeHtml, tiempoSegundos = 20, botonConfirmarText = "Usar Reacción", botonCancelarText = "Ignorar") {
    return new Promise((resolve) => {
        let resolved = false;
        let timer = null;
        let interval = null;

        const doResolve = (val) => {
            if (resolved) return;
            resolved = true;
            if (timer) clearTimeout(timer);
            if (interval) clearInterval(interval);
            resolve(val);
        };

        let timeLeft = tiempoSegundos;
        const content = `
            <div style="text-align: center; padding: 4px;">
                ${mensajeHtml}
                ${tiempoSegundos > 0 ? `<p style="font-size: 0.85em; color: #a0a0a0; margin-top: 8px;">Tiempo restante: <strong id="antua-generic-timer" style="color: #e24f4f;">${timeLeft}</strong>s</p>` : ''}
            </div>
        `;

        if (tiempoSegundos > 0) {
            timer = setTimeout(() => {
                if (dlg) dlg.close();
                doResolve(false);
            }, tiempoSegundos * 1000);

            interval = setInterval(() => {
                timeLeft--;
                const el = document.getElementById("antua-generic-timer");
                if (el) el.innerText = timeLeft;
                if (timeLeft <= 0) clearInterval(interval);
            }, 1000);
        }

        const dlg = new Dialog({
            title: titulo,
            content: content,
            buttons: {
                yes: { 
                    icon: '<i class="fas fa-check"></i>',
                    label: botonConfirmarText, 
                    callback: () => doResolve(true) 
                },
                no: { 
                    icon: '<i class="fas fa-times"></i>',
                    label: botonCancelarText, 
                    callback: () => doResolve(false) 
                }
            },
            default: "no",
            close: () => doResolve(false)
        });

        dlg.render(true);
    });
}

/**
 * Diálogo específico para reacción de Escudo (retrocompatibilidad).
 */
async function pedirConfirmacionReaccionEscudo(actorName) {
    return pedirConfirmacionGenerica(
        "Interponer Escudo",
        `<p><strong>${actorName}</strong> ha superado la salvación de Destreza llevando un escudo.</p><p>¿Deseas gastar tu <strong>Reacción</strong> para no recibir ningún daño?</p>`,
        20,
        "Usar Reacción",
        "No usar"
    );
}

/**
 * Descuenta un uso o consumo de reacción desde el cliente GM (soporta D&D 5e v4 Actividades e Ítems legacy).
 */
async function descontarRecursosGM(actorUuid, itemUuid = null, gastarReaccion = true, activityId = null) {
    if (!game.user.isGM) return;
    const actor = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actor) return;

    if (itemUuid) {
        const item = (await fromUuid(itemUuid)) || actor.items.get(itemUuid);
        if (item) {
            let targetActId = activityId;
            if (!targetActId && item.system?.activities) {
                if (typeof item.system.activities.first === "function") {
                    targetActId = item.system.activities.first()?.id;
                } else if (Array.isArray(item.system.activities)) {
                    targetActId = item.system.activities[0]?.id || item.system.activities[0]?._id;
                } else if (typeof item.system.activities === "object") {
                    targetActId = Object.keys(item.system.activities)[0];
                }
            }

            if (targetActId && item.system?.activities) {
                const act = typeof item.system.activities.get === "function" 
                    ? item.system.activities.get(targetActId) 
                    : item.system.activities[targetActId];
                const spent = act?.uses?.spent || 0;
                await item.update({ [`system.activities.${targetActId}.uses.spent`]: spent + 1 });
            } else if (item.system?.uses) {
                const usosGastados = parseInt(item.system.uses?.spent) || 0;
                await item.update({ "system.uses.spent": usosGastados + 1 });
            }
        }
    }

    if (gastarReaccion) {
        if (typeof MidiQOL !== "undefined" && MidiQOL.setReactionUsed) {
            await MidiQOL.setReactionUsed(actor);
        }
        await actor.update({ "system.attributes.reaction": false });
    }
}

/**
 * Restaura 1 uso o carga consumida de una Actividad o Ítem.
 */
async function reponerRecursosGM(actorUuid, itemUuid = null, activityId = null) {
    if (!game.user.isGM) return;
    const actor = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actor) return;

    if (itemUuid) {
        const item = (await fromUuid(itemUuid)) || actor.items.get(itemUuid);
        if (item) {
            let targetActId = activityId;
            
            if (!targetActId && item.system?.activities) {
                if (typeof item.system.activities.first === "function") {
                    targetActId = item.system.activities.first()?.id;
                } else if (Array.isArray(item.system.activities)) {
                    targetActId = item.system.activities[0]?.id || item.system.activities[0]?._id;
                } else if (typeof item.system.activities === "object") {
                    targetActId = Object.keys(item.system.activities)[0];
                }
            }

            if (targetActId && item.system?.activities) {
                const act = typeof item.system.activities.get === "function" 
                    ? item.system.activities.get(targetActId) 
                    : item.system.activities[targetActId];
                const spent = act?.uses?.spent || 0;
                if (spent > 0) {
                    await item.update({ [`system.activities.${targetActId}.uses.spent`]: Math.max(0, spent - 1) });
                }
            } else if (item.system?.uses) {
                const spent = item.system.uses.spent || 0;
                if (spent > 0) {
                    await item.update({ "system.uses.spent": Math.max(0, spent - 1) });
                }
            }
        }
    }
}

/**
 * Mueve o actualiza un token arbitrario como GM.
 */
async function moverTokenGM({ tokenUuid, updateData }) {
    if (!game.user.isGM) return;
    const doc = await fromUuid(tokenUuid);
    if (doc) {
        return await doc.update(updateData);
    }
}

/**
 * Desplaza (empuja o atrae) un token a través del mapa validando paredes y colisiones.
 */
async function moverTokenDesplazamientoGM(originUuid, targetUuid, distanciaPies = 5) {
    if (!game.user.isGM) return;
    const originDoc = await fromUuid(originUuid);
    const targetDoc = await fromUuid(targetUuid);

    if (!originDoc || !targetDoc) return;

    const originToken = originDoc.object || canvas.tokens.get(originDoc.id);
    const targetToken = targetDoc.object || canvas.tokens.get(targetDoc.id);

    if (!originToken || !targetToken) return;

    const gridSize = canvas.grid.size;
    const feetPerGrid = canvas.grid.distance || 5;
    const casillas = distanciaPies / feetPerGrid;

    const originCenter = originToken.center;
    const targetCenter = targetToken.center;
    const dx = targetCenter.x - originCenter.x;
    const dy = targetCenter.y - originCenter.y;
    const distancePixels = Math.hypot(dx, dy);

    if (distancePixels === 0) return;

    let newCenterX = targetCenter.x + (dx / distancePixels) * (gridSize * casillas);
    let newCenterY = targetCenter.y + (dy / distancePixels) * (gridSize * casillas);

    if (distanciaPies < 0) {
        const minDistance = (originToken.w / 2) + (targetToken.w / 2);
        const newDist = Math.hypot(newCenterX - originCenter.x, newCenterY - originCenter.y);
        if (newDist < minDistance) {
            newCenterX = originCenter.x + (dx / distancePixels) * minDistance;
            newCenterY = originCenter.y + (dy / distancePixels) * minDistance;
        }
    }

    const targetWidth = targetDoc.width * gridSize;
    const targetHeight = targetDoc.height * gridSize;

    const rawTopLeftX = newCenterX - targetWidth / 2;
    const rawTopLeftY = newCenterY - targetHeight / 2;

    const finalX = Math.round(rawTopLeftX / gridSize) * gridSize;
    const finalY = Math.round(rawTopLeftY / gridSize) * gridSize;
    const finalCenterX = finalX + targetWidth / 2;
    const finalCenterY = finalY + targetHeight / 2;

    const d = canvas.dimensions;
    if (finalX < d.sceneX || finalY < d.sceneY || (finalX + targetWidth) > (d.sceneX + d.sceneWidth) || (finalY + targetHeight) > (d.sceneY + d.sceneHeight)) {
        ui.notifications.warn(`${targetToken.name} no puede ser desplazado fuera del mapa.`);
        return;
    }

    let hasWallCollision = false;
    if (typeof targetToken.checkCollision === "function") {
        hasWallCollision = targetToken.checkCollision({ x: finalCenterX, y: finalCenterY }, { type: "move", mode: "any" });
    } else if (typeof canvas.walls.testCollision === "function") {
        const offset = gridSize * 0.25;
        const testPoints = [
            { origin: { x: targetCenter.x, y: targetCenter.y }, dest: { x: finalCenterX, y: finalCenterY } },
            { origin: { x: targetCenter.x - offset, y: targetCenter.y - offset }, dest: { x: finalCenterX - offset, y: finalCenterY - offset } },
            { origin: { x: targetCenter.x + offset, y: targetCenter.y - offset }, dest: { x: finalCenterX + offset, y: finalCenterY - offset } },
            { origin: { x: targetCenter.x - offset, y: targetCenter.y + offset }, dest: { x: finalCenterX - offset, y: finalCenterY + offset } },
            { origin: { x: targetCenter.x + offset, y: targetCenter.y + offset }, dest: { x: finalCenterX + offset, y: finalCenterY + offset } }
        ];

        let collisionCount = 0;
        for (const pt of testPoints) {
            const ray = new Ray(pt.origin, pt.dest);
            if (canvas.walls.testCollision(ray, { mode: "any", type: "move" })) {
                collisionCount++;
            }
        }
        hasWallCollision = collisionCount >= 3;
    }

    if (hasWallCollision) {
        ui.notifications.warn(`${targetToken.name} se choca contra una pared y no puede ser desplazado.`);
        return;
    }

    await targetDoc.update({ x: finalX, y: finalY });
    const accionTexto = distanciaPies > 0 ? "empujado" : "atraído";
    ui.notifications.info(`${targetToken.name} ha sido ${accionTexto} ${Math.abs(distanciaPies)} pies.`);
}

/**
 * Intercambia las iniciativas de dos contendientes en el combate actual.
 */
async function intercambiarIniciativaGM(data) {
    if (!game.user.isGM) return;
    const combat = game.combats.get(data.combatId);
    if (!combat) return;

    await combat.updateEmbeddedDocuments("Combatant", [
        { _id: data.combatantId1, initiative: data.init1 },
        { _id: data.combatantId2, initiative: data.init2 }
    ]);

    ChatMessage.create({
        content: `<strong>${data.actorName1}</strong> y <strong>${data.actorName2}</strong> han intercambiado sus posiciones de iniciativa (${data.origInit1} ↔ ${data.origInit2}).`
    });
}

// --------------------------------------------------------------------
// REGISTRO DE SOCKETS (socketlib)
// --------------------------------------------------------------------

function registrarSocketAntua() {
    if (typeof socketlib === "undefined") return;

    if (!globalThis.antuaQolSocket) {
        try {
            globalThis.antuaQolSocket = socketlib.registerModule("dnd55-qol-features-by-antua");
        } catch (e) {}
    }

    if (globalThis.antuaQolSocket && !globalThis.antuaQolRegistered) {
        globalThis.antuaQolSocket.register("pedirConfirmacionReaccionEscudo", pedirConfirmacionReaccionEscudo);
        globalThis.antuaQolSocket.register("pedirConfirmacionGenerica", pedirConfirmacionGenerica);
        globalThis.antuaQolSocket.register("descontarRecursosGM", descontarRecursosGM);
        globalThis.antuaQolSocket.register("reponerRecursosGM", reponerRecursosGM);
        globalThis.antuaQolSocket.register("moverTokenGM", moverTokenGM);
        globalThis.antuaQolSocket.register("moverTokenDesplazamientoGM", moverTokenDesplazamientoGM);
        globalThis.antuaQolSocket.register("intercambiarIniciativaGM", intercambiarIniciativaGM);
        globalThis.antuaQolSocket.register("enviarNotificacionChatGM", enviarNotificacionChatGM);

        globalThis.antuaQolRegistered = true;
        console.log("dnd55-qol-features | Sockets registrados correctamente ('pedirConfirmacionGenerica', 'descontarRecursosGM', 'reponerRecursosGM', 'moverTokenGM', 'moverTokenDesplazamientoGM', 'intercambiarIniciativaGM', 'enviarNotificacionChatGM').");
    }
}

Hooks.once("socketlib.ready", registrarSocketAntua);
Hooks.once("ready", registrarSocketAntua);