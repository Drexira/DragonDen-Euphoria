/* eslint-disable @typescript-eslint/naming-convention */
import { DependencyContainer } from "tsyringe";
import { WTTInstanceManager } from "./WTTInstanceManager";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

export class CustomProfileEdition {
    private Instance: WTTInstanceManager;

    constructor() {}

    public preSptLoad(Instance: WTTInstanceManager): void {
        this.Instance = Instance;
    }

    public postDBLoad(container: DependencyContainer): void {
        const logger = container.resolve<ILogger>("WinstonLogger");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();

        const profilesPath = join(__dirname, "../db/profileEditions");
        const profileFolders = readdirSync(profilesPath).filter(folder =>
            statSync(join(profilesPath, folder)).isDirectory()
        );

        profileFolders.forEach(folder => {
            const infoPath = join(profilesPath, folder, "info.json");
            if (!this.fileExists(infoPath)) {
                logger.error(`[DragonDen-Euphoria] Missing info.json in ${folder}. Skipping profile.`);
                return;
            }

            const profileInfo = JSON.parse(readFileSync(infoPath, "utf-8"));
            if (profileInfo.enabled) {
                this.addProfile(
                    tables,
                    logger,
                    profileInfo.name,
                    folder,
                    profileInfo.copyEdition,
                    profileInfo.gameVersion,
                    profileInfo.experience,
                    profileInfo.level
                );
            }
        });
    }

    private addProfile(tables: any, logger: ILogger, profileName: string, folder: string, copyEdition: string, gameVersion: string, experience: any, level: any): void {
        const templateProfile = tables.templates.profiles[copyEdition];
        const newProfile = JSON.parse(JSON.stringify(templateProfile));
        const profilePath = join(__dirname, "../db/profileEditions", folder);

        const bearInventoryData = this.loadJSON(join(profilePath, "bear_inventory.json"));
        const usecInventoryData = this.loadJSON(join(profilePath, "usec_inventory.json"));
        const traderStanding = this.loadJSON(join(profilePath, "traders.json"));
        const description = this.loadJSON(join(profilePath, "descLocale.json"));
        const skills = this.loadJSON(join(profilePath, "skills.json"));
        const quests = this.loadJSON(join(profilePath, "quests.json"));
        const bonuses = this.loadJSON(join(profilePath, "bonuses.json"));
        const hideout = this.loadJSON(join(profilePath, "hideout.json"));

        newProfile.usec.character.Inventory = usecInventoryData;
        newProfile.bear.character.Inventory = bearInventoryData;
        newProfile.usec.trader = traderStanding;
        newProfile.bear.trader = traderStanding;
        newProfile.descriptionLocaleKey = description;
        newProfile.usec.character.Skills = skills;
        newProfile.bear.character.Skills = skills;
        newProfile.quests = quests;
        newProfile.usec.character.Bonuses = bonuses;
        newProfile.bear.character.Bonuses = bonuses;
        newProfile.usec.character.Hideout = hideout;
        newProfile.bear.character.Hideout = hideout;
        newProfile.usec.character.Info.GameVersion = gameVersion;
        newProfile.bear.character.Info.GameVersion = gameVersion;
        newProfile.usec.character.Info.Experience = experience;
        newProfile.bear.character.Info.Experience = experience;
        newProfile.usec.character.Info.Level = level;
        newProfile.bear.character.Info.Level = level;

        tables.templates.profiles[profileName] = newProfile;
        logger.log(`[DragonDen-Euphoria] Added ${profileName} profile.`, "magenta");
    }

    private loadJSON(filePath: string): any {
        if (!this.fileExists(filePath)) return {};
        return JSON.parse(readFileSync(filePath, "utf-8"));
    }

    private fileExists(path: string): boolean {
        try {
            return statSync(path).isFile();
        } catch {
            return false;
        }
    }
}
