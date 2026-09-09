Hooks.once('init', () => {
    console.log('%cdnd5.5-qol-features-by-antua %c| ' + 'Módulo inicializado con éxito', 'color:#4BC470', 'color:#B3B3B3');
});

// --------------------------------------------------------------------
// FUNCIONES DE DIÁLOGO
// --------------------------------------------------------------------

// 1. Diálogo de confirmación genérico reutilizable desde cualquier macro
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
        let content = `
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

// 2. Diálogo de escudo (mantenido para no romper retrocompatibilidad)
async function pedirConfirmacionReaccionEscudo(actorName) {
    return pedirConfirmacionGenerica(
        "Interponer Escudo",
        `<p><strong>${actorName}</strong> ha superado la salvación de Destreza llevando un escudo.</p><p>¿Deseas gastar tu <strong>Reacción</strong> para no recibir ningún daño?</p>`,
        20,
        "Usar Reacción",
        "No usar"
    );
}

// Función de gestión de recursos ejecutada de forma remota con privilegios de GM
async function descontarRecursosGM(actorUuid, itemUuid = null, gastarReaccion = true) {
    if (!game.user.isGM) return;
    const actor = await fromUuid(actorUuid);
    if (!actor) return;

    // 1. Descontar uso del ítem si se proporciona el UUID
    if (itemUuid) {
        const item = await fromUuid(itemUuid);
        if (item) {
            const usosGastados = parseInt(item.system.uses?.spent) || 0;
            await item.update({ "system.uses.spent": usosGastados + 1 });
        }
    }

    // 2. Marcar la Reacción como gastada (Midi-QOL + Sistema D&D5e)
    if (gastarReaccion) {
        if (typeof MidiQOL !== "undefined" && MidiQOL.setReactionUsed) {
            await MidiQOL.setReactionUsed(actor);
        }
        await actor.update({ "system.attributes.reaction": false });
    }
}

// --------------------------------------------------------------------
// REGISTRO DE SOCKETS
// --------------------------------------------------------------------

function registrarSocketAntua() {
    if (typeof socketlib === "undefined") return;

    if (!globalThis.antuaQolSocket) {
        try {
            globalThis.antuaQolSocket = socketlib.registerModule("dnd55-qol-features-by-antua");
        } catch (e) {}
    }

    if (globalThis.antuaQolSocket && !globalThis.antuaQolRegistered) {
        // Registro de Mover Token
        globalThis.antuaQolSocket.register("moverTokenDesplazamientoGM", async (originUuid, targetUuid, distanciaPies = 5) => {
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

            if (game.user.isGM) {
                await targetDoc.update({ x: finalX, y: finalY });
                const accionTexto = distanciaPies > 0 ? "empujado" : "atraído";
                ui.notifications.info(`${targetToken.name} ha sido ${accionTexto} ${Math.abs(distanciaPies)} pies.`);
            }
        });

        // Registro de Sockets de Diálogo y Recursos
        globalThis.antuaQolSocket.register("pedirConfirmacionReaccionEscudo", pedirConfirmacionReaccionEscudo);
        globalThis.antuaQolSocket.register("pedirConfirmacionGenerica", pedirConfirmacionGenerica);
        globalThis.antuaQolSocket.register("descontarRecursosGM", descontarRecursosGM);

        globalThis.antuaQolRegistered = true;
        console.log("dnd55-qol-features | Sockets 'moverTokenDesplazamientoGM', 'pedirConfirmacionGenerica' y 'descontarRecursosGM' registrados.");
    }
}

Hooks.once("socketlib.ready", registrarSocketAntua);
Hooks.once("ready", registrarSocketAntua);