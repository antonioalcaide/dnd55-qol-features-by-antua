/**
 * scripts/tokens.js
 * Movimiento, desplazamiento, iniciativa y división de actores/tokens en Canvas.
 */

export async function moverTokenGM({ tokenUuid, updateData }) {
    if (!game.user.isGM) return;
    const doc = await fromUuid(tokenUuid);
    if (doc) {
        return await doc.update(updateData);
    }
}

export async function moverTokenDesplazamientoGM(originUuid, targetUuid, distanciaPies = 5) {
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

export async function intercambiarIniciativaGM(data) {
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

export async function dividirActorGM({ targetTokenUuid, newHp, newSize, tokenDimensions }) {
    const DEBUG = true;
    const LOG_PREFIX = "%c[dnd55-qol-features-by-antua | dividirActorGM]";
    const LOG_STYLE = "background: #111; color: #00ffcc; font-weight: bold;";

    const targetTokenDoc = await fromUuid(targetTokenUuid);
    if (!targetTokenDoc) {
        if (DEBUG) console.error(`${LOG_PREFIX} No se pudo obtener el Documento de Token desde UUID: ${targetTokenUuid}`, LOG_STYLE);
        return;
    }

    const targetActor = targetTokenDoc.actor;
    if (!targetActor) return;

    await targetTokenDoc.actor.update({
        "system.attributes.hp.value": newHp,
        "system.attributes.hp.max": newHp,
        "system.traits.size": newSize
    });

    await targetTokenDoc.update({
        width: tokenDimensions.width,
        height: tokenDimensions.height
    });

    const gridSize = canvas.grid.size || 100;
    const originX = targetTokenDoc.x;
    const originY = targetTokenDoc.y;
    const originToken = targetTokenDoc.object || canvas.tokens.get(targetTokenDoc.id);

    const searchOffsets = [
        { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
        { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
        { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 0, y: -2 }
    ];

    let spawnX = originX + gridSize;
    let spawnY = originY;

    for (const offset of searchOffsets) {
        const testX = originX + (offset.x * gridSize);
        const testY = originY + (offset.y * gridSize);

        const occupied = canvas.tokens.placeables.some(t => 
            t.id !== targetTokenDoc.id && 
            Math.abs(t.x - testX) < gridSize / 2 && 
            Math.abs(t.y - testY) < gridSize / 2
        );

        let wallCollision = false;
        const testPoint = { x: testX + (gridSize * tokenDimensions.width) / 2, y: testY + (gridSize * tokenDimensions.height) / 2 };

        if (originToken && typeof originToken.checkCollision === "function") {
            wallCollision = originToken.checkCollision(testPoint, { type: "move", mode: "any" });
        } else {
            const RayClass = foundry.canvas?.geometry?.Ray || globalThis.Ray;
            const ray = new RayClass(
                { x: originX + gridSize / 2, y: originY + gridSize / 2 },
                testPoint
            );
            const backend = CONFIG.Canvas.polygonBackends?.move;
            if (backend && typeof backend.testCollision === "function") {
                wallCollision = backend.testCollision(ray.A, ray.B, { type: "move", mode: "any" });
            }
        }

        if (!occupied && !wallCollision) {
            spawnX = testX;
            spawnY = testY;
            if (DEBUG) console.log(`${LOG_PREFIX} Casilla despejada encontrada en offset (${offset.x}, ${offset.y})`, LOG_STYLE);
            break;
        }
    }

    const tokenData = targetTokenDoc.toObject();
    delete tokenData._id;

    tokenData.x = spawnX;
    tokenData.y = spawnY;
    tokenData.width = tokenDimensions.width;
    tokenData.height = tokenDimensions.height;

    if (tokenData.delta?.system?.attributes?.hp) {
        tokenData.delta.system.attributes.hp.value = newHp;
        tokenData.delta.system.attributes.hp.max = newHp;
    }

    const [newTokenDoc] = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

    if (newTokenDoc?.actor) {
        await newTokenDoc.actor.update({
            "system.attributes.hp.value": newHp,
            "system.attributes.hp.max": newHp,
            "system.traits.size": newSize
        });
    }

    if (DEBUG) {
        console.log(`${LOG_PREFIX} === DATOS NUEVA DIVISIÓN CREADA ===`, LOG_STYLE, {
            nombre: newTokenDoc.actor.name,
            uuidNuevoToken: newTokenDoc.uuid,
            hpAsignado: newTokenDoc.actor.system.attributes.hp.value,
            tamanoAsignado: newTokenDoc.actor.system.traits.size,
            posicionX: spawnX,
            posicionY: spawnY
        });
    }
}

/**
 * Genera un destello estroboscópico de luz en la pantalla del cliente.
 * Se exporta para su registro automático en socketlib mediante scripts/sockets.js.
 */
export async function reproducirFogonazoRelampago() {
    const DEBUG = true;

    const logDebug = (msg, ...args) => {
        if (DEBUG) {
            console.log(`%c[RELÁMPAGO FX]%c ${msg}`, "color: #00d2ff; font-weight: bold;", "color: inherit;", ...args);
        }
    };

    const logError = (msg, ...args) => {
        console.error(`%c[RELÁMPAGO FX ERROR]%c ${msg}`, "color: #ff3333; font-weight: bold;", "color: inherit;", ...args);
    };

    logDebug("Iniciando secuencia estroboscópica de relámpago en el cliente...");

    // Limpieza preventiva
    const prevOverlay = document.getElementById("antua-lightning-flash");
    if (prevOverlay) prevOverlay.remove();

    // Creación del overlay
    const overlay = document.createElement("div");
    overlay.id = "antua-lightning-flash";

    Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#e6f2ff",
        pointerEvents: "none",
        zIndex: "99999",
        opacity: "0",
        transition: "opacity 0.03s ease-in-out",
        mixBlendMode: "screen"
    });

    document.body.appendChild(overlay);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
        // Secuencia estroboscópica
        overlay.style.opacity = "0.80";
        await sleep(40);

        overlay.style.opacity = "0.15";
        await sleep(30);

        overlay.style.opacity = "1.0";
        await sleep(85);

        overlay.style.opacity = "0.25";
        await sleep(35);

        overlay.style.opacity = "0.60";
        await sleep(40);

        overlay.style.transition = "opacity 0.35s ease-out";
        overlay.style.opacity = "0";
        await sleep(360);

        logDebug("Secuencia de relámpago finalizada.");
    } catch (err) {
        logError("Error durante la animación del relámpago:", err);
    } finally {
        if (overlay?.parentNode) {
            overlay.remove();
        }
    }
}