Hooks.once('init', () => {
  //console.log("%cdnd5.5-qol-features-by-antua | Módulo inicializado con éxito", "color: red; font-size: 20px; background-color: yellow;"); 
    console.log('%cdnd5.5-qol-features-by-antua %c| ' + 'Módulo inicializado con éxito', 'color:#4BC470', 'color:#B3B3B3');
});

function registrarSocketAntua() {
    if (typeof socketlib === "undefined") return;

    if (!globalThis.antuaQolSocket) {
        try {
            globalThis.antuaQolSocket = socketlib.registerModule("dnd55-qol-features-by-antua");
        } catch (e) {}
    }

    if (globalThis.antuaQolSocket && !globalThis.antuaQolRegistered) {
        // =========================================================================
        // HOOK UNIFICADO: MOVER TOKEN (EMPUJAR / ATRAER)
        // -------------------------------------------------------------------------
        // - distanciaPies > 0 : EMPUJA (Desplaza al objetivo en dirección opuesta)
        // - distanciaPies < 0 : ATRAE  (Trae al objetivo hacia el origen)
        // =========================================================================
        globalThis.antuaQolSocket.register("moverTokenDesplazamientoGM", async (originUuid, targetUuid, distanciaPies = 5) => {
            const originDoc = await fromUuid(originUuid);
            const targetDoc = await fromUuid(targetUuid);

            if (!originDoc || !targetDoc) return;

            const originToken = originDoc.object || canvas.tokens.get(originDoc.id);
            const targetToken = targetDoc.object || canvas.tokens.get(targetDoc.id);

            if (!originToken || !targetToken) return;

            // 1. Convertir pies a casillas/píxeles
            const gridSize = canvas.grid.size;
            const feetPerGrid = canvas.grid.distance || 5;
            const casillas = distanciaPies / feetPerGrid;

            // 2. Cálculo vectorial del desplazamiento
            const originCenter = originToken.center;
            const targetCenter = targetToken.center;
            const dx = targetCenter.x - originCenter.x;
            const dy = targetCenter.y - originCenter.y;
            const distancePixels = Math.hypot(dx, dy);

            if (distancePixels === 0) return;

            // Al ser distanciaPies negativo, la multiplicación invierte el vector y atrae al objetivo
            let newCenterX = targetCenter.x + (dx / distancePixels) * (gridSize * casillas);
            let newCenterY = targetCenter.y + (dy / distancePixels) * (gridSize * casillas);

            // Evitar que al atraer el token termine solapándose sobre el atacante
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

            // 3. Comprobar Límites del Mapa
            const d = canvas.dimensions;
            if (finalX < d.sceneX || finalY < d.sceneY || (finalX + targetWidth) > (d.sceneX + d.sceneWidth) || (finalY + targetHeight) > (d.sceneY + d.sceneHeight)) {
                ui.notifications.warn(`${targetToken.name} no puede ser desplazado fuera del mapa.`);
                return;
            }

            // 4. Comprobar Colisiones con Muros
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

            // 5. Aplicar Movimiento
            if (game.user.isGM) {
                await targetDoc.update({ x: finalX, y: finalY });
                const accionTexto = distanciaPies > 0 ? "empujado" : "atraído";
                ui.notifications.info(`${targetToken.name} ha sido ${accionTexto} ${Math.abs(distanciaPies)} pies.`);
            }
        });

        globalThis.antuaQolRegistered = true;
        console.log("dnd55-qol-features | Socket 'moverTokenDesplazamientoGM' listo.");
    }
}

Hooks.once("socketlib.ready", registrarSocketAntua);
Hooks.once("ready", registrarSocketAntua);