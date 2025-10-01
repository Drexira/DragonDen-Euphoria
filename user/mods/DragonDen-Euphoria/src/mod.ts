/* eslint-disable @typescript-eslint/naming-convention */

import { DependencyContainer } from "tsyringe";
import * as fs from "fs";
import * as path from "path";

// SPT types
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";;
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ITraderAssort, ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { ITraderConfig, IUpdateTime } from "@spt/models/spt/config/ITraderConfig";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { CustomHideoutCraftService } from "./CustomHideoutCraftService";
import type { ItemHelper } from "@spt/helpers/ItemHelper";

import { WTTInstanceManager } from "./WTTInstanceManager";
import { CustomItemService } from "./CustomItemService";
import { CustomProfileEdition } from "./CustomProfileEdition";

import * as modConfig from "../config/mod_config.json";

// New trader settings
import * as baseJson from "../db/base.json";
import { Traders } from "@spt/models/enums/Traders";
import * as assortJson from "../db/assort.json";

class SampleTrader implements IPreSptLoadMod, IPostDBLoadMod {
    mod: string
    logger: ILogger
    private configServer: ConfigServer;
    private ragfairConfig: IRagfairConfig; 
    
    //Groovey said it was okay
    private Instance: WTTInstanceManager = new WTTInstanceManager();
    private customItemService: CustomItemService = new CustomItemService();
    private customHideoutCraftService: CustomHideoutCraftService = new CustomHideoutCraftService();
    private customProfileEdition: CustomProfileEdition = new CustomProfileEdition();
    private itemHelper: ItemHelper;
    private version: string;
    private modName = "DragonDen-Euphoria";
    private config;
    
    debug = false;

    public preSptLoad(container: DependencyContainer): void 
    {
        this.Instance.preSptLoad(container, this.modName);
        this.Instance.debug = this.debug;
        const PreSptModLoader: PreSptModLoader = container.resolve<PreSptModLoader>("PreSptModLoader");
        const imageRouter: ImageRouter = container.resolve<ImageRouter>("ImageRouter");
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const traderConfig: ITraderConfig = configServer.getConfig<ITraderConfig>(ConfigTypes.TRADER);
        this.itemHelper = container.resolve<ItemHelper>("ItemHelper");
        
        this.getVersionFromJson();
        //this.displayCreditBanner();

        this.registerProfileImage(PreSptModLoader, imageRouter);
        Traders[baseJson._id] = baseJson._id
        this.setupTraderUpdateTime(traderConfig);
        this.customItemService.preSptLoad(this.Instance);

        this.customHideoutCraftService.preSptLoad(this.Instance);
        this.customProfileEdition.preSptLoad(this.Instance);
    }

    public postDBLoad(container: DependencyContainer): void 
    {
        this.Instance.postDBLoad(container);
        this.configServer = container.resolve("ConfigServer");
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const jsonUtil: JsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const tables = databaseServer.getTables();
        const restrInRaid = tables.globals.config.RestrictionsInRaid;

        this.addTraderToDb(baseJson, tables, jsonUtil);
        this.customItemService.postDBLoad();

        this.addTraderToLocales(tables, baseJson.name, baseJson.nickname, baseJson.nickname, baseJson.location, baseJson.description);
        this.ragfairConfig.traders[baseJson._id] = true;
        this.customHideoutCraftService.postDBLoad(container);
        this.customProfileEdition.postDBLoad(container);
        
        this.adjustItemProperties(tables.templates.items);
        //this.logAllLootLocationPrefixes();
    }

    private logAllLootLocationPrefixes() {
        const locations = this.Instance.database.locations as Record<string, any>;

        for (const locationID in locations) {
            if (!Object.prototype.hasOwnProperty.call(locations, locationID)) continue;

            const location = locations[locationID];
            const mapName = location?.base?.Name ?? "Unknown";
            const spawnpoints = location?.looseLoot?.spawnpoints as any[] | undefined;

            if (!Array.isArray(spawnpoints) || spawnpoints.length === 0) {
                console.log(`[${locationID}] (${mapName}) No spawnpoints found`);
                continue;
            }

            const tags = new Set<string>();

            for (const sp of spawnpoints) {
                const tpl = sp?.template;
                if (!tpl?.Id) continue;

                // take part before first bracket
                const left = this.leftOfBracket(tpl.Id);
                // normalize but keep separators for readability
                const norm = left.trim().toLowerCase();

                // e.g. "lootpoint (3)" -> "lootpoint"
                const prefix = norm.split(" ")[0];
                if (prefix) tags.add(prefix);
            }

            const tagList = Array.from(tags).sort().join(", ");
            console.log(`[${locationID}] (${mapName}) Possible LootLocation tags: ${tagList}`);
        }
    }

    private leftOfBracket(s: string): string {
        const i = s.indexOf("[");
        return i > -1 ? s.slice(0, i).trim() : s.trim();
    }

    private registerProfileImage(PreSptModLoader: PreSptModLoader, imageRouter: ImageRouter): void
    {
        const imageFilepath = `./${PreSptModLoader.getModPath(this.modName)}res`;
        imageRouter.addRoute(baseJson.avatar.replace(".png", ""), `${imageFilepath}/Euphoria.png`);
    }

    private setupTraderUpdateTime(traderConfig: ITraderConfig): void
    {
        const traderRefreshRecord: IUpdateTime = {
            traderId: baseJson._id,
            seconds: {min: 3000, max: 9000},
        };
        traderConfig.updateTime.push(traderRefreshRecord);
    }

    private addTraderToDb(Euphoria: any, tables: IDatabaseTables, jsonUtil: JsonUtil): void
    {
        tables.traders[Euphoria._id] = {
            assort: jsonUtil.deserialize(jsonUtil.serialize(assortJson)) as ITraderAssort,
            base: jsonUtil.deserialize(jsonUtil.serialize(Euphoria)) as ITraderBase,
            questassort: {
                started: {},
                success: {
                    // Ammo bouta loose it - Part 1
                    //ID to Unlock - Quest ID
                    //"68dc881f8b8d06213dd8a755": "68cecb1d1f236c62e1c0ea85",
                },
                fail: {}
            }
        };
    }

    private addTraderToLocales(tables: IDatabaseTables, fullName: string, firstName: string, nickName: string, location: string, description: string,)
    {
        // For each language, add locale for the new trader
        const locales = Object.values(tables.locales.global) as Record<string, string>[];
        for (const locale of locales) {
            locale[`${baseJson._id} FullName`] = fullName;
            locale[`${baseJson._id} FirstName`] = firstName;
            locale[`${baseJson._id} Nickname`] = nickName;
            locale[`${baseJson._id} Location`] = location;
            locale[`${baseJson._id} Description`] = description;
        }
    }

    adjustItemProperties(dbItems: Record<string, ITemplateItem>){
        for (const [_, item] of Object.entries(dbItems)){
            // Skip anything that isn't specifically an Item type item
            if (item._type !== "Item")
            {
                continue;
            }
        }
    }

    private getVersionFromJson(): void 
    {
        const packageJsonPath = path.join(__dirname, "../package.json");

        fs.readFile(packageJsonPath, "utf-8", (err, data) => 
        {
            if (err) 
            {
                console.error("Error reading file:", err);
                return;
            }

            const jsonData = JSON.parse(data);
            this.version = jsonData.version;
        });
    }

    public colorLog(message: string, color: string) {
        const colorCodes = {
            red: "\x1b[31m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            blue: "\x1b[34m",
            magenta: "\x1b[35m",
            cyan: "\x1b[36m",
            white: "\x1b[37m",
            gray: "\x1b[90m",
            brightRed: "\x1b[91m",
            brightGreen: "\x1b[92m",
            brightYellow: "\x1b[93m",
            brightBlue: "\x1b[94m",
            brightMagenta: "\x1b[95m",
            brightCyan: "\x1b[96m",
            brightWhite: "\x1b[97m"
        };
      
        const resetCode = "\x1b[0m";
        const colorCode = colorCodes[color as keyof typeof colorCodes] || "\x1b[37m"; // Default to white if color is invalid.
        console.log(`${colorCode}${message}${resetCode}`); // Log the colored message here
    }
}
module.exports = { mod: new SampleTrader() }