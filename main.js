Hooks.once('init', () => {
    console.log('%cdnd5.5-qol-features-by-antua %c| ' + 'Módulo inicializado con éxito', 'color:#4BC470', 'color:#B3B3B3');
});

// Función de diálogo con temporizador de 20 segundos
async function pedirConfirmacionReaccionEscudo(actorName) {
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

        const promptTitle = "Interponer Escudo";
        const promptContent = `
            <div style="text-align: center; padding: 4px;">
                <p><strong>${actorName}</strong> ha superado la salvación de Destreza llevando un escudo.</p>
                <p>¿Deseas gastar tu <strong>Reacción</strong> para no recibir ningún daño?</p>
                <p style="font-size: 0.85em; color: #a0a0a0; margin-top: 8px;">
                    Tiempo para responder: <strong id="escudo-timer-count" style="color: #e24f4f;">20</strong>s
                </p>
            </div>
        `;

        let timeLeft = 20;
        timer = setTimeout(() => {
            if (dlg) dlg.close();
            doResolve(false);
        }, 20000);

        interval = setInterval(() => {
            timeLeft--;
            const el = document.getElementById("escudo-timer-count");
            if (el) el.innerText = timeLeft;
            if (timeLeft <= 0) clearInterval(interval);
        }, 1000);

        const dlg = new Dialog({
            title: promptTitle,
            content: promptContent,
            buttons: {
                yes: { 
                    label: "Usar Reacción", 
                    callback: () => doResolve(true) 
                },
                no: { 
                    label: "No usar", 
                    callback: () => doResolve(false) 
                }
            },
            default: "yes",
            close: () => doResolve(false)
        });

        dlg.render(true);
    });
}

function registrarSocketAntua() {
    if (typeof socketlib === "undefined") return;

    if (!globalThis.antuaQolSocket) {
        try {
            globalThis.antuaQolSocket = socketlib.registerModule("dnd55-qol-features-by-antua");
        } catch (e) {}
    }

    if (globalThis.antuaQolSocket && !globalThis.antuaQolRegistered) {
        // 1. Registro de Desplazamiento
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

        // 2. Registro de Pregunta de Reacción (Interponer Escudo)
        globalThis.antuaQolSocket.register("pedirConfirmacionReaccionEscudo", pedirConfirmacionReaccionEscudo);

        globalThis.antuaQolRegistered = true;
        console.log("dnd55-qol-features | Sockets 'moverTokenDesplazamientoGM' y 'pedirConfirmacionReaccionEscudo' registrados.");
    }
}

Hooks.once("socketlib.ready", registrarSocketAntua);
Hooks.once("ready", registrarSocketAntua);