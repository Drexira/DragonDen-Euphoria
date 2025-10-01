/* eslint-disable @typescript-eslint/naming-convention */
import { DependencyContainer } from "tsyringe";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { WTTInstanceManager } from "./WTTInstanceManager";
import * as fs from "fs";
import * as path from "path";

export class CustomHideoutCraftService {
    private Instance: WTTInstanceManager;

    constructor() {}

    public preSptLoad(Instance: WTTInstanceManager): void {
        this.Instance = Instance;
    }

    public postDBLoad(container: DependencyContainer): void {
        const logger = container.resolve<ILogger>("WinstonLogger")
        const db = this.Instance.database
        const hideoutProduction = db.hideout.production.recipes
        let count = 0

        const hideoutCraftsDir = path.resolve(__dirname, "../db/hideoutCrafts")
        if (!fs.existsSync(hideoutCraftsDir)) return

        const files = fs.readdirSync(hideoutCraftsDir)
        if (!files || files.length === 0) return

        for (const file of files) {
            const filePath = path.join(hideoutCraftsDir, file)
            if (path.extname(filePath) !== ".json") continue

            let parsed
            try {
                parsed = this.Instance.jsonUtil.deserialize(fs.readFileSync(filePath, "utf-8"))
            } catch {
                logger.error(`[DragonDen-Euphoria] Bad JSON: ${file}`)
                continue
            }

            let items: any[] = []
            if (Array.isArray(parsed)) items = parsed
            else if (parsed && Array.isArray(parsed.recipes)) items = parsed.recipes
            else if (parsed && typeof parsed === "object") items = [parsed]

            if (items.length === 0) continue

            hideoutProduction.push(...items)
            count += items.length
        }

        logger.log(`[DragonDen-Euphoria] Added ${count} custom Hideout Crafts.`, "magenta")
    }

}
